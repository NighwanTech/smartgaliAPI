import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

import app from '../src/app.js';
import env from '../src/config/env.js';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import BusinessCategory from '../src/modules/business_category/business_category.model.js';
import BusinessProfile from '../src/modules/business_profile/business_profile.model.js';
import { removeLocalUpload } from '../src/utils/fileUpload.js';

const CREATED = {
  users: [],
  businesses: [],
  uploadedUrls: [],
};

let server;
let baseUrl;

const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);
const TINY_JPEG = Buffer.from('ffd8ffe000104a46494600010101004800480000ffd9', 'hex');

const signToken = (user) =>
  jwt.sign({ id: user.userId, userRole: user.userRole }, env.jwt.secret, {
    expiresIn: '1h',
  });

const cleanup = async () => {
  for (const url of CREATED.uploadedUrls) {
    await removeLocalUpload(url).catch(() => {});
  }
  if (CREATED.businesses.length > 0) {
    await BusinessProfile.destroy({ where: { id: CREATED.businesses }, force: true });
  }
  if (CREATED.users.length > 0) {
    await User.destroy({ where: { userId: CREATED.users }, force: true });
  }
};

after(async () => {
  await cleanup().catch((err) => console.error('Cleanup error:', err));
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await sequelize.close();
});

test('Business Profile Enterprise E2E: strict tenant isolation, real media uploads, category sync & persistence', async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const suffix = Date.now().toString().slice(-7);
  const ownerA = await User.create({
    userName: `ShopOwnerA_${suffix}`,
    email: `shopownera_${suffix}@example.com`,
    phone: `98${suffix}1`,
    userRole: 'business_owner',
    is_active: true,
    is_deleted: false,
    status: 'active',
  });
  CREATED.users.push(ownerA.userId);

  const ownerB = await User.create({
    userName: `ShopOwnerB_${suffix}`,
    email: `shopownerb_${suffix}@example.com`,
    phone: `97${suffix}2`,
    userRole: 'business_owner',
    is_active: true,
    is_deleted: false,
    status: 'active',
  });
  CREATED.users.push(ownerB.userId);

  const tokenA = signToken(ownerA);
  const tokenB = signToken(ownerB);

  // 1. Unregistered user must get 404 from /me (never leak hardcoded #101 Nike Store)
  const initialMeRes = await fetch(`${baseUrl}/api/v1/business-profile/me`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.equal(initialMeRes.status, 404, 'New user without profile should receive 404 instead of shop #101 leak');

  // 2. Upload Logo (PNG) & Cover Banner (JPEG) to persistent /uploads/business/
  const logoForm = new FormData();
  logoForm.append('mediaType', 'logo');
  logoForm.append('image', new Blob([TINY_PNG], { type: 'application/octet-stream' }), 'shop_logo.png');

  const logoRes = await fetch(`${baseUrl}/api/v1/business-profile/upload-media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: logoForm,
  });
  const logoJson = await logoRes.json();
  assert.equal(logoRes.status, 201, JSON.stringify(logoJson));
  const logoUrl = logoJson.data.url;
  assert.match(logoUrl, /\/uploads\/business\/.*\.png$/);
  CREATED.uploadedUrls.push(logoUrl);

  const bannerForm = new FormData();
  bannerForm.append('mediaType', 'banner');
  bannerForm.append('image', new Blob([TINY_JPEG], { type: 'image/jpg' }), 'shop_banner.jpg');

  const bannerRes = await fetch(`${baseUrl}/api/v1/business-profile/upload-media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA}` },
    body: bannerForm,
  });
  const bannerJson = await bannerRes.json();
  assert.equal(bannerRes.status, 201, JSON.stringify(bannerJson));
  const bannerUrl = bannerJson.data.url;
  assert.match(bannerUrl, /\/uploads\/business\/.*\.jpg$/);
  CREATED.uploadedUrls.push(bannerUrl);

  // Verify HTTP static serving of uploaded business banner/logo
  const staticLogoRes = await fetch(`${baseUrl}${new URL(logoUrl).pathname}`);
  assert.equal(staticLogoRes.status, 200);
  assert.deepEqual(Buffer.from(await staticLogoRes.arrayBuffer()), TINY_PNG);

  // 3. Reject ephemeral blob URLs on POST create
  const rejectedCreateRes = await fetch(`${baseUrl}/api/v1/business-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      business_name: 'Bad Blob Store',
      serviceCategory: 'Fashion',
      logo_url: 'blob:http://localhost:5000/fake-blob-id',
    }),
  });
  assert.equal(rejectedCreateRes.status, 400);

  // Pick a real category from DB to test bidirectional category_id resolution
  const seedCategory = await BusinessCategory.findOne({
    where: { is_deleted: false, is_active: true },
    order: [['id', 'ASC']],
  });
  assert.ok(seedCategory, 'Need at least one active BusinessCategory in DB');

  // 4. Create Owner A business using category name only -> backend resolves category_id automatically
  const createARes = await fetch(`${baseUrl}/api/v1/business-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      business_name: `Apex Kirana ${suffix}`,
      serviceCategory: seedCategory.name.toLowerCase(),
      description: 'Fresh groceries and household staples delivered quickly.',
      phone: '+91 9876501234',
      email: `apex${suffix}@store.in`,
      website: 'https://apexkirana.in',
      logo_url: logoUrl,
      bannerUrl: bannerUrl,
      operating_hours: '8:00 AM - 10:00 PM',
      availability_days: 'Mon - Sat',
      is_open: true,
      city_name: 'Patna',
      locality_name: 'Khagaul',
      pincode: '801105',
      latitude: 25.5812,
      longitude: 85.0556,
      default_radius_km: 15,
    }),
  });
  const createAJson = await createARes.json();
  assert.equal(createARes.status, 201, JSON.stringify(createAJson));
  const profileA = createAJson.data;
  CREATED.businesses.push(profileA.id);

  assert.equal(profileA.category_id, seedCategory.id, 'Category name should resolve category_id');
  assert.equal(profileA.logo_url, logoUrl);
  assert.equal(profileA.bannerUrl, bannerUrl);
  assert.equal(profileA.email, `apex${suffix}@store.in`);
  assert.equal(profileA.website, 'https://apexkirana.in');
  assert.equal(profileA.availability_days, 'Mon - Sat');
  assert.equal(profileA.default_radius_km, 15);
  assert.equal(profileA.is_open, true);

  // Create a second shop owned by Owner B so we test cross-tenant PUT protection even when attacker owns another shop
  const createBRes = await fetch(`${baseUrl}/api/v1/business-profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenB}`,
    },
    body: JSON.stringify({
      business_name: `Other Owner Store ${suffix}`,
      serviceCategory: seedCategory.name,
      city_name: 'Patna',
    }),
  });
  const createBJson = await createBRes.json();
  assert.equal(createBRes.status, 201, JSON.stringify(createBJson));
  CREATED.businesses.push(createBJson.data.id);

  // 5. Cross-tenant security check: Owner B cannot update Owner A's storefront
  const crossTenantUpdateRes = await fetch(
    `${baseUrl}/api/v1/business-profile/${profileA.id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ business_name: 'Hijacked Store' }),
    }
  );
  assert.equal(crossTenantUpdateRes.status, 403, 'Owner B must be blocked from mutating Owner A profile');

  // 6. Owner A updates profile & rejects ephemeral file:// URL
  const badUpdateRes = await fetch(`${baseUrl}/api/v1/business-profile/${profileA.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      bannerUrl: 'file:///data/user/0/cache/temp.jpg',
    }),
  });
  assert.equal(badUpdateRes.status, 400);

  const updateARes = await fetch(`${baseUrl}/api/v1/business-profile/${profileA.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({
      business_name: `Apex Kirana Updated ${suffix}`,
      is_open: false,
      availability_days: 'Tue - Sun',
      operating_hours: '24 Hours Open',
      default_radius_km: 25,
    }),
  });
  const updateAJson = await updateARes.json();
  assert.equal(updateARes.status, 200, JSON.stringify(updateAJson));

  // 7. Fresh token fetch /me must reflect all persisted updates from DB
  const freshTokenA = signToken(ownerA);
  const reLoginMeRes = await fetch(`${baseUrl}/api/v1/business-profile/me`, {
    headers: { Authorization: `Bearer ${freshTokenA}` },
  });
  const reLoginMeJson = await reLoginMeRes.json();
  assert.equal(reLoginMeRes.status, 200);
  assert.equal(reLoginMeJson.data.businessName, `Apex Kirana Updated ${suffix}`);
  assert.equal(reLoginMeJson.data.is_open, false);
  assert.equal(reLoginMeJson.data.availability_days, 'Tue - Sun');
  assert.equal(reLoginMeJson.data.operatingHours, '24 Hours Open');
  assert.equal(reLoginMeJson.data.default_radius_km, 25);
  assert.equal(reLoginMeJson.data.logo_url, logoUrl);
  assert.equal(reLoginMeJson.data.bannerUrl, bannerUrl);

  // 8. Owner A deletes profile -> subsequent /me returns 404
  const deleteARes = await fetch(`${baseUrl}/api/v1/business-profile/${profileA.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${freshTokenA}` },
  });
  assert.equal(deleteARes.status, 200);

  const postDeleteMeRes = await fetch(`${baseUrl}/api/v1/business-profile/me`, {
    headers: { Authorization: `Bearer ${freshTokenA}` },
  });
  assert.equal(postDeleteMeRes.status, 404);
});

