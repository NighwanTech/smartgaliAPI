import assert from 'assert';
import fs from 'fs';
import path from 'path';
import http from 'http';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import jwt from 'jsonwebtoken';
import sequelize, { connectDB } from '../config/db.js';
import env from '../config/env.js';
import app from '../app.js';
import User from '../modules/user/user.model.js';
import BusinessCategory from '../modules/business_category/business_category.model.js';
import BusinessProfile from '../modules/business_profile/business_profile.model.js';
import BusinessCategoryKycRule from '../modules/business_kyc/business_kyc_rule.model.js';
import BusinessDocument from '../modules/business_kyc/business_document.model.js';
import * as businessKycService from '../modules/business_kyc/business_kyc.service.js';

let passed = 0;
let failed = 0;

async function testCase(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name} -> ${err.message}`);
    failed++;
  }
}

async function apiJson(baseUrl, method, urlPath, { token, body } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function main() {
  await connectDB();
  await businessKycService.ensureBusinessKycReady();

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const ts = Date.now();
  const createdUserIds = [];
  const createdBusinessIds = [];
  const createdRuleIds = [];
  const createdCatIds = [];
  const uploadedDiskFiles = [];

  try {
    const ownerUser = await User.create({
      userName: `kyc_owner_${ts}`,
      email: `kyc_owner_${ts}@smartgali.test`,
      phone: `98${String(ts).slice(-8)}`,
      password: 'TestPassword123!',
      userRole: 'Resident',
      is_active: true,
      status: 'active',
    });
    createdUserIds.push(ownerUser.userId);

    const otherUser = await User.create({
      userName: `kyc_other_${ts}`,
      email: `kyc_other_${ts}@smartgali.test`,
      phone: `97${String(ts).slice(-8)}`,
      password: 'TestPassword123!',
      userRole: 'Resident',
      is_active: true,
      status: 'active',
    });
    createdUserIds.push(otherUser.userId);

    const adminUser = await User.create({
      userName: `kyc_admin_${ts}`,
      email: `kyc_admin_${ts}@smartgali.test`,
      phone: `96${String(ts).slice(-8)}`,
      password: 'TestPassword123!',
      userRole: 'super_admin',
      is_active: true,
      status: 'active',
    });
    createdUserIds.push(adminUser.userId);

    const ownerToken = jwt.sign(
      { id: ownerUser.userId, userId: ownerUser.userId, userRole: 'Resident' },
      env.jwt.secret,
      { expiresIn: '1h' }
    );
    const otherToken = jwt.sign(
      { id: otherUser.userId, userId: otherUser.userId, userRole: 'Resident' },
      env.jwt.secret,
      { expiresIn: '1h' }
    );
    const adminToken = jwt.sign(
      { id: adminUser.userId, userId: adminUser.userId, userRole: 'super_admin' },
      env.jwt.secret,
      { expiresIn: '1h' }
    );

    const groceryCat = await BusinessCategory.findOne({ where: { name: 'Grocery', is_deleted: false } });
    const fashionCat = await BusinessCategory.findOne({ where: { name: 'Fashion', is_deleted: false } });
    const hardwareCat = await BusinessCategory.findOne({ where: { name: 'Hardware', is_deleted: false } });
    assert(groceryCat && fashionCat && hardwareCat, 'Expected seeded categories Grocery, Fashion, Hardware');

    // 1. Layer 1 + Layer 2 requirements for Grocery include FSSAI_LICENSE (mandatory + expiry)
    await testCase('1. Grocery resolves Layer 1 Common + Layer 2 FSSAI mandatory rule', async () => {
      const res = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-kyc/requirements?category_id=${groceryCat.id}`
      );
      assert.strictEqual(res.status, 200);
      const data = res.body.data;
      assert(data.layer1_common_count >= 4, 'Expected >= 4 common docs');
      assert(data.layer2_category_count >= 1, 'Expected >= 1 grocery category doc');
      const codes = data.documents.map((d) => d.doc_code);
      assert(codes.includes('OWNER_PAN'));
      assert(codes.includes('SHOP_FRONT_PHOTO'));
      assert(codes.includes('GST_CERTIFICATE'));
      assert(codes.includes('CANCELLED_CHEQUE'));
      assert(codes.includes('FSSAI_LICENSE'));
      const fssai = data.documents.find((d) => d.doc_code === 'FSSAI_LICENSE');
      assert.strictEqual(fssai.layer, 'category');
      assert.strictEqual(fssai.is_mandatory, true);
      assert.strictEqual(fssai.requires_expiry, true);
      assert.strictEqual(fssai.needs_number, true);
    });

    // 2. GST Exempt hides GST_CERTIFICATE cleanly
    await testCase('2. GST Exempt=true removes GST_CERTIFICATE from active required docs', async () => {
      const res = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-category/${groceryCat.id}/kyc-requirements?gst_exempt=true`
      );
      assert.strictEqual(res.status, 200);
      const codes = res.body.data.documents.map((d) => d.doc_code);
      assert(!codes.includes('GST_CERTIFICATE'), 'GST_CERTIFICATE should not be requested when gst_exempt=true');
      assert(codes.includes('FSSAI_LICENSE'));
    });

    // 3. Fashion + sells_branded_goods dynamically toggles BRAND_AUTH_LETTER
    await testCase('3. Fashion Layer 2 toggles BRAND_AUTH_LETTER via sells_branded_goods flag', async () => {
      const resNoBrand = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-kyc/requirements?category_id=${fashionCat.id}&sells_branded_goods=false`
      );
      const codesNo = resNoBrand.body.data.documents.map((d) => d.doc_code);
      assert(!codesNo.includes('FSSAI_LICENSE'), 'Fashion must not require FSSAI');
      assert(!codesNo.includes('BRAND_AUTH_LETTER'), 'Unbranded Fashion hides BRAND_AUTH_LETTER');

      const resBrand = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-kyc/requirements?category_id=${fashionCat.id}&sells_branded_goods=true`
      );
      const codesYes = resBrand.body.data.documents.map((d) => d.doc_code);
      assert(codesYes.includes('BRAND_AUTH_LETTER'), 'Branded Fashion must require BRAND_AUTH_LETTER');
    });

    // 4. Real multipart file upload saves to uploads/business-documents/
    let uploadedDocUrl = null;
    await testCase('4. Multipart KYC upload persists PNG file to /uploads/business-documents/', async () => {
      const pngBytes = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
        'hex'
      );
      const form = new FormData();
      form.append('doc_code', 'OWNER_PAN');
      form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'pan_scan.png');
      const rawRes = await fetch(`${baseUrl}/api/v1/business-kyc/upload-document`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: form,
      });
      const res = { status: rawRes.status, body: await rawRes.json() };

      assert.strictEqual(res.status, 201);
      assert(res.body.data.url.includes('/uploads/business-documents/'));
      uploadedDocUrl = res.body.data.url;
      const diskPath = path.resolve(env.uploadsPath, 'business-documents', res.body.data.filename);
      assert(fs.existsSync(diskPath), 'Uploaded KYC file must exist on disk');
      uploadedDiskFiles.push(diskPath);
    });

    // 5. Server-side validation rejects missing mandatory Layer 2 doc (FSSAI) & expired licence
    const testPan = `AAPKB${String(ts).slice(-4)}T`;
    await testCase('5. Strict KYC blocks submission missing FSSAI or with expired licence', async () => {
      const missingRes = await apiJson(baseUrl, 'POST', '/api/v1/business-profile', {
        token: ownerToken,
        body: {
          businessName: `Strict Test Kirana ${ts}`,
          owner_name: 'Ramesh Kumar',
          category_id: groceryCat.id,
          phone: '9876543210',
          email: 'ramesh@smartgali.test',
          address: 'Main Road',
          city_name: 'Patna',
          locality_name: 'Kankarbagh',
          pincode: '800020',
          pan_number: testPan,
          gst_exempt: true,
          strict_kyc: true,
          documents: [
            { doc_code: 'OWNER_PAN', doc_number: testPan, file_url: uploadedDocUrl },
            { doc_code: 'SHOP_FRONT_PHOTO', file_url: uploadedDocUrl },
            { doc_code: 'CANCELLED_CHEQUE', file_url: uploadedDocUrl },
          ],
        },
      });
      assert.strictEqual(missingRes.status, 400);
      assert(missingRes.body.message.toLowerCase().includes('fssai'), 'Expected FSSAI missing error');

      const expiredRes = await apiJson(baseUrl, 'POST', '/api/v1/business-profile', {
        token: ownerToken,
        body: {
          businessName: `Expired Kirana ${ts}`,
          owner_name: 'Ramesh Kumar',
          category_id: groceryCat.id,
          phone: '9876543210',
          email: 'ramesh@smartgali.test',
          address: 'Main Road',
          city_name: 'Patna',
          locality_name: 'Kankarbagh',
          pincode: '800020',
          pan_number: testPan,
          gst_exempt: true,
          strict_kyc: true,
          documents: [
            { doc_code: 'OWNER_PAN', doc_number: testPan, file_url: uploadedDocUrl },
            { doc_code: 'SHOP_FRONT_PHOTO', file_url: uploadedDocUrl },
            { doc_code: 'CANCELLED_CHEQUE', file_url: uploadedDocUrl },
            {
              doc_code: 'FSSAI_LICENSE',
              doc_number: '12345678901234',
              expiry_date: '2020-01-01',
              file_url: uploadedDocUrl,
            },
          ],
        },
      });
      assert.strictEqual(expiredRes.status, 400);
      assert(expiredRes.body.message.toLowerCase().includes('expired'), 'Expected expired licence error');
    });

    // 6. Full valid submission saves BusinessProfile + BusinessDocuments in MariaDB
    let createdBusinessId = null;
    let fssaiDocId = null;
    await testCase('6. Complete valid enterprise registration persists profile + Layer 1 & 2 docs to DB', async () => {
      const res = await apiJson(baseUrl, 'POST', '/api/v1/business-profile', {
        token: ownerToken,
        body: {
          businessName: `Patna Organic Bakery ${ts}`,
          owner_name: 'Suman Devi',
          legal_entity_type: 'proprietorship',
          category_id: groceryCat.id,
          phone: '9876543210',
          email: 'suman@smartgali.test',
          address: 'Shop 12, Boring Road',
          city_name: 'Patna',
          locality_name: 'Boring Road',
          pincode: '800001',
          latitude: 25.61,
          longitude: 85.11,
          pan_number: testPan,
          gst_exempt: true,
          sells_branded_goods: false,
          bank_account_name: 'Suman Devi',
          bank_account_number: '123456789012',
          bank_ifsc: 'SBIN0001234',
          upi_id: 'suman@okaxis',
          terms_accepted: true,
          strict_kyc: true,
          documents: [
            { doc_code: 'OWNER_PAN', doc_number: testPan, file_url: uploadedDocUrl, file_name: 'pan.png' },
            { doc_code: 'SHOP_FRONT_PHOTO', file_url: uploadedDocUrl, file_name: 'shop.png' },
            { doc_code: 'CANCELLED_CHEQUE', file_url: uploadedDocUrl, file_name: 'cheque.png' },
            {
              doc_code: 'FSSAI_LICENSE',
              doc_number: '12345678901234',
              expiry_date: '2028-12-31',
              file_url: uploadedDocUrl,
              file_name: 'fssai.png',
            },
          ],
        },
      });

      assert.strictEqual(res.status, 201);
      const prof = res.body.data;
      createdBusinessId = prof.id;
      createdBusinessIds.push(createdBusinessId);
      assert.strictEqual(prof.owner_name, 'Suman Devi');
      assert.strictEqual(prof.pan_number, testPan);
      assert.strictEqual(prof.gst_exempt, true);
      assert.strictEqual(prof.bank_ifsc, 'SBIN0001234');
      assert.strictEqual(prof.verification_status, 'pending');
      assert.strictEqual(prof.documents.length, 4);
      const fssai = prof.documents.find((d) => d.doc_code === 'FSSAI_LICENSE');
      assert(fssai && fssai.id);
      fssaiDocId = fssai.id;
    });

    // 7. Privacy check: Public & Other user cannot read private PAN/Bank/Docs; Owner & Admin CAN
    await testCase('7. Privacy gating strips PAN/Bank/Docs from public GET and blocks unauthorized /documents', async () => {
      const pubRes = await apiJson(baseUrl, 'GET', `/api/v1/business-profile/${createdBusinessId}`);
      assert.strictEqual(pubRes.status, 200);
      assert.strictEqual(pubRes.body.data.pan_number, undefined);
      assert.strictEqual(pubRes.body.data.bank_account_number, undefined);
      assert.strictEqual(pubRes.body.data.documents, undefined);

      const otherDocsRes = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-profile/${createdBusinessId}/documents`,
        { token: otherToken }
      );
      assert.strictEqual(otherDocsRes.status, 403);

      const ownerDocsRes = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-profile/${createdBusinessId}/documents`,
        { token: ownerToken }
      );
      assert.strictEqual(ownerDocsRes.status, 200);
      assert.strictEqual(ownerDocsRes.body.data.length, 4);
    });

    // 8. Admin creates custom dynamic rule for a custom category & per-document verification works
    await testCase('8. Admin dynamic rule creation + per-document KYC verification updates DB cleanly', async () => {
      const customCat = await BusinessCategory.create({
        name: `Pet Pharmacy ${ts}`,
        is_active: true,
      });
      createdCatIds.push(customCat.id);

      const createRuleRes = await apiJson(baseUrl, 'POST', '/api/v1/business-kyc/rules', {
        token: adminToken,
        body: {
          doc_code: `VET_PERMIT_${ts}`,
          title: 'Veterinary Drug Permit',
          layer: 'category',
          category_id: customCat.id,
          is_mandatory: true,
          needs_number: true,
          number_label: 'Vet Permit No',
          requires_expiry: true,
        },
      });
      assert.strictEqual(createRuleRes.status, 201);
      createdRuleIds.push(createRuleRes.body.data.id);

      const dynReq = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-kyc/requirements?category_id=${customCat.id}`
      );
      assert.strictEqual(dynReq.status, 200);
      assert(dynReq.body.data.documents.some((d) => d.doc_code === `VET_PERMIT_${ts}`));

      const verifyDocRes = await apiJson(
        baseUrl,
        'PUT',
        `/api/v1/business-kyc/documents/${fssaiDocId}/verify`,
        {
          token: adminToken,
          body: { status: 'verified', admin_remark: 'FSSAI verified on portal' },
        }
      );
      assert.strictEqual(verifyDocRes.status, 200);
      assert.strictEqual(verifyDocRes.body.data.status, 'verified');

      const approveRes = await apiJson(
        baseUrl,
        'PUT',
        `/api/v1/business-profile/${createdBusinessId}/approve`,
        {
          token: adminToken,
          body: { updated_by: adminUser.userId },
        }
      );
      assert.strictEqual(approveRes.status, 200);
      assert.strictEqual(approveRes.body.data.is_verified, true);
      assert.strictEqual(approveRes.body.data.verification_status, 'approved');
    });

    let rejectedTargetId = null;

    // 9. Non-admin self-approval stripped + non-admin approve endpoint blocked (403)
    await testCase('9. Self-approval tampering stripped and non-admin approve blocked (403)', async () => {
      const uniquePan = `ZZZPK${String(ts).slice(-4)}Z`;
      const createRes = await apiJson(baseUrl, 'POST', '/api/v1/business-profile', {
        token: otherToken,
        body: {
          businessName: `SelfApproveAttempt ${ts}`,
          owner_name: 'Suresh Verma',
          category_id: hardwareCat.id,
          phone: '9811122233',
          email: `suresh_${ts}@smartgali.test`,
          address: 'Boring Road',
          city_name: 'Patna',
          locality_name: 'Boring Road',
          pincode: '800001',
          pan_number: uniquePan,
          gst_exempt: true,
          is_verified: true,
          verification_status: 'approved',
          is_featured: true,
          verified_by: otherUser.userId,
        },
      });
      assert.strictEqual(createRes.status, 201);
      rejectedTargetId = createRes.body.data.id;
      createdBusinessIds.push(rejectedTargetId);
      assert.strictEqual(createRes.body.data.is_verified, false);
      assert.notStrictEqual(createRes.body.data.verification_status, 'approved');
      assert.strictEqual(Boolean(createRes.body.data.is_featured), false);

      const tamperUpdate = await apiJson(
        baseUrl,
        'PUT',
        `/api/v1/business-profile/${rejectedTargetId}`,
        {
          token: otherToken,
          body: {
            is_verified: true,
            verification_status: 'approved',
          },
        }
      );
      assert.strictEqual(tamperUpdate.status, 200);
      assert.strictEqual(tamperUpdate.body.data.is_verified, false);
      assert.notStrictEqual(tamperUpdate.body.data.verification_status, 'approved');

      const nonAdminApprove = await apiJson(
        baseUrl,
        'PUT',
        `/api/v1/business-profile/${rejectedTargetId}/approve`,
        { token: otherToken }
      );
      assert.strictEqual(nonAdminApprove.status, 403);

      const rejectRes = await apiJson(
        baseUrl,
        'PUT',
        `/api/v1/business-profile/${rejectedTargetId}/reject`,
        {
          token: adminToken,
          body: { reason: 'Shop board blurred' },
        }
      );
      assert.strictEqual(rejectRes.status, 200);
      assert.strictEqual(rejectRes.body.data.verification_status, 'rejected');
      assert.strictEqual(rejectRes.body.data.is_verified, false);
    });

    // 10. Private KYC file under /uploads/business-documents blocks guest (401) & outsider (403)
    await testCase('10. /uploads/business-documents requires owner or admin auth (401/403 vs 200)', async () => {
      const docPath = new URL(uploadedDocUrl).pathname;
      const guestFetch = await fetch(`${baseUrl}${docPath}`);
      assert.strictEqual(guestFetch.status, 401);

      const outsiderFetch = await fetch(`${baseUrl}${docPath}`, {
        headers: { Authorization: `Bearer ${otherToken}` },
      });
      assert.strictEqual(outsiderFetch.status, 403);

      const ownerFetch = await fetch(`${baseUrl}${docPath}`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      assert.strictEqual(ownerFetch.status, 200);

      const adminFetch = await fetch(`${baseUrl}${docPath}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(adminFetch.status, 200);
    });

    // 11. Duplicate PAN rejected with 409
    await testCase('11. Duplicate PAN registration blocked with 409 Conflict', async () => {
      const detailRes = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-profile/${createdBusinessId}`,
        { token: ownerToken }
      );
      assert.strictEqual(detailRes.status, 200);
      const existingPan = detailRes.body.data.pan_number;
      assert(existingPan, 'Expected pan_number on owner business profile');

      const dupRes = await apiJson(baseUrl, 'POST', '/api/v1/business-profile', {
        token: otherToken,
        body: {
          businessName: `Duplicate PAN Store ${ts}`,
          owner_name: 'Dup Owner',
          category_id: hardwareCat.id,
          phone: '9822233344',
          email: `dup_${ts}@smartgali.test`,
          address: 'Main Road',
          city_name: 'Patna',
          locality_name: 'Kankarbagh',
          pincode: '800020',
          pan_number: existingPan,
          gst_exempt: true,
        },
      });
      assert.strictEqual(dupRes.status, 409);
    });

    // 12. Product KYC gate + rejected document resubmit transitions rejected -> under_review
    await testCase('12. Rejected store blocked (403) from creating products; doc resubmit moves to under_review', async () => {
      const blockedProd = await apiJson(baseUrl, 'POST', '/api/v1/business-product', {
        token: otherToken,
        body: {
          business_id: rejectedTargetId,
          name: `RejectedStoreItem_${ts}`,
          sku: `SKU-REJ-${ts}`,
          price: 120,
        },
      });
      assert.strictEqual(blockedProd.status, 403);

      const resubmitRes = await apiJson(
        baseUrl,
        'POST',
        `/api/v1/business-profile/${rejectedTargetId}/documents`,
        {
          token: otherToken,
          body: {
            documents: [
              {
                doc_code: 'OWNER_PAN',
                doc_number: `ZZZPK${String(ts).slice(-4)}Z`,
                file_url: uploadedDocUrl,
              },
            ],
          },
        }
      );
      assert.strictEqual(resubmitRes.status, 201);

      const afterResubmit = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-profile/${rejectedTargetId}`,
        { token: otherToken }
      );
      assert.strictEqual(afterResubmit.status, 200);
      assert.strictEqual(afterResubmit.body.data.verification_status, 'under_review');

      const pendingProd = await apiJson(baseUrl, 'POST', '/api/v1/business-product', {
        token: otherToken,
        body: {
          business_id: rejectedTargetId,
          name: `PendingStoreItem_${ts}`,
          sku: `SKU-PEND-${ts}`,
          price: 199,
        },
      });
      assert.strictEqual(pendingProd.status, 201);
      assert.strictEqual(pendingProd.body.data.approval_status, 'pending');

      const publicRes = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-product/public/nearby?search=PendingStoreItem_${ts}`
      );
      assert.strictEqual(publicRes.status, 200);
      const listed = Array.isArray(publicRes.body.data)
        ? publicRes.body.data
        : (publicRes.body.data?.products || publicRes.body.data?.rows || []);
      assert(
        !listed.some((p) => Number(p.id) === Number(pendingProd.body.data.id)),
        'Unverified store product must not appear in public nearby search'
      );
    });

    // 13. Verified seller editing sensitive tax/bank field triggers Re-KYC (is_verified: false, under_review)
    await testCase('13. Verified seller editing bank_ifsc triggers Re-KYC (under_review)', async () => {
      const beforeRes = await apiJson(
        baseUrl,
        'GET',
        `/api/v1/business-profile/${createdBusinessId}`,
        { token: ownerToken }
      );
      assert.strictEqual(beforeRes.status, 200);
      assert.strictEqual(beforeRes.body.data.is_verified, true);

      const newIfsc = beforeRes.body.data.bank_ifsc === 'HDFC0009999'
        ? 'ICIC0008888'
        : 'HDFC0009999';

      const updateRes = await apiJson(
        baseUrl,
        'PUT',
        `/api/v1/business-profile/${createdBusinessId}`,
        {
          token: ownerToken,
          body: { bank_ifsc: newIfsc },
        }
      );
      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.body.data.is_verified, false);
      assert.strictEqual(updateRes.body.data.verification_status, 'under_review');
    });
  } finally {
    if (createdBusinessIds.length > 0) {
      await BusinessProfile.sequelize.models.BusinessProduct.destroy({
        where: { business_id: createdBusinessIds },
        force: true,
      }).catch(() => {});
      await BusinessDocument.destroy({ where: { business_id: createdBusinessIds }, force: true }).catch(() => {});
      await BusinessProfile.destroy({ where: { id: createdBusinessIds }, force: true }).catch(() => {});
    }
    if (createdRuleIds.length > 0) {
      await BusinessCategoryKycRule.destroy({ where: { id: createdRuleIds }, force: true }).catch(() => {});
    }
    if (createdCatIds.length > 0) {
      await BusinessCategory.destroy({ where: { id: createdCatIds }, force: true }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await User.destroy({ where: { userId: createdUserIds }, force: true }).catch(() => {});
    }
    for (const f of uploadedDiskFiles) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch (_) {}
    }
    await new Promise((resolve) => server.close(resolve));
    await sequelize.close();
  }

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
