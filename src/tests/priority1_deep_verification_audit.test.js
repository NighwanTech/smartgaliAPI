/**
 * Priority 1 Deep Verification Audit & Negative Testing Suite
 * Strictly verifies the actual runtime source code, database persistence, and authorization enforcement.
 */

import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import ServiceListing from '../modules/service_listing/service_listing.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ServiceBooking from '../modules/service_booking/service_booking.model.js';
import User from '../modules/user/user.model.js';
import Notification from '../modules/notification/notification.model.js';
import AuditLog from '../modules/audit_log/audit_log.model.js';
import { ServiceExecutionMethod } from '../modules/service_config/service_config.models.js';
import { getMasterItems } from '../modules/service_config/service_config.service.js';
import { getAllListings, createListing } from '../modules/service_listing/service_listing.service.js';
import {
  createBooking,
  transitionBooking,
  getBookingById,
  getProviderBookings,
} from '../modules/service_booking/service_booking.service.js';
import {
  maskPhoneNumber,
  maskServiceAddress,
  coarsenCoordinate,
  sanitizeBookingForParty,
  isStatusAcceptedOrBeyond,
} from '../modules/service_booking/booking_privacy.utils.js';

async function runComprehensiveAudit() {
  console.log('================================================================');
  console.log('🔬 SMARTGALI PRIORITY 1: DEEP VERIFICATION & REGRESSION AUDIT');
  console.log('================================================================\n');

  await connectDB();

  const results = [];

  function recordTest(testName, passed, details) {
    results.push({ testName, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark}: ${testName}`);
    if (details) console.log(`   ${details}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: INACTIVE AND TEST EXECUTION METHODS EXCLUSION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 1: Execution Methods Master Data & Filtering ---');
  try {
    const activeMethods = await getMasterItems('execution-methods', { includeInactive: false });
    const allMethods = await getMasterItems('execution-methods', { includeInactive: true });
    
    const hasInactiveInActiveList = activeMethods.some(m => !m.is_active || m.is_deleted);
    const hasTestRecordInActive = activeMethods.some(m => m.code === 'TEST' || m.name.toLowerCase() === 'test');
    
    assert(!hasInactiveInActiveList, 'Active methods list must not contain inactive or deleted records');
    assert(!hasTestRecordInActive, 'Active methods list must exclude test records with is_active=false');

    recordTest(
      'Dynamic execution methods exclude inactive and test records',
      true,
      `Active records: ${activeMethods.length}, Total records (incl. inactive): ${allMethods.length}. Inactive [TEST] record correctly excluded.`
    );
  } catch (err) {
    recordTest('Dynamic execution methods exclude inactive and test records', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: EXECUTION METHOD PERSISTENCE AND PROJECTION
  // ───────────────────────────────────────────────────────────────────────────
  let providerProfile = await ServiceProviderProfile.findOne({
    where: { is_deleted: false },
    include: [{ model: User, as: 'user' }],
  });
  assert(providerProfile, 'Test requires an active ServiceProviderProfile');

  let testListingId = null;
  const testTitle = `Audit Service ${Date.now()}`;
  try {
    const createdListing = await createListing({
      title: testTitle,
      description: 'Audit verification listing for execution method',
      price: 650,
      execution_method_id: 1, // CUSTOMER_LOCATION
      coverage_scope: 'PUBLIC',
      provider_id: providerProfile.id,
    }, providerProfile.user || { id: providerProfile.user_id, userId: providerProfile.user_id, role: 'service_provider' });

    testListingId = createdListing.id;

    // Direct raw database verification
    const [rawRows] = await sequelize.query(
      'SELECT id, execution_method_id FROM service_listings WHERE id = ?',
      { replacements: [testListingId] }
    );
    assert(rawRows.length > 0, 'Listing must exist in DB');
    assert.strictEqual(Number(rawRows[0].execution_method_id), 1, 'Raw DB column execution_method_id must be 1');

    recordTest(
      'executionMethodId is correctly created and persisted in MySQL table',
      true,
      `Listing #${testListingId} raw DB column execution_method_id = ${rawRows[0].execution_method_id}`
    );
  } catch (err) {
    recordTest('executionMethodId is correctly created and persisted in MySQL table', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: NEARBY SEARCH FILTERING BY EXECUTION METHOD
  // ───────────────────────────────────────────────────────────────────────────
  try {
    // 3a. Search with execution_method_id = 1
    const matchingSearch = await getAllListings({
      lat: 25.59,
      lng: 85.14,
      radius_km: 25,
      execution_method_id: 1,
      search: testTitle,
    });
    const matchRows = matchingSearch.rows || matchingSearch.data || [];
    assert(matchRows.some(l => l.id === testListingId), 'Listing must be returned when execution_method_id matches');

    // 3b. Search with execution_method_id = 2 (PROVIDER_WORKSHOP)
    const nonMatchingSearch = await getAllListings({
      lat: 25.59,
      lng: 85.14,
      radius_km: 25,
      execution_method_id: 2,
      search: testTitle,
    });
    const nonMatchRows = nonMatchingSearch.rows || nonMatchingSearch.data || [];
    assert(!nonMatchRows.some(l => l.id === testListingId), 'Listing must NOT be returned when execution_method_id does not match');

    // 3c. Search by execution_method string code
    const codeSearch = await getAllListings({
      lat: 25.59,
      lng: 85.14,
      radius_km: 25,
      execution_method: 'CUSTOMER_LOCATION',
      search: testTitle,
    });
    const codeRows = codeSearch.rows || codeSearch.data || [];
    assert(codeRows.some(l => l.id === testListingId), 'Listing must be returned when execution_method string code matches');

    recordTest(
      'Execution method filtering works correctly in nearby service search',
      true,
      `Matched method 1 (${matchRows.length} found), excluded method 2 (${nonMatchRows.length} found), resolved code CUSTOMER_LOCATION (${codeRows.length} found)`
    );
  } catch (err) {
    recordTest('Execution method filtering works correctly in nearby service search', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: INITIAL BOOKING PRIVACY MASKING (PHONE, ADDRESS, COORDINATES, PIN)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n--- Section 2: Privacy Masking & Sensitive Data Protection ---');
  let resident = await User.findOne({ where: { is_deleted: false, phone: { [sequelize.Sequelize.Op.ne]: null } } });
  if (!resident || resident.userId === providerProfile.user_id) {
    resident = await User.findByPk(391) || resident;
  }

  providerProfile.auto_accept_bookings = false;
  await providerProfile.save();

  const rawAddress = 'Flat 402, Block B, Maurya Enclave, Bailey Road, Khagaul, Patna, Bihar 801105';
  const rawLat = 25.59419876;
  const rawLng = 85.13751234;
  const customerPhone = resident.phone || '+919876543210';

  let testBooking = null;
  try {
    const futureOffset = (20 + Math.floor(Math.random() * 20)) * 86400000;
    testBooking = await createBooking({
      listing_id: testListingId,
      provider_id: providerProfile.id,
      service_address: rawAddress,
      scheduled_at: new Date(Date.now() + futureOffset).toISOString(),
      time_slot: '02:00 PM - 03:30 PM',
      latitude: rawLat,
      longitude: rawLng,
      amount: 650,
    }, resident);

    assert.strictEqual(testBooking.status, 'requested', 'Initial status must be requested');

    // Test masking functions directly
    const maskedPhone = maskPhoneNumber(customerPhone);
    assert(maskedPhone.includes('*'), 'Phone must contain mask asterisks');
    assert(!maskedPhone.includes(customerPhone.slice(4, 7)), 'Middle digits must not be exposed');

    const maskedAddr = maskServiceAddress(rawAddress);
    assert(!maskedAddr.includes('Flat 402'), 'Flat unit number must be obscured');
    assert(maskedAddr.includes('Khagaul') || maskedAddr.includes('Patna'), 'Locality must be preserved');
    assert(maskedAddr.includes('(Exact address visible upon acceptance)'), 'Must include privacy notice');

    const coarseLat = coarsenCoordinate(rawLat);
    const coarseLng = coarsenCoordinate(rawLng);
    assert.strictEqual(coarseLat, 25.59, 'Latitude must be rounded to 2 decimal places');
    assert.strictEqual(coarseLng, 85.14, 'Longitude must be rounded to 2 decimal places');

    // Verify sanitization for Assigned Provider
    const providerActor = { id: providerProfile.user_id, userId: providerProfile.user_id, role: 'service_provider' };
    const providerView = sanitizeBookingForParty(testBooking, providerActor);

    assert.strictEqual(providerView.doorstep_pin, null, 'Provider must not receive Doorstep PIN in requested state');
    assert(providerView.customerPhone.includes('*'), 'Provider must receive masked phone');
    assert(!providerView.service_address.includes('Flat 402'), 'Provider must receive masked address');
    assert.strictEqual(providerView.latitude, 25.59, 'Provider must receive coarse latitude');

    recordTest(
      'Initial booking request masks phone, exact address, precise coordinates and Doorstep PIN',
      true,
      `Phone: "${providerView.customerPhone}", Address: "${providerView.service_address}", GPS: (${providerView.latitude}, ${providerView.longitude}), PIN: ${providerView.doorstep_pin}`
    );
  } catch (err) {
    recordTest('Initial booking request masks phone, exact address, precise coordinates and Doorstep PIN', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: RESIDENT OWNER AND GLOBAL ADMIN ACCESS
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const residentActor = { id: resident.userId, userId: resident.userId, role: 'resident' };
    const residentView = sanitizeBookingForParty(testBooking, residentActor);

    assert.strictEqual(residentView.service_address, rawAddress, 'Resident owner must see full unmasked address');
    assert.strictEqual(residentView.doorstep_pin, testBooking.doorstep_pin, 'Resident owner must see Doorstep PIN');

    const adminActor = { id: 1, userId: 1, user_role: 'super_admin', role: 'super_admin' };
    const adminView = sanitizeBookingForParty(testBooking, adminActor);
    assert.strictEqual(adminView.service_address, rawAddress, 'Global Admin must see full unmasked address');

    recordTest(
      'Resident Owner and Global Admin see full unmasked details and Doorstep PIN',
      true,
      `Resident PIN: ${residentView.doorstep_pin}, Full Address: "${residentView.service_address}"`
    );
  } catch (err) {
    recordTest('Resident Owner and Global Admin see full unmasked details and Doorstep PIN', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: UNAUTHORIZED USER REJECTION (NEGATIVE TEST)
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const strangerResident = { id: 88888, userId: 88888, role: 'resident' };
    const strangerView = sanitizeBookingForParty(testBooking, strangerResident);
    assert.strictEqual(strangerView, null, 'Stranger resident must be denied (null)');

    const strangerProvider = { id: 77777, userId: 77777, role: 'service_provider' };
    const strangerProvView = sanitizeBookingForParty(testBooking, strangerProvider);
    assert.strictEqual(strangerProvView, null, 'Unassigned provider must be denied (null)');

    recordTest(
      'Unauthorized resident or unassigned provider receives null (HTTP 403 Forbidden)',
      true,
      'Both stranger resident and unassigned provider were rejected with null.'
    );
  } catch (err) {
    recordTest('Unauthorized resident or unassigned provider receives null (HTTP 403 Forbidden)', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: NEGATIVE TEST: UNASSIGNED PROVIDER CANNOT ACCEPT BOOKING
  // ───────────────────────────────────────────────────────────────────────────
  try {
    const unassignedProvider = { id: 77777, userId: 77777, role: 'service_provider' };
    let threw = false;
    try {
      await transitionBooking(testBooking.id, 'accept', {}, unassignedProvider);
    } catch (e) {
      threw = true;
      assert.strictEqual(e.statusCode, 403, 'Must throw 403 status code');
    }
    assert(threw, 'transitionBooking must reject unassigned provider');

    recordTest(
      'Negative Test: Unassigned provider cannot accept booking (HTTP 403 Forbidden)',
      true,
      'Unassigned provider transition attempt threw 403 Forbidden.'
    );
  } catch (err) {
    recordTest('Negative Test: Unassigned provider cannot accept booking (HTTP 403 Forbidden)', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: BOOKING ACCEPTANCE REVEALS SENSITIVE DATA TO ASSIGNED PROVIDER
  // ───────────────────────────────────────────────────────────────────────────
  let acceptedBooking = null;
  try {
    const assignedProvider = { id: providerProfile.user_id, userId: providerProfile.user_id, role: 'service_provider' };
    acceptedBooking = await transitionBooking(testBooking.id, 'accept', {}, assignedProvider);
    assert.strictEqual(acceptedBooking.status, 'accepted', 'Booking status must be accepted');

    const providerAcceptedView = sanitizeBookingForParty(acceptedBooking, assignedProvider);
    assert.strictEqual(providerAcceptedView.service_address, rawAddress, 'Assigned provider must now see FULL address');
    assert.strictEqual(providerAcceptedView.user.phone, resident.phone, 'Assigned provider must now see unmasked phone');
    assert.strictEqual(providerAcceptedView.doorstep_pin, null, 'Doorstep PIN must STILL be hidden from provider');

    recordTest(
      'Booking acceptance reveals full address and phone to assigned provider (PIN remains hidden)',
      true,
      `Status: "${acceptedBooking.status}", Revealed Address: "${providerAcceptedView.service_address}", Revealed Phone: "${providerAcceptedView.user.phone}", Doorstep PIN: ${providerAcceptedView.doorstep_pin}`
    );
  } catch (err) {
    recordTest('Booking acceptance reveals full address and phone to assigned provider (PIN remains hidden)', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: POST-ACCEPTANCE CANCELLATION / REJECTION RE-MASKS SENSITIVE DATA
  // ───────────────────────────────────────────────────────────────────────────
  try {
    // Resident cancels the previously accepted booking
    const residentActor = { id: resident.userId, userId: resident.userId, role: 'resident' };
    const cancelledBooking = await transitionBooking(testBooking.id, 'cancel', { reason: 'Schedule changed' }, residentActor);
    assert.strictEqual(cancelledBooking.status, 'cancelled', 'Booking status must be cancelled');

    // Now inspect what the provider sees for this cancelled booking
    const assignedProvider = { id: providerProfile.user_id, userId: providerProfile.user_id, role: 'service_provider' };
    const providerCancelledView = sanitizeBookingForParty(cancelledBooking, assignedProvider);

    assert(isStatusAcceptedOrBeyond('cancelled') === false, 'Cancelled status must not be accepted or beyond');
    assert(!providerCancelledView.service_address.includes('Flat 402'), 'Provider must NOT see flat number for cancelled booking');
    assert(providerCancelledView.user.phone.includes('*'), 'Provider must see masked phone for cancelled booking');
    assert.strictEqual(providerCancelledView.doorstep_pin, null, 'Doorstep PIN must be null');

    recordTest(
      'Cancelled / Rejected booking re-masks sensitive address and phone from provider',
      true,
      `Status: "${cancelledBooking.status}", Address re-masked: "${providerCancelledView.service_address}", Phone re-masked: "${providerCancelledView.user.phone}"`
    );
  } catch (err) {
    recordTest('Cancelled / Rejected booking re-masks sensitive address and phone from provider', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: DOORSTEP PIN VERIFICATION & ARRIVAL STAGE ENFORCEMENT
  // ───────────────────────────────────────────────────────────────────────────
  try {
    // Create another fresh booking and transition to 'accepted' then 'on_the_way'
    const futureOffset2 = (40 + Math.floor(Math.random() * 20)) * 86400000;
    const booking2 = await createBooking({
      listing_id: testListingId,
      provider_id: providerProfile.id,
      service_address: rawAddress,
      scheduled_at: new Date(Date.now() + futureOffset2).toISOString(),
      time_slot: '04:00 PM - 05:30 PM',
      latitude: rawLat,
      longitude: rawLng,
      amount: 650,
    }, resident);

    const assignedProvider = { id: providerProfile.user_id, userId: providerProfile.user_id, role: 'service_provider' };
    await transitionBooking(booking2.id, 'accept', {}, assignedProvider);
    const onTheWayBooking = await transitionBooking(booking2.id, 'on_the_way', {}, assignedProvider);
    assert.strictEqual(onTheWayBooking.status, 'on_the_way', 'Booking must be on_the_way');

    // Provider still cannot see plaintext Doorstep PIN while on the way
    const onTheWayView = sanitizeBookingForParty(onTheWayBooking, assignedProvider);
    assert.strictEqual(onTheWayView.doorstep_pin, null, 'Doorstep PIN must be null even when on_the_way');

    // Negative Test: Attempt to start service with wrong PIN
    let wrongPinThrew = false;
    try {
      await transitionBooking(booking2.id, 'start', { doorstep_pin: '0000' }, assignedProvider);
    } catch (e) {
      wrongPinThrew = true;
      assert.strictEqual(e.statusCode, 400, 'Invalid PIN must throw 400');
    }
    assert(wrongPinThrew, 'Wrong PIN must be rejected');

    // Positive Test: Start service with CORRECT PIN
    const startedBooking = await transitionBooking(booking2.id, 'start', { doorstep_pin: booking2.doorstep_pin }, assignedProvider);
    assert.strictEqual(startedBooking.status, 'started', 'Service status must transition to started');
    assert.strictEqual(startedBooking.doorstep_pin_verified, true, 'doorstep_pin_verified must be true in DB');

    recordTest(
      'Doorstep PIN remains protected during on_the_way, rejects invalid PIN, verifies on arrival',
      true,
      `on_the_way PIN: ${onTheWayView.doorstep_pin}, Invalid PIN rejected (400), verified PIN: ${booking2.doorstep_pin} -> status: ${startedBooking.status}`
    );
  } catch (err) {
    recordTest('Doorstep PIN remains protected during on_the_way, rejects invalid PIN, verifies on arrival', false, err.message);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: AUDIT LOG AND NOTIFICATION PAYLOAD LEAK INSPECTION
  // ───────────────────────────────────────────────────────────────────────────
  try {
    // Check recent notification payloads for booking
    const recentNotifs = await Notification.findAll({
      where: { type: 'booking_request' },
      order: [['id', 'DESC']],
      limit: 5,
    });

    let notifLeakFound = false;
    for (const n of recentNotifs) {
      const dataStr = JSON.stringify(n.data || {});
      const msgStr = n.message || '';
      if (dataStr.includes('Flat 402') || msgStr.includes('Flat 402') || dataStr.includes(customerPhone)) {
        notifLeakFound = true;
      }
    }
    assert(!notifLeakFound, 'Notification table must not leak customer address or phone');

    // Check recent audit log payloads for booking
    const recentAudit = await AuditLog.findAll({
      where: { target_type: 'service_booking' },
      order: [['id', 'DESC']],
      limit: 5,
    });

    let auditLeakFound = false;
    for (const a of recentAudit) {
      const payloadStr = JSON.stringify({ before: a.before_state, after: a.after_state });
      if (payloadStr.includes('Flat 402') || payloadStr.includes(customerPhone)) {
        auditLeakFound = true;
      }
    }
    assert(!auditLeakFound, 'Audit log table must not leak private customer address or phone');

    recordTest(
      'Notification payloads and audit logs contain zero customer address or phone leaks',
      true,
      `Inspected ${recentNotifs.length} notifications and ${recentAudit.length} audit logs. Zero sensitive leaks detected.`
    );
  } catch (err) {
    recordTest('Notification payloads and audit logs contain zero customer address or phone leaks', false, err.message);
  }

  console.log('\n================================================================');
  console.log('📊 AUDIT SUMMARY:');
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  console.log(`   Total Tests: ${total} | Passed: ${passedCount} | Failed: ${total - passedCount}`);
  console.log('================================================================');

  if (passedCount === total) {
    console.log('🎉 ALL 11 VERIFICATION & NEGATIVE TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  } else {
    console.error('❌ SOME AUDIT TESTS FAILED');
    process.exit(1);
  }
}

runComprehensiveAudit().catch(err => {
  console.error('\n💥 FATAL AUDIT FAILURE:', err);
  process.exit(1);
});

