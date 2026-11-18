import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import jwt from 'jsonwebtoken';

import app from '../src/app.js';
import env from '../src/config/env.js';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import BusinessProfile from '../src/modules/business_profile/business_profile.model.js';
import BusinessProduct from '../src/modules/business_product/business_product.model.js';
import { removeLocalUpload } from '../src/utils/fileUpload.js';
import * as productService from '../src/modules/business_product/business_product.service.js';

const CREATED = {
  businesses: [],
  products: [],
  uploadedUrls: [],
};

let server;
let baseUrl;

const cleanup = async () => {
  for (const url of CREATED.uploadedUrls) {
    await removeLocalUpload(url).catch(() => {});
  }
  if (CREATED.products.length > 0) {
    await BusinessProduct.destroy({ where: { id: CREATED.products }, force: true });
  }
  if (CREATED.businesses.length > 0) {
    await BusinessProfile.destroy({ where: { id: CREATED.businesses }, force: true });
  }
};

after(async () => {
  await cleanup().catch((err) => console.error('Cleanup error:', err));
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await sequelize.close();
});

const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex'
);

const TINY_JPEG = Buffer.from('ffd8ffe000104a46494600010101004800480000ffd9', 'hex');

test('Product service rejects ephemeral blob/file/local paths from persisting in DB', async () => {
  const user = await User.findOne({
    where: { is_deleted: false, is_active: true, status: 'active' },
    attributes: ['userId', 'userRole'],
  });
  assert.ok(user, 'Need an active user in DB for test');

  const biz = await BusinessProfile.create({
    userId: user.userId,
    businessName: 'Image Persistence Guard Store',
    serviceCategory: 'Fashion',
    phone: '9876543210',
    city_name: 'Patna',
    coverage_scope: 'PUBLIC',
    default_radius_km: 10,
    is_verified: true,
    is_open: true,
    is_active: true,
    is_deleted: false,
  });
  CREATED.businesses.push(biz.id);

  await assert.rejects(
    () =>
      productService.createProduct(
        {
          business_id: biz.id,
          name: 'Blocked Blob T-Shirt',
          mrp: 999,
          selling_price: 799,
          primary_image: 'blob:http://localhost:62569/f4fb3939-04bd-42d8-9fa7-82d01863a5ca',
        },
        user.userId
      ),
    /Temporary local or browser blob image paths/i
  );

  const created = await productService.createProduct(
    {
      business_id: biz.id,
      name: 'Valid Silk T-Shirt',
      mrp: 999,
      selling_price: 799,
    },
    user.userId
  );
  CREATED.products.push(created.id);

  await assert.rejects(
    () =>
      productService.updateProduct(
        created.id,
        {
          images: ['file:///data/user/0/com.example/cache/temp.jpg'],
        },
        user.userId
      ),
    /Temporary local or browser blob image paths/i
  );
});

