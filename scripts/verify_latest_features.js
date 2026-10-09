import http from 'http';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import env from '../src/config/env.js';
import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import SocietyProfile from '../src/modules/society_profile/society_profile.model.js';
import SocietyMember from '../src/modules/society_member/society_member.model.js';

const runVerification = async () => {
  console.log('🚀 Running Verification on Latest Endpoints & Features...');

  await sequelize.authenticate();

  // Find or create a test admin user & society
  let testUser = await User.findOne({ where: { is_deleted: false, is_active: true } });
  if (!testUser) {
    throw new Error('No active user found in database for test.');
  }

  let society = await SocietyProfile.findOne({ where: { is_deleted: false } });
  if (!society) {
    throw new Error('No active society found in database for test.');
  }

  // Ensure society membership exists
  let member = await SocietyMember.findOne({
    where: { society_id: society.id, user_id: testUser.userId, is_deleted: false }
  });
  if (!member) {
    member = await SocietyMember.create({
      society_id: society.id,
      user_id: testUser.userId,
      role: 'admin',
      status: 'active',
      is_active: true,
      is_deleted: false,
    });
  } else if (member.role !== 'admin') {
    await member.update({ role: 'admin' });
  }

  const token = jwt.sign(
    { userId: testUser.userId, id: testUser.userId, userRole: 'admin', role: 'admin' },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-society-id': String(society.id),
  };

  const results = [];

  const testEndpoint = async (name, url, options = {}) => {
    try {
      const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
      const data = await res.json().catch(() => null);
      const pass = res.status >= 200 && res.status < 300;
      results.push({ name, status: res.status, pass, message: data?.message || data?.error });
      console.log(`${pass ? '✅' : '❌'} [${res.status}] ${name}`);
      return data;
    } catch (err) {
      results.push({ name, status: 'ERROR', pass: false, message: err.message });
      console.log(`❌ [ERR] ${name}: ${err.message}`);
      return null;
    }
  };

  // 1. Service Listing Nearby & Query
  await testEndpoint('GET /service-listing with queries', `${baseUrl}/service-listing?search=clean`);

  // 2. Service Booking Create
  const createBookingRes = await testEndpoint('POST /service-booking', `${baseUrl}/service-booking`, {
    method: 'POST',
    body: JSON.stringify({
      listing_id: 1,
      user_id: testUser.userId,
      time_slot: '10:00 AM - 12:00 PM',
      service_address: 'Flat 101, Test Tower',
      notes: 'Please call before arrival',
      amount: 499.0,
      scheduled_at: new Date().toISOString(),
    }),
  });

  const bookingId = createBookingRes?.data?.id;

  // 3. Service Bookings List (both /service-booking and /service-bookings alias)
  await testEndpoint('GET /service-booking', `${baseUrl}/service-booking`);
  await testEndpoint('GET /service-bookings alias', `${baseUrl}/service-bookings`);

  if (bookingId) {
    // 4. Service Booking Cancel/Update
    await testEndpoint('PUT /service-booking/:id', `${baseUrl}/service-booking/${bookingId}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'cancelled',
        cancellation_reason: 'Resident schedule conflict',
      }),
    });
  }

  // 5. Society Document Create
  const createDocRes = await testEndpoint('POST /society-document', `${baseUrl}/society-document`, {
    method: 'POST',
    body: JSON.stringify({
      society_id: society.id,
      title: 'Annual Society Bye-Laws 2026',
      document_number: 'SOC-BL-2026-001',
      version: '1.0',
      description: 'Official society rules and guidelines',
      category: 'bye_laws',
      priority: 'high',
      visibility: 'all',
      file_url: 'https://example.com/docs/bye-laws-2026.pdf',
    }),
  });

  const docId = createDocRes?.data?.id;

  if (docId) {
    // 6. Society Document Details & Queries
    await testEndpoint('GET /society-document with filters', `${baseUrl}/society-document?category=bye_laws&status=published`);
    await testEndpoint('GET /society-document/:id', `${baseUrl}/society-document/${docId}`);

    // 7. Society Document Version
    await testEndpoint('POST /society-document/:id/versions', `${baseUrl}/society-document/${docId}/versions`, {
      method: 'POST',
      body: JSON.stringify({
        version: '1.1',
        title: 'Annual Society Bye-Laws 2026 (Revised)',
        change_summary: 'Updated parking clause 4.2',
        file_url: 'https://example.com/docs/bye-laws-2026-v2.pdf',
      }),
    });
    await testEndpoint('GET /society-document/:id/versions', `${baseUrl}/society-document/${docId}/versions`);

    // 8. Society Document Status Update
    await testEndpoint('PATCH /society-document/:id/status', `${baseUrl}/society-document/${docId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'published',
        reason: 'Approved in AGM',
      }),
    });

    // 9. Society Document Acknowledge
    await testEndpoint('POST /society-document/:id/acknowledge', `${baseUrl}/society-document/${docId}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ version: '1.1' }),
    });
    await testEndpoint('GET /society-document/:id/acknowledgements', `${baseUrl}/society-document/${docId}/acknowledgements`);

    // 10. Society Document Audit History
    await testEndpoint('GET /society-document/:id/audit-history', `${baseUrl}/society-document/${docId}/audit-history`);
  }

  // 11. Resident Document Vault
  const resDocRes = await testEndpoint('POST /resident-document', `${baseUrl}/resident-document`, {
    method: 'POST',
    body: JSON.stringify({
      society_id: society.id,
      title: 'Electricity Bill Oct 2026',
      document_type: 'utility_bill',
      flat_number: 'A-402',
      file_url: 'https://example.com/resident/bill.pdf',
      status: 'private',
    }),
  });

  const resDocId = resDocRes?.data?.id;

  if (resDocId) {
    await testEndpoint('GET /resident-document/me', `${baseUrl}/resident-document/me`);
    await testEndpoint('PATCH /resident-document/:id/share', `${baseUrl}/resident-document/${resDocId}/share`, {
      method: 'PATCH',
    });
    await testEndpoint('GET /resident-document/shared', `${baseUrl}/resident-document/shared`);
    await testEndpoint('PATCH /resident-document/:id/verify', `${baseUrl}/resident-document/${resDocId}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'verified',
      }),
    });
    await testEndpoint('DELETE /resident-document/:id', `${baseUrl}/resident-document/${resDocId}`, {
      method: 'DELETE',
    });
  }

  // 12. Chat Messages Route Alias
  await testEndpoint('GET /chat/1/messages alias', `${baseUrl}/chat/1/messages`);

  server.close();

  const failed = results.filter((r) => !r.pass);
  console.log('\n📊 Summary:');
  console.log(`Total tests: ${results.length}`);
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('Failed tests:', failed);
    process.exit(1);
  } else {
    console.log('🎉 All endpoints verified successfully!');
    process.exit(0);
  }
};

runVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
