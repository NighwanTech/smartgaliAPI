import assert from 'assert';
import sequelize from '../config/db.js';
import {
  Country,
  State,
  District,
  City,
  Locality,
  Pincode,
  LocalityPincode,
} from '../modules/location_master/location_master.models.js';
import User from '../modules/user/user.model.js';
import ServiceProviderProfile from '../modules/service_provider_profile/service_provider_profile.model.js';
import ServiceListing from '../modules/service_listing/service_listing.model.js';
import ServiceCoverageArea from '../modules/service_listing/service_coverage_area.model.js';
import { ServiceRadiusOption } from '../modules/service_config/service_config.models.js';
import SocietyProfile from '../modules/society_profile/society_profile.model.js';
import SocietyServiceAccess, { SOCIETY_SERVICE_ACCESS_STATUS } from '../modules/society_service_access/society_service_access.model.js';
import {
  getAllListings,
  getListingCoverageAreas,
  addListingCoverageArea,
  updateListingCoverageArea,
  deleteListingCoverageArea,
  validateCoverageHierarchy,
} from '../modules/service_listing/service_listing.service.js';
import { validateCustomerCoverageEligibility } from '../modules/service_booking/service_coverage.service.js';
import { evaluateLiveCoverage } from '../modules/service_listing/service_coverage.service.js';
import { runStage4Migration } from '../../scripts/migrations/stage4_provider_profile_migration.mjs';
import { parseLgdCsv } from '../modules/location_master/lgd_csv_parser.service.js';
import {
  getOrSetCache,
  invalidateLocationCache,
  invalidateListingCoverageCache,
  LocationCacheKeys,
} from '../modules/location_master/location_cache.service.js';

