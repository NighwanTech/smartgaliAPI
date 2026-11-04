/**
 * SmartGali – Enterprise Location Management Enhancement
 * Priority 1 Automated Verification Suite
 * 
 * Verifies:
 * 1. Dynamic Service Execution Methods in MySQL
 * 2. Service Listing creation with execution_method_id persistence in MySQL
 * 3. Search filtering by execution_method_id and execution_method
 * 4. Privacy masking in initial booking request (Phone & Address masked)
 * 5. Full sensitive information revealed to authorized provider ONLY after acceptance
 * 6. Doorstep safety PIN protection until verified
 */

import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import ServiceListing from '../modules/service_listing/service_listing.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ServiceBooking from '../modules/service_booking/service_booking.model.js';
import User from '../modules/user/user.model.js';
import { ServiceExecutionMethod } from '../modules/service_config/service_config.models.js';
import { getAllListings, createListing } from '../modules/service_listing/service_listing.service.js';
import { createBooking, transitionBooking, getBookingById } from '../modules/service_booking/service_booking.service.js';
import {
  maskPhoneNumber,
  maskServiceAddress,
  coarsenCoordinate,
  sanitizeBookingForParty,
} from '../modules/service_booking/booking_privacy.utils.js';

async function runPriority1EnterpriseSuite() {
  console.log('================================================================');
  console.log('🧪 SMARTGALI ENTERPRISE PRIORITY 1: EXECUTION METHOD & PRIVACY TEST');
  console.log('================================================================\n');

  await connectDB();

  // ── Step 1: Verify Dynamic Execution Methods in MySQL ───────────────────────
  console.log('🔍 Step 1: Checking ServiceExecutionMethod master records in MySQL...');
  const execMethods = await ServiceExecutionMethod.findAll({ where: { is_deleted: false } });
  assert(execMethods.length > 0, 'ServiceExecutionMethod records must exist in MySQL');
  console.log(`✅ Found ${execMethods.length} active Execution Methods in DB:`);
  for (const m of execMethods) {
    console.log(`   - ID ${m.id}: [${m.code}] ${m.name}`);
  }

  const customerLocationMethod = execMethods.find(m => m.code === 'CUSTOMER_LOCATION') || execMethods[0];
  const providerWorkshopMethod = execMethods.find(m => m.code === 'PROVIDER_WORKSHOP') || execMethods[1];

  // ── Step 2: Create Service Listing with Dynamic Execution Method ────────────
  console.log('\n📝 Step 2: Creating Service Listing with dynamic execution_method_id...');
  let provider = await ServiceProviderProfile.findOne({
    where: { is_deleted: false },
    include: [{ model: User, as: 'user' }],
  });
  assert(provider, 'A valid ServiceProviderProfile must exist for testing');
  
  // Ensure provider requires manual acceptance to test privacy masking
  provider.auto_accept_bookings = false;
  await provider.save();

  const testTitle = `Audit AC Repair Execution Test ${Date.now()}`;
  const created = await createListing({
    title: testTitle,
    description: 'Testing dynamic execution_method_id persistence',
    price: 499,
    execution_method_id: customerLocationMethod.id,
    coverage_scope: 'PUBLIC',
    provider_id: provider.id,
  }, provider.user || { id: provider.user_id, userId: provider.user_id, role: 'service_provider' });

  assert.strictEqual(Number(created.execution_method_id), Number(customerLocationMethod.id), 'Listing must persist execution_method_id');
  console.log(`✅ Listing #${created.id} persisted with execution_method_id: ${created.execution_method_id}`);

  // Fetch from DB directly via raw query / findByPk
  const freshDbRecord = await ServiceListing.findByPk(created.id);
  assert.strictEqual(Number(freshDbRecord.execution_method_id), Number(customerLocationMethod.id), 'MySQL column must store execution_method_id');
  console.log(`✅ MySQL service_listings.execution_method_id strictly confirmed: ${freshDbRecord.execution_method_id}`);

  // ── Step 3: Provider Search Filtering by Execution Method ───────────────────
  console.log('\n🔎 Step 3: Testing Provider Search Filtering by execution_method...');
  
  // 3a. Search by numeric execution_method_id
  const filteredByIdRes = await getAllListings({
    execution_method_id: customerLocationMethod.id,
    search: testTitle,
  });
  const filteredById = filteredByIdRes.rows || filteredByIdRes.data || filteredByIdRes;
  assert(filteredById.some(l => l.id === created.id), 'Search by execution_method_id must return created listing');
  console.log(`✅ Found listing #${created.id} by execution_method_id=${customerLocationMethod.id}`);

  // 3b. Search by non-matching execution_method_id should NOT return this listing
  if (providerWorkshopMethod) {
    const nonMatchingRes = await getAllListings({
      execution_method_id: providerWorkshopMethod.id,
      search: testTitle,
    });
    const nonMatching = nonMatchingRes.rows || nonMatchingRes.data || nonMatchingRes;
    assert(!nonMatching.some(l => l.id === created.id), 'Non-matching execution_method_id must exclude listing');
    console.log(`✅ Correctly excluded listing #${created.id} when filtering for execution_method_id=${providerWorkshopMethod.id}`);
  }

  // 3c. Search by execution_method code / string
  const filteredByCodeRes = await getAllListings({
    execution_method: customerLocationMethod.code,
    search: testTitle,
  });
  const filteredByCode = filteredByCodeRes.rows || filteredByCodeRes.data || filteredByCodeRes;
  assert(filteredByCode.some(l => l.id === created.id), 'Search by execution_method code must resolve and filter correctly');
  console.log(`✅ Found listing #${created.id} by execution_method code="${customerLocationMethod.code}"`);

  // ── Step 4: Privacy Masking in Initial Booking Request ──────────────────────
  console.log('\n🔒 Step 4: Testing Privacy Masking on Initial Booking Request...');
  
  // Find or create resident user
  let resident = await User.findOne({ where: { is_deleted: false, phone: { [sequelize.Sequelize.Op.ne]: null } } });
  if (!resident || resident.userId === provider.user_id) {
    resident = await User.findByPk(391) || resident;
  }
  assert(resident, 'Resident user required for booking test');

  const testExactAddress = 'Flat 501, Tower C, Imperial Heights, Bailey Road, Khagaul, Patna, Bihar 801105';
  const testPhone = resident.phone || '+919431012345';
  
  console.log(`   Customer Phone: ${testPhone}`);
  console.log(`   Exact Address:  ${testExactAddress}`);

  // Verify masking functions
  const maskedPhone = maskPhoneNumber(testPhone);
  assert(maskedPhone.includes('*'), 'Phone must contain mask asterisks');
  assert(!maskedPhone.includes(testPhone.slice(4, 8)), 'Middle digits of phone must NOT be exposed');
  console.log(`✅ Masked Phone:   ${maskedPhone}`);

  const maskedAddress = maskServiceAddress(testExactAddress);
  assert(!maskedAddress.includes('Flat 501'), 'Flat number must NOT appear in masked address');
  assert(maskedAddress.includes('Khagaul') || maskedAddress.includes('Patna'), 'Broader locality must be preserved');
  assert(maskedAddress.includes('Exact address visible upon'), 'Masked address must contain disclosure note');
  console.log(`✅ Masked Address: ${maskedAddress}`);

  // Coarsened coordinates
  const lat = 25.59409876;
  const lng = 85.13756432;
  const coarseLat = coarsenCoordinate(lat);
  const coarseLng = coarsenCoordinate(lng);
  assert.strictEqual(coarseLat, 25.59, 'Latitude must be coarsened to 2 decimal places');
  assert.strictEqual(coarseLng, 85.14, 'Longitude must be coarsened to 2 decimal places');
  console.log(`✅ Coarse GPS:     (${coarseLat}, ${coarseLng}) [precision ~1.1km]`);

  const futureDays = 15 + Math.floor(Math.random() * 30);
  const testDate = new Date(Date.now() + futureDays * 86400000);

  // Create booking in database
  const createdBooking = await createBooking({
    listing_id: created.id,
    provider_id: provider.id,
    service_address: testExactAddress,
    scheduled_at: testDate.toISOString(),
    time_slot: '10:00 AM - 11:30 AM',
    latitude: lat,
    longitude: lng,
    amount: 499,
  }, resident);

  console.log(`✅ Created test booking #${createdBooking.id} with status: '${createdBooking.status}'`);
  assert(createdBooking.status === 'requested' || createdBooking.status === 'pending', 'Initial status must be requested/pending');

  // Verify sanitizeBookingForParty for PROVIDER (before acceptance)
  const providerActor = { id: provider.user_id, userId: provider.user_id, role: 'service_provider' };
  const sanitizedForProviderBefore = sanitizeBookingForParty(createdBooking, providerActor);
  
  assert.strictEqual(sanitizedForProviderBefore.doorstep_pin, null, 'Doorstep PIN must be null for provider');
  assert(sanitizedForProviderBefore.customerPhone.includes('*'), 'Provider must see masked phone in requested status');
  assert(!sanitizedForProviderBefore.service_address.includes('Flat 501'), 'Provider must NOT see flat number in requested status');
  console.log(`✅ Provider pre-acceptance view correctly masked:`);
  console.log(`   - Masked Phone:   ${sanitizedForProviderBefore.customerPhone}`);
  console.log(`   - Masked Address: ${sanitizedForProviderBefore.service_address}`);
  console.log(`   - Doorstep PIN:   ${sanitizedForProviderBefore.doorstep_pin} [PROTECTED]`);

  // Verify sanitizeBookingForParty for RESIDENT (customer sees unmasked)
  const residentActor = { id: resident.userId, userId: resident.userId, role: 'resident' };
  const sanitizedForResident = sanitizeBookingForParty(createdBooking, residentActor);
  assert.strictEqual(sanitizedForResident.service_address, testExactAddress, 'Resident must see full address');
  assert(sanitizedForResident.doorstep_pin != null, 'Resident must see their Doorstep PIN');
  console.log(`✅ Resident view remains unmasked with Doorstep PIN: ${sanitizedForResident.doorstep_pin}`);

  // Verify sanitizeBookingForParty for UNAUTHORIZED USER (Must return null / 403)
  const unauthorizedActor = { id: 999999, userId: 999999, role: 'resident' };
  const sanitizedForStranger = sanitizeBookingForParty(createdBooking, unauthorizedActor);
  assert.strictEqual(sanitizedForStranger, null, 'Unauthorized user must be denied (null)');
  console.log(`✅ Unauthorized user access cleanly denied (403 guard)`);

  // ── Step 5: Transition to Accepted & Sensitive Data Reveal ─────────────────
  console.log('\n🔓 Step 5: Testing Acceptance Transition & Sensitive Data Reveal...');
  const acceptedBooking = await transitionBooking(createdBooking.id, 'accept', {}, providerActor);
  assert.strictEqual(acceptedBooking.status, 'accepted', 'Booking status must transition to accepted');
  console.log(`✅ Booking #${acceptedBooking.id} successfully accepted! Status: '${acceptedBooking.status}'`);

  // Now verify that the authorized provider sees FULL unmasked contact and address
  const sanitizedForProviderAfter = sanitizeBookingForParty(acceptedBooking, providerActor);
  assert.strictEqual(sanitizedForProviderAfter.service_address, testExactAddress, 'Accepted provider must see FULL address');
  assert(sanitizedForProviderAfter.user.phone === resident.phone, 'Accepted provider must see unmasked phone');
  assert.strictEqual(sanitizedForProviderAfter.doorstep_pin, null, 'Doorstep PIN must still be protected until resident provides on arrival');
  console.log(`✅ Provider post-acceptance view correctly revealed:`);
  console.log(`   - Revealed Phone:   ${sanitizedForProviderAfter.user.phone}`);
  console.log(`   - Revealed Address: ${sanitizedForProviderAfter.service_address}`);
  console.log(`   - Doorstep PIN:     ${sanitizedForProviderAfter.doorstep_pin} [REMAINS PROTECTED]`);

  console.log('\n================================================================');
  console.log('🎉 ALL PRIORITY 1 ENTERPRISE LOCATION & PRIVACY TESTS PASSED!');
  console.log('================================================================');

  process.exit(0);
}

runPriority1EnterpriseSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
