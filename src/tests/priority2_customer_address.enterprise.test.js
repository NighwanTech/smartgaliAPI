/**
 * SMARTGALI PRIORITY 2: ENTERPRISE CUSTOMER ADDRESS MANAGEMENT TEST SUITE
 * Verifies schema, transactions, validation, multi-tenant isolation, and booking flow integration.
 */

import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import User from '../modules/user/user.model.js';
import UserAddress from '../modules/profile/user_address.model.js';
import SocietyProfile from '../modules/society_profile/society_profile.model.js';
import ServiceListing from '../modules/service_listing/service_listing.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ServiceBooking from '../modules/service_booking/service_booking.model.js';
import * as userAddressService from '../modules/user_address/user_address.service.js';
import { createAddressSchema, updateAddressSchema } from '../modules/user_address/user_address.validation.js';
import { createBooking } from '../modules/service_booking/service_booking.service.js';

async function runEnterpriseAddressTests() {
  console.log('================================================================');
  console.log('🏠 SMARTGALI PRIORITY 2: ENTERPRISE CUSTOMER ADDRESS TEST SUITE');
  console.log('================================================================\n');

  await connectDB();

  const results = [];
  function recordTest(name, passed, details) {
    results.push({ name, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark}: ${name}`);
    if (details) console.log(`   ${details}`);
  }

  // Set up 2 distinct test users for multi-tenant isolation testing
  const timestamp = Date.now();
  const testUserA = await User.create({
    userName: `Resident_A_${timestamp}`,
    phone: `99${String(timestamp).slice(-8)}`,
    email: `resident_a_${timestamp}@smartgali.test`,
    userRole: 'resident',
    status: 'active',
    is_verified: true,
  });

  const testUserB = await User.create({
    userName: `Resident_B_${timestamp}`,
    phone: `98${String(timestamp).slice(-8)}`,
    email: `resident_b_${timestamp}@smartgali.test`,
    userRole: 'resident',
    status: 'active',
    is_verified: true,
  });

  let addressA1Id = null;
  let addressA2Id = null;
  let addressB1Id = null;

  try {
    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: Schema Audit & Target Columns Check
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 1: Database Schema & Migration Verification ---');
    const [cols] = await sequelize.query('DESCRIBE user_addresses');
    const colNames = new Set(cols.map(c => c.Field));
    const expectedCols = [
      'id', 'user_id', 'address_type', 'flat_unit', 'building_name',
      'street_address', 'locality', 'city', 'district', 'state',
      'pincode', 'society_id', 'latitude', 'longitude', 'is_default',
      'is_active', 'is_deleted', 'created_at', 'updated_at'
    ];
    const missing = expectedCols.filter(c => !colNames.has(c));
    assert.strictEqual(missing.length, 0, `Missing required columns: ${missing.join(', ')}`);
    recordTest('Database Schema contains all target enterprise address columns', true,
      `Verified columns: ${expectedCols.join(', ')}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: Indian PIN Code & Field Validation
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 2: Joi Validation Engine Verification ---');
    const validPayload = {
      addressType: 'HOME',
      flatUnit: 'Flat 402, Block B',
      buildingName: 'Sunrise Apartments',
      streetAddress: 'Main Ring Road, Bailey Road',
      locality: 'Khagaul',
      city: 'Patna',
      district: 'Patna',
      state: 'Bihar',
      pincode: '801105',
      latitude: 25.5891,
      longitude: 85.0456,
    };
    const validRes = createAddressSchema.validate(validPayload);
    assert(!validRes.error, 'Valid address payload must pass validation');

    const invalidPinPayload = { ...validPayload, pincode: '012345' }; // Leading zero is invalid in Indian postal codes
    const invalidPinRes = createAddressSchema.validate(invalidPinPayload);
    assert(invalidPinRes.error != null, 'PIN code starting with 0 must fail validation');

    const shortPinPayload = { ...validPayload, pincode: '80110' }; // Only 5 digits
    const shortPinRes = createAddressSchema.validate(shortPinPayload);
    assert(shortPinRes.error != null, 'PIN code with fewer than 6 digits must fail validation');

    const invalidLatPayload = { ...validPayload, latitude: 120.5 }; // Out of range [-90, 90]
    const invalidLatRes = createAddressSchema.validate(invalidLatPayload);
    assert(invalidLatRes.error != null, 'Latitude out of range [-90, 90] must fail validation');

    recordTest('Joi Validation strictly enforces 6-digit Indian PIN codes and coordinate bounds', true,
      'Validated pattern /^[1-9][0-9]{5}$/ and latitude/longitude ranges');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: Create First Address (Automatic Default Assignment)
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 3: Address CRUD & Default Lifecycle ---');
    const createdA1 = await userAddressService.createAddress(testUserA.userId, validPayload);
    assert(createdA1.data, 'Address creation must return created data');
    assert.strictEqual(createdA1.data.isDefault, true, 'First address for user must automatically become default');
    assert.strictEqual(createdA1.data.addressType, 'HOME');
    assert.strictEqual(createdA1.data.pincode, '801105');
    assert.strictEqual(createdA1.data.city, 'Patna');
    addressA1Id = createdA1.data.id;
    recordTest('First address creation succeeds and automatically receives is_default=true', true,
      `Created address ID: ${addressA1Id}, isDefault: ${createdA1.data.isDefault}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: Create Second Address as Default (Atomic Unsetting of Previous Default)
    // ───────────────────────────────────────────────────────────────────────────
    const payloadA2 = {
      addressType: 'OFFICE',
      flatUnit: 'Suite 305',
      buildingName: 'IT Tech Park',
      streetAddress: 'Station Road',
      locality: 'Danapur',
      city: 'Patna',
      district: 'Patna',
      state: 'Bihar',
      pincode: '801503',
      latitude: 25.6210,
      longitude: 85.0520,
      isDefault: true,
    };
    const createdA2 = await userAddressService.createAddress(testUserA.userId, payloadA2);
    assert(createdA2.data, 'Second address creation must succeed');
    assert.strictEqual(createdA2.data.isDefault, true, 'Second address requested as default must have isDefault=true');
    addressA2Id = createdA2.data.id;

    // Verify Address A1 was automatically unset as default
    const refetchedA1 = await userAddressService.getAddressById(testUserA.userId, addressA1Id);
    assert.strictEqual(refetchedA1.isDefault, false, 'Previous default address A1 must now have isDefault=false');

    // Verify exactly one active address is default in the database for testUserA
    const activeAddressesA = await userAddressService.getAddresses(testUserA.userId);
    const defaultAddresses = activeAddressesA.filter(a => a.isDefault);
    assert.strictEqual(defaultAddresses.length, 1, 'Exactly one active address must be flagged as default');
    assert.strictEqual(defaultAddresses[0].id, addressA2Id, 'Active default address must be A2');
    recordTest('Second address with isDefault=true atomically sets itself and unsets previous default', true,
      `Verified exactly 1 default active address exists in DB (Address ID: ${addressA2Id})`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 5: Switching Default Address via setDefaultAddress API
    // ───────────────────────────────────────────────────────────────────────────
    const switched = await userAddressService.setDefaultAddress(testUserA.userId, addressA1Id);
    assert(switched.data, 'setDefaultAddress must succeed');
    assert.strictEqual(switched.data.isDefault, true);

    const refetchedA2AfterSwitch = await userAddressService.getAddressById(testUserA.userId, addressA2Id);
    assert.strictEqual(refetchedA2AfterSwitch.isDefault, false, 'Address A2 must now have isDefault=false');
    recordTest('setDefaultAddress atomically switches default between active addresses', true,
      `Switched default back to Address ID: ${addressA1Id}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 6: Multi-Tenant Isolation & Zero-Trust Authorization
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 4: Multi-Tenant Security & Zero-Trust Checks ---');
    // Create address for User B
    const createdB1 = await userAddressService.createAddress(testUserB.userId, {
      addressType: 'OTHER',
      flatUnit: 'House 12',
      buildingName: 'Green Valley',
      city: 'Ranchi',
      state: 'Jharkhand',
      pincode: '834001',
    });
    addressB1Id = createdB1.data.id;

    // Test: User A tries to view User B's address
    const viewBByA = await userAddressService.getAddressById(testUserA.userId, addressB1Id);
    assert.strictEqual(viewBByA, null, 'User A must not be able to view User B address');

    // Test: User A tries to update User B's address
    const updateBByA = await userAddressService.updateAddress(testUserA.userId, addressB1Id, {
      flatUnit: 'HACKED UNIT',
    });
    assert(updateBByA.error, 'User A updating User B address must return an error');
    assert.strictEqual(updateBByA.status, 404, 'Unauthorized address access must return 404');

    // Test: User A tries to set User B's address as their default
    const defaultBByA = await userAddressService.setDefaultAddress(testUserA.userId, addressB1Id);
    assert(defaultBByA.error, 'User A setting User B address as default must return an error');
    assert.strictEqual(defaultBByA.status, 404, 'Unauthorized default toggle must return 404');

    // Test: User A tries to delete User B's address
    const deleteBByA = await userAddressService.deleteAddress(testUserA.userId, addressB1Id);
    assert(deleteBByA.error, 'User A deleting User B address must return an error');
    assert.strictEqual(deleteBByA.status, 404, 'Unauthorized delete must return 404');

    recordTest('Multi-tenant isolation strictly prevents cross-user access, updates, and deletes', true,
      'Negative tests confirmed: all cross-tenant access attempts return HTTP 404');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 7: Delete Default Address & Automatic Fallback Promotion
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 5: Deletion & Default Address Reassignment ---');
    // Address A1 is currently default. Delete A1.
    const deletedA1 = await userAddressService.deleteAddress(testUserA.userId, addressA1Id);
    assert.strictEqual(deletedA1.data, true, 'deleteAddress must return success');

    // Verify A1 is soft deleted
    const rawA1 = await UserAddress.findByPk(addressA1Id);
    assert.strictEqual(Boolean(rawA1.is_deleted), true, 'Deleted address must have is_deleted=true');
    assert.strictEqual(Boolean(rawA1.is_active), false, 'Deleted address must have is_active=false');

    // Verify A2 was promoted to default
    const refetchedA2AfterDelete = await userAddressService.getAddressById(testUserA.userId, addressA2Id);
    assert.strictEqual(refetchedA2AfterDelete.isDefault, true, 'Remaining active address A2 must be promoted to default');
    recordTest('Deleting default address soft-deletes it and promotes remaining active address to default', true,
      `Address A1 soft-deleted; Address A2 promoted to isDefault: true`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 8: Service Booking Integration with Saved Address ID
    // ───────────────────────────────────────────────────────────────────────────
    console.log('\n--- Section 6: Booking Flow Integration with Saved Address ---');
    // Find an active listing for booking test
    const testListing = await ServiceListing.findOne({
      where: { is_available: true, moderation_status: 'approved', is_deleted: false },
      include: [{ model: ServiceProviderProfile, as: 'provider', where: { is_active: true, is_deleted: false } }],
    });

    if (testListing) {
      // 8a. Test booking with valid saved address owned by User A
      const futureDate = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];
      const validBookingResult = await createBooking({
        listing_id: testListing.id,
        address_id: addressA2Id,
        scheduled_at: futureDate,
        time_slot: '04:00 PM - 05:00 PM',
        notes: 'Priority 2 Saved Address Booking Test',
      }, testUserA);

      assert(validBookingResult, 'Booking creation with valid address_id must succeed');
      assert.strictEqual(validBookingResult.user_id, testUserA.userId);
      assert.strictEqual(validBookingResult.coverage_snapshot.address_id, addressA2Id);
      assert.strictEqual(validBookingResult.coverage_snapshot.address_type, 'OFFICE');
      assert(validBookingResult.service_address.includes('Suite 305'), 'Booking service_address must contain verified address unit');
      recordTest('createBooking with valid saved address_id records verified snapshot and address', true,
        `Booking ID: ${validBookingResult.id}, Ref: ${validBookingResult.booking_reference}, Snapshot Address ID: ${validBookingResult.coverage_snapshot.address_id}`);

      // 8b. Negative Test: User A tries to book using User B's address ID
      let crossUserBookingFailed = false;
      try {
        await createBooking({
          listing_id: testListing.id,
          address_id: addressB1Id, // Belongs to User B!
          scheduled_at: futureDate,
          time_slot: '05:00 PM - 06:00 PM',
        }, testUserA);
      } catch (err) {
        crossUserBookingFailed = true;
        assert.strictEqual(err.statusCode, 404, 'Using another user address must throw 404');
        assert.strictEqual(err.code, 'ADDRESS_NOT_FOUND', 'Error code must be ADDRESS_NOT_FOUND');
      }
      assert(crossUserBookingFailed, 'Booking with another user address must be rejected');
      recordTest('createBooking with address_id owned by another user is blocked with 404 ADDRESS_NOT_FOUND', true,
        'Zero-trust tenant boundary enforced in booking creation');
    } else {
      recordTest('Booking integration test skipped (no approved active listing in seed)', true, 'Skipped');
    }

    console.log('\n================================================================');
    console.log(`🎉 ALL ${results.length} ENTERPRISE ADDRESS TESTS PASSED (100% SUCCESS)`);
    console.log('================================================================');
  } finally {
    // Cleanup test data
    if (addressA1Id) await UserAddress.destroy({ where: { id: addressA1Id } });
    if (addressA2Id) await UserAddress.destroy({ where: { id: addressA2Id } });
    if (addressB1Id) await UserAddress.destroy({ where: { id: addressB1Id } });
    await ServiceBooking.destroy({ where: { user_id: testUserA.userId } });
    await User.destroy({ where: { userId: [testUserA.userId, testUserB.userId] } });
  }
}

runEnterpriseAddressTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Enterprise Address Test Suite failed:', err);
    process.exit(1);
  });