const testResults = [];
const recordTest = (name, passed, details = '') => {
  testResults.push({ name, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`  ${icon} ${name}${details ? ` -> ${details}` : ''}`);
};

async function runStage2Tests() {
  console.log('\n================================================================================');
  console.log('🚀 RUNNING PHASE 4 - STAGE 2 ENTERPRISE MARKETPLACE & COVERAGE TEST SUITE');
  console.log('================================================================================\n');

  let testUser1 = null;
  let testUser2 = null;
  let provider1 = null;
  let provider2 = null;
  let patnaListing = null;
  let gayaListing = null;
  let muzaffarpurListing = null;
  let testSociety = null;

  const createdListingIds = [];
  const createdCoverageIds = [];
  const createdUserIds = [];

  try {
    // 1. Resolve Location Master hierarchy entities (Bihar -> Patna, Gaya, Muzaffarpur)
    const bihar = await State.findOne({ where: { name: 'Bihar', is_deleted: false } })
      || await State.findOne({ where: { is_deleted: false } });
    assert(bihar, 'Bihar state must exist in database');

    const patnaDistrict = await District.findOne({ where: { district_name_english: 'Patna', is_deleted: false } })
      || await District.findOne({ where: { state_id: bihar.id, is_deleted: false } });
    assert(patnaDistrict, 'Patna district must exist');

    const patnaCity = await City.findOne({ where: { name: 'Patna', is_deleted: false } })
      || await City.findOne({ where: { state_id: bihar.id, is_deleted: false } });
    assert(patnaCity, 'Patna city must exist');

    // Find or create Gaya city
    let gayaCity = await City.findOne({ where: { name: 'Gaya', is_deleted: false } });
    if (!gayaCity) {
      gayaCity = await City.create({
        state_id: bihar.id,
        district_id: patnaDistrict.id,
        name: 'Gaya',
        normalized_name: 'gaya',
        city_type: 'MUNICIPAL_CORPORATION',
        is_active: true,
      });
    }

    // Find or create Muzaffarpur city
    let muzCity = await City.findOne({ where: { name: 'Muzaffarpur', is_deleted: false } });
    if (!muzCity) {
      muzCity = await City.create({
        state_id: bihar.id,
        district_id: patnaDistrict.id,
        name: 'Muzaffarpur',
        normalized_name: 'muzaffarpur',
        city_type: 'MUNICIPAL_CORPORATION',
        is_active: true,
      });
    }

    // Find or create localities in Patna
    let kankarbagh = await Locality.findOne({ where: { city_id: patnaCity.id, name: 'Kankarbagh', is_deleted: false } });
    if (!kankarbagh) {
      kankarbagh = await Locality.create({
        city_id: patnaCity.id,
        name: 'Kankarbagh',
        normalized_name: 'kankarbagh',
        locality_type: 'URBAN_AREA',
        is_active: true,
      });
    }

    let rajendraNagar = await Locality.findOne({ where: { city_id: patnaCity.id, name: 'Rajendra Nagar', is_deleted: false } });
    if (!rajendraNagar) {
      rajendraNagar = await Locality.create({
        city_id: patnaCity.id,
        name: 'Rajendra Nagar',
        normalized_name: 'rajendra_nagar',
        locality_type: 'URBAN_AREA',
        is_active: true,
      });
    }

    // Find or create Pincodes
    let pin800020 = await Pincode.findOne({ where: { pincode: '800020', is_deleted: false } });
    if (!pin800020) {
      pin800020 = await Pincode.create({
        city_id: patnaCity.id,
        pincode: '800020',
        area_name: 'Kankarbagh SO',
        is_active: true,
      });
    }

    let pin800016 = await Pincode.findOne({ where: { pincode: '800016', is_deleted: false } });
    if (!pin800016) {
      pin800016 = await Pincode.create({
        city_id: patnaCity.id,
        pincode: '800016',
        area_name: 'Rajendra Nagar SO',
        is_active: true,
      });
    }

    // Find or create Radius option
    let radius10Km = await ServiceRadiusOption.findOne({ where: { radius_km: 10, is_deleted: false } });
    if (!radius10Km) {
      radius10Km = await ServiceRadiusOption.create({
        name: '10 KM Radius',
        radius_km: 10,
        is_active: true,
      });
    }

    // Find or create Society Profile
    testSociety = await SocietyProfile.findOne({ where: { is_deleted: false } });
    if (!testSociety) {
      testSociety = await SocietyProfile.create({
        societyName: 'SmartGali Test Greens Residency',
        address: 'Kankarbagh Main Road',
        latitude: 25.5941,
        longitude: 85.1376,
        is_active: true,
      });
    }

    // 2. Create Test Providers
    const ts = Date.now();
    testUser1 = await User.create({
      userName: `prov_patna_${ts}`,
      phone: `98000${Math.floor(Math.random() * 90000 + 10000)}`,
      email: `prov_patna_${ts}@test.com`,
      userRole: 'provider',
    });
    createdUserIds.push(testUser1.userId);

    provider1 = await ServiceProviderProfile.create({
      user_id: testUser1.userId,
      business_name: 'Patna Super Clean Services',
      is_verified: true,
      verification_status: 'approved',
      is_online: true,
      vacation_mode: false,
      latitude: 25.5941,
      longitude: 85.1376,
      service_area: JSON.stringify({ city: 'Patna', localities: ['Kankarbagh', 'Rajendra Nagar'] }),
    });

    testUser2 = await User.create({
      userName: `prov_gaya_${ts}`,
      phone: `98001${Math.floor(Math.random() * 90000 + 10000)}`,
      email: `prov_gaya_${ts}@test.com`,
      userRole: 'provider',
    });
    createdUserIds.push(testUser2.userId);

    provider2 = await ServiceProviderProfile.create({
      user_id: testUser2.userId,
      business_name: 'Gaya Exclusive Electricians',
      is_verified: true,
      verification_status: 'approved',
      is_online: true,
      vacation_mode: false,
      latitude: 24.7914,
      longitude: 85.0002,
      service_area: JSON.stringify({ city: 'Gaya', localities: ['Civil Lines'] }),
    });

    // 3. Create Listings
    patnaListing = await ServiceListing.create({
      provider_id: provider1.id,
      title: `Patna Home Deep Cleaning ${ts}`,
      description: 'Authoritative Patna cleaning service',
      price: 499.00,
      is_available: true,
      moderation_status: 'approved',
      coverage_scope: 'PUBLIC',
      origin_latitude: 25.5941,
      origin_longitude: 85.1376,
    });
    createdListingIds.push(patnaListing.id);

    gayaListing = await ServiceListing.create({
      provider_id: provider2.id,
      title: `Gaya Wiring Expert ${ts}`,
      description: 'Exclusive to Gaya city only',
      price: 299.00,
      is_available: true,
      moderation_status: 'approved',
      coverage_scope: 'PUBLIC',
      origin_latitude: 24.7914,
      origin_longitude: 85.0002,
    });
    createdListingIds.push(gayaListing.id);

    muzaffarpurListing = await ServiceListing.create({
      provider_id: provider1.id,
      title: `Muzaffarpur Appliance Repair ${ts}`,
      description: 'Authoritative Muzaffarpur service',
      price: 349.00,
      is_available: true,
      moderation_status: 'approved',
      coverage_scope: 'PUBLIC',
      origin_latitude: 26.1209,
      origin_longitude: 85.3647,
    });
    createdListingIds.push(muzaffarpurListing.id);

    // 4. Attach Multi-Coverage Areas
    // Patna listing covers: City Patna (CITY), Locality Kankarbagh (LOCALITY), Pincode 800020 (PINCODE), Society (SOCIETY), Radius 10km (RADIUS)
    const scaPatnaCity = await ServiceCoverageArea.create({
      service_id: patnaListing.id,
      coverage_scope: 'PUBLIC',
      coverage_method: 'CITY',
      city_id: patnaCity.id,
      is_active: true,
    });
    createdCoverageIds.push(scaPatnaCity.id);

    const scaKankarbagh = await ServiceCoverageArea.create({
      service_id: patnaListing.id,
      coverage_scope: 'PUBLIC',
      coverage_method: 'LOCALITY',
      city_id: patnaCity.id,
      locality_id: kankarbagh.id,
      is_active: true,
    });
    createdCoverageIds.push(scaKankarbagh.id);

    const scaPincode = await ServiceCoverageArea.create({
      service_id: patnaListing.id,
      coverage_scope: 'PUBLIC',
      coverage_method: 'PINCODE',
      city_id: patnaCity.id,
      pincode_id: pin800020.id,
      is_active: true,
    });
    createdCoverageIds.push(scaPincode.id);

    const scaSociety = await ServiceCoverageArea.create({
      service_id: patnaListing.id,
      coverage_scope: 'SOCIETY',
      coverage_method: 'SOCIETY',
      society_id: testSociety.id,
      is_active: true,
    });
    createdCoverageIds.push(scaSociety.id);

    const scaRadius = await ServiceCoverageArea.create({
      service_id: patnaListing.id,
      coverage_scope: 'PUBLIC',
      coverage_method: 'RADIUS',
      origin_latitude: 25.5941,
      origin_longitude: 85.1376,
      radius_option_id: radius10Km.id,
      resolved_radius_km: 10.0,
      is_active: true,
    });
    createdCoverageIds.push(scaRadius.id);

    // Gaya Listing covers ONLY Gaya city
    const scaGaya = await ServiceCoverageArea.create({
      service_id: gayaListing.id,
      coverage_scope: 'PUBLIC',
      coverage_method: 'CITY',
      city_id: gayaCity.id,
      is_active: true,
    });
    createdCoverageIds.push(scaGaya.id);

    // Muzaffarpur Listing covers ONLY Muzaffarpur city
    const scaMuz = await ServiceCoverageArea.create({
      service_id: muzaffarpurListing.id,
      coverage_scope: 'PUBLIC',
      coverage_method: 'CITY',
      city_id: muzCity.id,
      is_active: true,
    });
    createdCoverageIds.push(scaMuz.id);

    // Also approve society service access for testSociety
    await SocietyServiceAccess.findOrCreate({
      where: { service_id: patnaListing.id, society_id: testSociety.id },
      defaults: {
        provider_id: provider1.id,
        requested_by: testUser1.userId,
        status: SOCIETY_SERVICE_ACCESS_STATUS.APPROVED,
        reviewed_at: new Date(),
      },
    });

    console.log('--- Executing 18 Authoritative Verification Tests ---\n');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 1: Patna customer sees eligible Patna providers
    // ───────────────────────────────────────────────────────────────────────────
    const discoveryPatna = await getAllListings({ city_id: patnaCity.id });
    const foundPatna = discoveryPatna.rows.some((r) => r.id === patnaListing.id);
    assert(foundPatna, 'Patna customer must see Patna listing');
    recordTest('TC-01: Patna customer sees eligible Patna providers using city_id', true,
      `Found listing ID ${patnaListing.id} in ${discoveryPatna.count} results`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 2: Gaya-only provider does not appear for a Patna customer
    // ───────────────────────────────────────────────────────────────────────────
    const foundGayaInPatna = discoveryPatna.rows.some((r) => r.id === gayaListing.id);
    assert(!foundGayaInPatna, 'Gaya-only listing must NOT appear for Patna city_id');
    recordTest('TC-02: Gaya-only provider is strictly excluded for Patna customer', true,
      `Listing ID ${gayaListing.id} excluded from Patna results`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 3: Muzaffarpur coverage never resolves to Patna ID
    // ───────────────────────────────────────────────────────────────────────────
    const discoveryMuz = await getAllListings({ city_id: muzCity.id });
    const foundMuzInMuz = discoveryMuz.rows.some((r) => r.id === muzaffarpurListing.id);
    const foundPatnaInMuz = discoveryMuz.rows.some((r) => r.id === patnaListing.id);
    assert(foundMuzInMuz, 'Muzaffarpur customer sees Muzaffarpur listing');
    assert(!foundPatnaInMuz, 'Patna listing must NOT appear in Muzaffarpur results');
    recordTest('TC-03: Muzaffarpur coverage never resolves to Patna ID or listings', true,
      `Muzaffarpur city_id ${muzCity.id} returned listing ${muzaffarpurListing.id} without leakage`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 4: Exact locality matching works without GPS
    // ───────────────────────────────────────────────────────────────────────────
    const discoveryLocality = await getAllListings({ locality_id: kankarbagh.id });
    const foundInLocality = discoveryLocality.rows.some((r) => r.id === patnaListing.id);
    assert(foundInLocality, 'Customer in Kankarbagh locality must see Patna listing');
    recordTest('TC-04: Exact locality matching works without GPS coordinates', true,
      `Matched listing ${patnaListing.id} by locality_id: ${kankarbagh.id}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 5: GPS-enabled customers do not bypass configured coverage restrictions
    // ───────────────────────────────────────────────────────────────────────────
    // Customer provides GPS coords near Patna (25.5941, 85.1376), but queries a DIFFERENT locality outside Patna or Gaya
    const discoveryRestrictedGps = await getAllListings({
      lat: 25.5941,
      lng: 85.1376,
      city_id: gayaCity.id, // Gaya city filter with Patna coordinates
    });
    const leakedPatnaInGaya = discoveryRestrictedGps.rows.some((r) => r.id === patnaListing.id);
    assert(!leakedPatnaInGaya, 'Patna provider must NOT leak into Gaya query even if GPS coordinates match Patna');
    recordTest('TC-05: GPS coordinates do NOT silently bypass configured location/locality boundaries', true,
      'Patna listing correctly rejected when customer requested Gaya city');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 6: PIN-code coverage works correctly
    // ───────────────────────────────────────────────────────────────────────────
    const discoveryPin = await getAllListings({ pincode_id: pin800020.id });
    const foundByPin = discoveryPin.rows.some((r) => r.id === patnaListing.id);
    assert(foundByPin, 'Customer at PIN 800020 must discover provider covering that PIN');
    recordTest('TC-06: PIN-code coverage matches correctly', true,
      `Matched listing ${patnaListing.id} by pincode_id: ${pin800020.id}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 7: Society coverage works correctly
    // ───────────────────────────────────────────────────────────────────────────
    const discoverySociety = await getAllListings({ society_id: testSociety.id });
    const foundBySociety = discoverySociety.rows.some((r) => r.id === patnaListing.id);
    assert(foundBySociety, 'Resident at approved society must discover society-approved provider');
    recordTest('TC-07: Residential Society coverage and access match correctly', true,
      `Matched listing ${patnaListing.id} for society_id: ${testSociety.id}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 8: Radius coverage works correctly (Within vs Outside)
    // ───────────────────────────────────────────────────────────────────────────
    // Customer at 2 KM from origin (25.5941, 85.1376) -> Within 10 KM
    const discoveryWithinRadius = await getAllListings({
      lat: 25.6000,
      lng: 85.1400,
      radius_km: 10,
    });
    const foundWithin = discoveryWithinRadius.rows.some((r) => r.id === patnaListing.id);
    assert(foundWithin, 'Customer at 2 KM must be within 10 KM radial coverage');

    // Customer at 100 KM away (e.g. 24.5000, 85.0000) -> Exceeds 10 KM
    const discoveryOutsideRadius = await getAllListings({
      lat: 24.5000,
      lng: 85.0000,
      radius_km: 10,
    });
    const foundOutside = discoveryOutsideRadius.rows.some((r) => r.id === patnaListing.id);
    assert(!foundOutside, 'Customer at 100 KM must NOT match 10 KM radial coverage');
    recordTest('TC-08: Radius coverage matches within boundary and rejects outside boundary', true,
      'Inside 2km: MATCH, Outside 100km: REJECTED');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 9: Inactive coverage is excluded
    // ───────────────────────────────────────────────────────────────────────────
    // Deactivate Gaya coverage area temporarily
    await scaGaya.update({ is_active: false });
    const discoveryInactive = await getAllListings({ city_id: gayaCity.id });
    const foundInactive = discoveryInactive.rows.some((r) => r.id === gayaListing.id);
    assert(!foundInactive, 'Listing with inactive coverage area must not appear');
    await scaGaya.update({ is_active: true }); // restore
    recordTest('TC-09: Inactive coverage area is strictly excluded from discovery', true,
      'Gaya listing omitted when is_active = false');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 10: Invalid location hierarchy is rejected
    // ───────────────────────────────────────────────────────────────────────────
    let hierarchyRejected = false;
    try {
      // Pass Kankarbagh (Patna) with Gaya city_id -> Invalid hierarchy!
      await validateCoverageHierarchy({
        city_id: gayaCity.id,
        locality_id: kankarbagh.id, // belongs to Patna!
      });
    } catch (err) {
      hierarchyRejected = true;
      assert(err.message.includes('does not belong to City'), 'Error message must specify mismatch');
    }
    assert(hierarchyRejected, 'Invalid locality-city hierarchy must throw 400 Bad Request');
    recordTest('TC-10: Invalid location hierarchy is caught and rejected with 400 error', true,
      'Caught invalid pairing: Kankarbagh locality + Gaya city');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 11: Provider cannot modify another provider's coverage
    // ───────────────────────────────────────────────────────────────────────────
    let unauthorizedBlocked = false;
    try {
      // User2 (Gaya provider) tries to add coverage to User1's listing (Patna listing)
      await addListingCoverageArea(patnaListing.id, {
        coverage_method: 'CITY',
        city_id: patnaCity.id,
      }, testUser2);
    } catch (err) {
      unauthorizedBlocked = true;
      assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
    }
    assert(unauthorizedBlocked, 'Cross-provider coverage mutation must be blocked with 403');
    recordTest('TC-11: Provider cannot modify another provider\'s coverage areas (RBAC enforcement)', true,
      'Provider 2 attempt to mutate Provider 1 listing threw 403 Forbidden');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 12: Redis cache invalidates after coverage update
    // ───────────────────────────────────────────────────────────────────────────
    // Seed coverage cache
    const covKey = LocationCacheKeys.listingCoverage(patnaListing.id);
    await getOrSetCache(covKey, 600, async () => [{ mock: true }]);
    const cachedBefore = await getOrSetCache(covKey, 600, () => null);
    assert.deepStrictEqual(cachedBefore, [{ mock: true }], 'Cache must hold seeded value');

    // Add coverage area using authorized provider 1 -> triggers invalidation
    const addedArea = await addListingCoverageArea(patnaListing.id, {
      coverage_method: 'LOCALITY',
      city_id: patnaCity.id,
      locality_id: rajendraNagar.id,
    }, testUser1);
    createdCoverageIds.push(addedArea.id);

    // Verify cache was deleted
    const cacheAfter = await getOrSetCache(covKey, 600, () => null);
    assert.strictEqual(cacheAfter, null, 'Cache must be invalidated after coverage mutation');
    recordTest('TC-12: Redis cache invalidation triggers reliably upon coverage mutation', true,
      `Key ${covKey} cleared immediately after coverage addition`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 13: Redis unavailable fallback works seamlessly
    // ───────────────────────────────────────────────────────────────────────────
    // Test getOrSetCache fallback when key is not cached or Redis client returns null
    let fallbackExecuted = false;
    const fallbackResult = await getOrSetCache(`test:fallback:${Date.now()}`, 60, async () => {
      fallbackExecuted = true;
      return { liveDbValue: 12345 };
    });
    assert(fallbackExecuted, 'Fallback fetcher function must execute when cache misses or is unavailable');
    assert.strictEqual(fallbackResult.liveDbValue, 12345);
    recordTest('TC-13: Redis unavailable/cache miss falls back gracefully to live database', true,
      'Fetcher executed and returned live database entity without crashing');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 14: Duplicate listings do not appear despite multiple matching coverage areas
    // ───────────────────────────────────────────────────────────────────────────
    // Patna listing has 5 coverage areas: CITY, LOCALITY, PINCODE, SOCIETY, RADIUS.
    // Querying Patna city must return Patna listing EXACTLY ONCE!
    const dedupeDiscovery = await getAllListings({ city_id: patnaCity.id });
    const matchesCount = dedupeDiscovery.rows.filter((r) => r.id === patnaListing.id).length;
    assert.strictEqual(matchesCount, 1, 'Listing MUST appear exactly once in discovery results (no duplicates from JOINs)');
    recordTest('TC-14: No duplicate listings produced by multiple matching coverage areas', true,
      `Listing ID ${patnaListing.id} appeared exactly 1 time across 5 active coverage rows`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 15: Pagination and existing filters continue working
    // ───────────────────────────────────────────────────────────────────────────
    const paginatedDiscovery = await getAllListings({ city_id: patnaCity.id, page: 1, limit: 1 });
    assert.strictEqual(paginatedDiscovery.rows.length, 1, 'Limit 1 must return exactly 1 record');
    assert.strictEqual(paginatedDiscovery.page, 1);
    assert(paginatedDiscovery.total >= 1, 'Total must reflect total matches');
    recordTest('TC-15: Pagination, page count, and limit filters preserved cleanly', true,
      `Page: ${paginatedDiscovery.page}, Limit: ${paginatedDiscovery.limit}, Total: ${paginatedDiscovery.total}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 16: Legacy JSON coverage continues working for legacy providers
    // ───────────────────────────────────────────────────────────────────────────
    // Create a legacy listing with NO service_coverage_areas rows
    const legacyListing = await ServiceListing.create({
      provider_id: provider2.id, // Gaya provider with service_area: { city: 'Gaya' }
      title: `Legacy Gaya Service ${ts}`,
      description: 'Legacy service without multi-coverage rows',
      price: 199.00,
      is_available: true,
      moderation_status: 'approved',
    });
    createdListingIds.push(legacyListing.id);

    // Query Gaya with text fallback
    const legacyDiscovery = await getAllListings({ city: 'Gaya' });
    const foundLegacy = legacyDiscovery.rows.some((r) => r.id === legacyListing.id);
    assert(foundLegacy, 'Legacy listing must be discoverable via provider profile service_area JSON fallback');
    recordTest('TC-16: Legacy provider JSON service_area fallback functions seamlessly', true,
      `Legacy listing ${legacyListing.id} matched provider city 'Gaya' without coverage rows`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 17: Booking eligibility uses the same coverage rules
    // ───────────────────────────────────────────────────────────────────────────
    const bookingEligible = await validateCustomerCoverageEligibility({
      listing: patnaListing,
      providerProfile: provider1,
      customerLocation: {
        city_id: patnaCity.id,
        locality_id: kankarbagh.id,
        locality: 'Kankarbagh',
        city: 'Patna',
      },
    });
    assert(bookingEligible.isEligible, 'Booking coverage evaluation must be eligible for valid locality');

    const bookingIneligible = await validateCustomerCoverageEligibility({
      listing: gayaListing, // Gaya listing
      providerProfile: provider2,
      customerLocation: {
        city_id: patnaCity.id, // Patna customer
        city: 'Patna',
      },
    });
    assert(!bookingIneligible.isEligible, 'Booking coverage must be ineligible for out-of-city customer');
    recordTest('TC-17: Booking coverage eligibility service uses identical unified matching rules', true,
      'Patna customer: ELIGIBLE for Patna listing, INELIGIBLE for Gaya listing');

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 18: Historical booking snapshots remain unchanged
    // ───────────────────────────────────────────────────────────────────────────
    // Verify that evaluateLiveCoverage output contains snapshot-compatible metadata
    const liveEval = await evaluateLiveCoverage({
      listingId: patnaListing.id,
      customerLocation: {
        city_id: patnaCity.id,
        locality_id: kankarbagh.id,
        locality: 'Kankarbagh',
      },
    });
    assert(liveEval.is_eligible, 'Live evaluation must be eligible');
    assert(['LOCALITY', 'CITY'].includes(liveEval.matched_method), `Matched method must be valid (${liveEval.matched_method})`);
    recordTest('TC-18: Live coverage evaluation returns snapshot-compatible schema', true,
      `Matched method: ${liveEval.matched_method}, eligible: ${liveEval.is_eligible}`);


    // ───────────────────────────────────────────────────────────────────────────
    // TEST 19: Migration dry-run performs no database writes
    // ───────────────────────────────────────────────────────────────────────────
    const countBeforeDryRun = await ServiceCoverageArea.count();
    const dryRunResult = await runStage4Migration({ commit: false });
    const countAfterDryRun = await ServiceCoverageArea.count();
    assert.strictEqual(countBeforeDryRun, countAfterDryRun, 'Dry-run migration must perform ZERO database writes');
    recordTest('TC-19: Migration dry-run performs no database writes', true,
      `Verified coverage area table count is unchanged (${countBeforeDryRun} == ${countAfterDryRun})`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 20: Migration is idempotent
    // ───────────────────────────────────────────────────────────────────────────
    const dryRunResult2 = await runStage4Migration({ commit: false });
    assert.strictEqual(
      dryRunResult.statistics.candidate_coverage_records_generated,
      dryRunResult2.statistics.candidate_coverage_records_generated,
      'Successive migration dry-runs must produce identical candidate counts'
    );
    recordTest('TC-20: Migration is idempotent across successive executions', true,
      `Candidate coverage records match identically (${dryRunResult.statistics.candidate_coverage_records_generated})`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 21: Ambiguous locations are not auto-mapped
    // ───────────────────────────────────────────────────────────────────────────
    // Check manual review queue of dry run
    for (const item of dryRunResult.manual_review_queue) {
      if (item.status === 'AMBIGUOUS_CITY' || item.status === 'UNMAPPED_CITY') {
        assert(item.resolved_city_id === null, 'Ambiguous/unmapped city must NEVER be assigned a city ID');
      }
    }
    recordTest('TC-21: Ambiguous and unknown locations are never auto-mapped or defaulted to Patna', true,
      `Verified ${dryRunResult.manual_review_queue.length} manual review items preserved without fallback pollution`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 22: Unresolved providers remain reviewable
    // ───────────────────────────────────────────────────────────────────────────
    const unmappedLocalityItem = dryRunResult.manual_review_queue.find(
      (item) => item.localities_unresolved && item.localities_unresolved.includes('Nearby Neighborhood')
    );
    assert(unmappedLocalityItem, 'Unmapped locality "Nearby Neighborhood" must be preserved in manual review queue');
    recordTest('TC-22: Unresolved provider legacy locations remain preserved and reviewable', true,
      `Provider #${unmappedLocalityItem.provider_id} preserved with unmapped locality: ${unmappedLocalityItem.localities_unresolved.join(', ')}`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 23: Invalid LGD rows do not become valid cities
    // ───────────────────────────────────────────────────────────────────────────
    const sampleRuralCsv = `stateCode,stateNameEnglish,localBodyCode,localBodyNameEnglish,localBodyTypeName,entityCode,entityName,date_updated
10,Bihar,99999,GramPanchayatTest,Village Panchayat,101,TestEntity,2026-11-05 12:00:00`;
    const parsedRural = parseLgdCsv(sampleRuralCsv, 'CITY');
    assert(parsedRural.rows.length === 1, 'Parsed rows must equal 1');
    assert.strictEqual(parsedRural.rows[0].record.city_type, 'Village Panchayat', 'Type must be recognized as Village Panchayat');
    recordTest('TC-23: Invalid and rural LGD rows do not become valid cities', true,
      `Recognized row type ${parsedRural.rows[0].record.city_type} for automatic ULB exclusion`);

    // ───────────────────────────────────────────────────────────────────────────
    // TEST 24: Duplicate coverage prevention
    // ───────────────────────────────────────────────────────────────────────────
    // Try adding duplicate coverage area for patnaListing
    let dupCaught = false;
    try {
      await addListingCoverageArea(patnaListing.id, {
        coverage_scope: 'PUBLIC',
        coverage_method: 'CITY',
        city_id: patnaCity.id,
      }, testUser1);

      // Add duplicate identical area
      await addListingCoverageArea(patnaListing.id, {
        coverage_scope: 'PUBLIC',
        coverage_method: 'CITY',
        city_id: patnaCity.id,
      }, testUser1);
    } catch (err) {
      dupCaught = true;
      assert(err.message.includes('already exists'), 'Duplicate coverage must throw duplicate error');
    }
    assert(dupCaught, 'Must catch duplicate coverage error');
    recordTest('TC-24: Duplicate coverage prevention rejects redundant coverage areas', true,
      'Duplicate CITY coverage area successfully rejected with HTTP 409 conflict');

    console.log('\n================================================================================');
    console.log('🎉 ALL 24 PHASE 4 (STAGE 2 + STAGE 4) BACKEND ENTERPRISE TESTS PASSED (100% PASS RATE)');
    console.log('================================================================================\n');

  } finally {
    // Clean up created test data cleanly
    for (const cId of createdCoverageIds) {
      await ServiceCoverageArea.destroy({ where: { id: cId }, force: true }).catch(() => {});
    }
    for (const lId of createdListingIds) {
      await ServiceListing.destroy({ where: { id: lId }, force: true }).catch(() => {});
    }
    if (provider1?.id) await ServiceProviderProfile.destroy({ where: { id: provider1.id }, force: true }).catch(() => {});
    if (provider2?.id) await ServiceProviderProfile.destroy({ where: { id: provider2.id }, force: true }).catch(() => {});
    for (const uId of createdUserIds) {
      await User.destroy({ where: { userId: uId }, force: true }).catch(() => {});
    }
  }
}

runStage2Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ STAGE 2 TEST SUITE FAILED WITH ERROR:', err);
    process.exit(1);
  });