test('E2E HTTP upload + update + fresh re-login fetch persists PNG & JPEG product images', async () => {
  const user = await User.findOne({
    where: { is_deleted: false, is_active: true, status: 'active' },
    attributes: ['userId', 'userRole'],
  });
  assert.ok(user, 'Need an active user in DB for test');

  const biz = await BusinessProfile.create({
    userId: user.userId,
    businessName: 'Silk Studio Test',
    serviceCategory: 'Fashion',
    phone: '9876501234',
    city_name: 'Patna',
    coverage_scope: 'PUBLIC',
    default_radius_km: 10,
    is_verified: true,
    is_open: true,
    is_active: true,
    is_deleted: false,
  });
  CREATED.businesses.push(biz.id);

  const product = await productService.createProduct(
    {
      business_id: biz.id,
      name: 'Silk Tshirt Persistent',
      mrp: 999,
      selling_price: 799,
      status: 'active',
      approval_status: 'approved',
    },
    user.userId
  );
  CREATED.products.push(product.id);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;

  const token = jwt.sign(
    { id: user.userId, userRole: user.userRole },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  // 1. Upload PNG with generic application/octet-stream (mimics Dio MultipartFile.fromBytes)
  const formPng = new FormData();
  formPng.append('business_id', String(biz.id));
  formPng.append('image', new Blob([TINY_PNG], { type: 'application/octet-stream' }), 'silk_front.png');

  const uploadRes1 = await fetch(
    `${baseUrl}/api/v1/business-product/upload-image?businessId=${biz.id}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formPng,
    }
  );
  const uploadJson1 = await uploadRes1.json();
  assert.equal(uploadRes1.status, 201, JSON.stringify(uploadJson1));
  const primaryUrl = uploadJson1.data.url;
  assert.match(primaryUrl, /\/uploads\/business_products\/.*\.png$/);
  CREATED.uploadedUrls.push(primaryUrl);

  // 2. Upload JPEG with image/jpg alias MIME
  const formJpg = new FormData();
  formJpg.append('business_id', String(biz.id));
  formJpg.append('image', new Blob([TINY_JPEG], { type: 'image/jpg' }), 'silk_back.jpg');

  const uploadRes2 = await fetch(
    `${baseUrl}/api/v1/business-product/upload-image?businessId=${biz.id}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formJpg,
    }
  );
  const uploadJson2 = await uploadRes2.json();
  assert.equal(uploadRes2.status, 201, JSON.stringify(uploadJson2));
  const galleryUrl = uploadJson2.data.url;
  assert.match(galleryUrl, /\/uploads\/business_products\/.*\.jpg$/);
  CREATED.uploadedUrls.push(galleryUrl);

  // 3. Verify static HTTP serving of the uploaded image path with cross-origin policy
  const uploadedPath = new URL(primaryUrl).pathname;
  const staticRes = await fetch(`${baseUrl}${uploadedPath}`);
  assert.equal(staticRes.status, 200);
  assert.equal(staticRes.headers.get('cross-origin-resource-policy'), 'cross-origin');
  const servedBytes = Buffer.from(await staticRes.arrayBuffer());
  assert.deepEqual(servedBytes, TINY_PNG);

  // 4. Update product with uploaded URLs
  const updateRes = await fetch(`${baseUrl}/api/v1/business-product/${product.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      business_id: biz.id,
      name: 'Silk Tshirt Persistent',
      mrp: 999,
      selling_price: 799,
      primary_image: primaryUrl,
      images: [galleryUrl],
    }),
  });
  const updateJson = await updateRes.json();
  assert.equal(updateRes.status, 200, JSON.stringify(updateJson));
  assert.equal(updateJson.data.primary_image, primaryUrl);
  assert.deepEqual(updateJson.data.images, [galleryUrl]);

  // 5. Simulate fresh re-login with a brand new token & fetch merchant + public endpoints
  const freshToken = jwt.sign(
    { id: user.userId, userRole: user.userRole },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  const merchantListRes = await fetch(
    `${baseUrl}/api/v1/business-product/business/${biz.id}`,
    {
      headers: { Authorization: `Bearer ${freshToken}` },
    }
  );
  const merchantListJson = await merchantListRes.json();
  assert.equal(merchantListRes.status, 200);
  const fetchedProduct = merchantListJson.data.find((p) => Number(p.id) === Number(product.id));
  assert.ok(fetchedProduct, 'Updated product should appear after fresh login');
  assert.equal(fetchedProduct.primary_image, primaryUrl);
  assert.deepEqual(fetchedProduct.images, [galleryUrl]);

  const publicListRes = await fetch(
    `${baseUrl}/api/v1/business-product/public/${biz.id}`
  );
  const publicListJson = await publicListRes.json();
  assert.equal(publicListRes.status, 200);
  const publicProduct = publicListJson.data.find((p) => Number(p.id) === Number(product.id));
  assert.ok(publicProduct, 'Public storefront should return product');
  assert.equal(publicProduct.primary_image, primaryUrl);
  assert.deepEqual(publicProduct.images, [galleryUrl]);
  assert.equal(Number(publicProduct.selling_price), 799);

  // 6. Verify actual file exists inside uploads/business_products on disk (not RAM)
  const relPrimaryPath = uploadedPath.replace(/^\/uploads\//, '');
  const diskPrimaryFile = path.join(env.uploadsPath, relPrimaryPath);
  assert.equal(fs.existsSync(diskPrimaryFile), true, `Missing uploaded file on disk: ${diskPrimaryFile}`);

  // 7. Verify public single product detail & nearby discovery endpoints return exact same DB image & price
  const publicItemRes = await fetch(
    `${baseUrl}/api/v1/business-product/public/item/${product.id}`
  );
  const publicItemJson = await publicItemRes.json();
  assert.equal(publicItemRes.status, 200);
  assert.equal(publicItemJson.data.primary_image, primaryUrl);
  assert.deepEqual(publicItemJson.data.images, [galleryUrl]);
  assert.equal(Number(publicItemJson.data.selling_price), 799);
  assert.equal(publicItemJson.data.cost_price, undefined);

  const nearbyRes = await fetch(
    `${baseUrl}/api/v1/business-product/public/nearby?city_name=Patna&business_id=${biz.id}`
  );
  const nearbyJson = await nearbyRes.json();
  assert.equal(nearbyRes.status, 200);
  const nearbyProd = (nearbyJson.data?.products || []).find((p) => Number(p.id) === Number(product.id));
  assert.ok(nearbyProd, 'Public nearby endpoint should include updated product');
  assert.equal(nearbyProd.primary_image, primaryUrl);
  assert.deepEqual(nearbyProd.images, [galleryUrl]);
});

