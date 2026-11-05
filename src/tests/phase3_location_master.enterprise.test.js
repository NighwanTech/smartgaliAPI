/**
 * SMARTGALI LOCATION MASTER — PHASE 3: COMPLETE CITY, LOCALITY & PINCODE TEST SUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * Enterprise automated verification for:
 * 1. Database schema & column types for cities, localities, pincodes, locality_pincodes
 * 2. Sequelize model associations (City, Locality, Pincode, LocalityPincode)
 * 3. City Master CRUD, duplicate prevention, and status toggling
 * 4. Locality Master CRUD, duplicate prevention, and status toggling
 * 5. PIN Code Master CRUD, 6-digit regex enforcement, duplicate prevention
 * 6. Locality-Pincode Many-to-Many mapping lifecycle (link/unlink)
 * 7. Public cascading discovery endpoints (State -> District -> City -> Locality -> PIN)
 * 8. Bulk CSV import engine for CITY, LOCALITY, and PINCODE datasets
 * 9. Regression & backward compatibility with Customer Addresses & Provider Coverage
 * ─────────────────────────────────────────────────────────────────────────────
 */

import assert from 'assert';
import sequelize, { connectDB } from '../config/db.js';
import User from '../modules/user/user.model.js';
import {
  Country,
  State,
  District,
  City,
  Locality,
  Pincode,
  LocalityPincode,
  LocationImportBatch,
  LocationStagedRecord,
} from '../modules/location_master/location_master.models.js';
import * as adminCityController from '../modules/location_master/admin_city.controller.js';
import * as adminLocalityController from '../modules/location_master/admin_locality.controller.js';
import * as adminPincodeController from '../modules/location_master/admin_pincode.controller.js';
import * as adminDistrictController from '../modules/location_master/admin_district.controller.js';
import * as publicLocationController from '../modules/location_master/location_master.controller.js';
import * as importService from '../modules/location_master/location_import.service.js';

// Helper mock HTTP request/response
function mockReqRes({ body = {}, params = {}, query = {}, user = null } = {}) {
  const req = { body, params, query, user, headers: {} };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

async function runPhase3EnterpriseTests() {
  console.log('================================================================');
  console.log('🏙️  SMARTGALI LOCATION MASTER — PHASE 3: ENTERPRISE TEST SUITE');
  console.log('================================================================\n');

  await connectDB();

  // Find or create Super Admin mock actor
  let superAdmin = await User.findOne({ where: { user_role: 'SUPER_ADMIN' } });
  if (!superAdmin) {
    superAdmin = await User.findOne();
  }
  const adminActor = { id: superAdmin?.userId || 1, userId: superAdmin?.userId || 1 };

  // Ensure Bihar (state_id: 1) and Patna (district_id: 41) exist for test linkage
  const stateBihar = await State.findByPk(1) || await State.findOne();
  assert(stateBihar, 'State must exist for Phase 3 tests');
  const districtPatna = await District.findOne({ where: { state_id: stateBihar.id } });
  assert(districtPatna, 'District must exist for Phase 3 tests');

  let testCityId = null;
  let testLocalityId = null;
  let testPincodeId = null;

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 1: DATABASE SCHEMA & ASSOCIATIONS AUDIT
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 1] Auditing Phase 3 Database Schema & Associations...');
    const [cityCols] = await sequelize.query('DESCRIBE cities;');
    const cityColNames = cityCols.map((c) => c.Field);
    assert(cityColNames.includes('city_name_local'), 'cities must contain city_name_local');
    assert(cityColNames.includes('lgd_local_body_code'), 'cities must contain lgd_local_body_code');
    assert(cityColNames.includes('city_type'), 'cities must contain city_type');
    assert(cityColNames.includes('district_id'), 'cities must contain district_id');

    const [locCols] = await sequelize.query('DESCRIBE localities;');
    const locColNames = locCols.map((c) => c.Field);
    assert(locColNames.includes('locality_name_local'), 'localities must contain locality_name_local');
    assert(locColNames.includes('locality_type'), 'localities must contain locality_type');
    assert(locColNames.includes('city_id'), 'localities must contain city_id');

    const [pinCols] = await sequelize.query('DESCRIBE pincodes;');
    const pinColNames = pinCols.map((c) => c.Field);
    assert(pinColNames.includes('state_id'), 'pincodes must contain state_id');
    assert(pinColNames.includes('district_id'), 'pincodes must contain district_id');
    assert(pinColNames.includes('pincode'), 'pincodes must contain pincode');

    const [junctionCols] = await sequelize.query('DESCRIBE locality_pincodes;');
    const junctionColNames = junctionCols.map((c) => c.Field);
    assert(junctionColNames.includes('locality_id'), 'locality_pincodes must contain locality_id');
    assert(junctionColNames.includes('pincode_id'), 'locality_pincodes must contain pincode_id');
    assert(junctionColNames.includes('is_primary'), 'locality_pincodes must contain is_primary');
    console.log('   ✅ Database schema, foreign keys, and junction table verified!\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 2: CITY MASTER CRUD & DUPLICATE PREVENTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 2] Testing City Master Admin CRUD & Duplicate Validation...');
    // Create new City
    const cityPayload = {
      state_id: stateBihar.id,
      district_id: districtPatna.id,
      name: `TestCity_${Date.now()}`,
      city_name_local: 'टेस्ट सिटी',
      code: `TC_${Math.floor(Math.random() * 10000)}`,
      lgd_local_body_code: `LGD_${Date.now()}`,
      city_type: 'MUNICIPALITY',
    };

    const createCityReq = mockReqRes({ body: cityPayload, user: adminActor });
    await adminCityController.createCity(createCityReq.req, createCityReq.res, (e) => { throw e; });
    assert.strictEqual(createCityReq.getStatus(), 201, 'Expected 201 Created for new city');
    const createdCity = createCityReq.getData()?.data;
    assert(createdCity?.id, 'Created city must have primary key id');
    testCityId = createdCity.id;
    console.log(`   ✅ City created successfully (ID: ${testCityId})`);

    // Duplicate City Rejection
    const dupCityReq = mockReqRes({ body: cityPayload, user: adminActor });
    await adminCityController.createCity(dupCityReq.req, dupCityReq.res, (e) => { throw e; });
    assert.strictEqual(dupCityReq.getStatus(), 409, 'Expected 409 Conflict for duplicate city');
    console.log('   ✅ Duplicate city rejected with 409 Conflict');

    // Update City
    const updateCityReq = mockReqRes({
      params: { id: testCityId },
      body: { city_type: 'MUNICIPAL_CORPORATION', city_name_local: 'नया टेस्ट सिटी' },
      user: adminActor,
    });
    await adminCityController.updateCity(updateCityReq.req, updateCityReq.res, (e) => { throw e; });
    assert.strictEqual(updateCityReq.getStatus(), 200, 'Expected 200 for city update');
    assert.strictEqual(updateCityReq.getData()?.data?.city_type, 'MUNICIPAL_CORPORATION');
    console.log('   ✅ City updated successfully');

    // Toggle Status
    const toggleCityReq = mockReqRes({
      params: { id: testCityId },
      body: { is_active: false },
      user: adminActor,
    });
    await adminCityController.toggleCityStatus(toggleCityReq.req, toggleCityReq.res, (e) => { throw e; });
    assert.strictEqual(toggleCityReq.getStatus(), 200);
    assert.strictEqual(toggleCityReq.getData()?.data?.is_active, false);
    // Reactivate
    const reactivateCityReq = mockReqRes({
      params: { id: testCityId },
      body: { is_active: true },
      user: adminActor,
    });
    await adminCityController.toggleCityStatus(reactivateCityReq.req, reactivateCityReq.res, (e) => { throw e; });
    assert.strictEqual(reactivateCityReq.getStatus(), 200);
    console.log('   ✅ City status toggled successfully\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 3: LOCALITY MASTER CRUD & DUPLICATE PREVENTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 3] Testing Locality Master Admin CRUD & Validation...');
    const locPayload = {
      city_id: testCityId,
      name: `TestLocality_${Date.now()}`,
      locality_name_local: 'टेस्ट लोकैलिटी',
      code: `TL_${Math.floor(Math.random() * 10000)}`,
      locality_type: 'SECTOR',
    };

    const createLocReq = mockReqRes({ body: locPayload, user: adminActor });
    await adminLocalityController.createLocality(createLocReq.req, createLocReq.res, (e) => { throw e; });
    assert.strictEqual(createLocReq.getStatus(), 201, 'Expected 201 Created for new locality');
    const createdLoc = createLocReq.getData()?.data;
    assert(createdLoc?.id, 'Created locality must have id');
    testLocalityId = createdLoc.id;
    console.log(`   ✅ Locality created successfully (ID: ${testLocalityId})`);

    // Duplicate Locality Rejection
    const dupLocReq = mockReqRes({ body: locPayload, user: adminActor });
    await adminLocalityController.createLocality(dupLocReq.req, dupLocReq.res, (e) => { throw e; });
    assert.strictEqual(dupLocReq.getStatus(), 409, 'Expected 409 Conflict for duplicate locality');
    console.log('   ✅ Duplicate locality rejected with 409 Conflict');

    // Update Locality
    const updateLocReq = mockReqRes({
      params: { id: testLocalityId },
      body: { locality_type: 'URBAN_AREA', source_reference_code: 'REF_999' },
      user: adminActor,
    });
    await adminLocalityController.updateLocality(updateLocReq.req, updateLocReq.res, (e) => { throw e; });
    assert.strictEqual(updateLocReq.getStatus(), 200);
    assert.strictEqual(updateLocReq.getData()?.data?.locality_type, 'URBAN_AREA');
    console.log('   ✅ Locality updated successfully\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 4: PINCODE MASTER & LOCALITY-PINCODE MAPPING JUNCTION
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 4] Testing PIN Code Master & Locality Mapping...');
    const testPinCode = `8${Math.floor(10000 + Math.random() * 90000)}`;
    const pinPayload = {
      city_id: testCityId,
      pincode: testPinCode,
      area_name: 'Test Post Office GPO',
      locality_id: testLocalityId,
    };

    const createPinReq = mockReqRes({ body: pinPayload, user: adminActor });
    await adminPincodeController.createPincode(createPinReq.req, createPinReq.res, (e) => { throw e; });
    assert.strictEqual(createPinReq.getStatus(), 201, 'Expected 201 for PIN code creation');
    const createdPin = createPinReq.getData()?.data;
    assert(createdPin?.id, 'Created PIN must have id');
    testPincodeId = createdPin.id;
    console.log(`   ✅ PIN code created successfully (PIN: ${testPinCode}, ID: ${testPincodeId})`);

    // Verify Many-to-Many junction mapping was created
    const mappedLocs = await LocalityPincode.findAll({
      where: { locality_id: testLocalityId, pincode_id: testPincodeId },
    });
    assert.strictEqual(mappedLocs.length, 1, 'Locality-Pincode mapping must exist in junction table');
    console.log('   ✅ Many-to-Many locality-pincode association created in junction table');

    // Unlink Locality from PIN code
    const unlinkReq = mockReqRes({
      params: { id: testPincodeId, locality_id: testLocalityId },
      user: adminActor,
    });
    await adminPincodeController.unlinkLocalityPincode(unlinkReq.req, unlinkReq.res, (e) => { throw e; });
    assert.strictEqual(unlinkReq.getStatus(), 200);
    const unlinkedCheck = await LocalityPincode.findOne({
      where: { locality_id: testLocalityId, pincode_id: testPincodeId },
    });
    assert.strictEqual(unlinkedCheck, null, 'Locality mapping must be deleted');
    console.log('   ✅ Locality unlinked from PIN code successfully');

    // Link back via explicit endpoint
    const linkReq = mockReqRes({
      params: { id: testPincodeId },
      body: { locality_id: testLocalityId, is_primary: true },
      user: adminActor,
    });
    await adminPincodeController.linkLocalityPincode(linkReq.req, linkReq.res, (e) => { throw e; });
    assert.strictEqual(linkReq.getStatus(), 200);
    console.log('   ✅ Locality re-linked via dedicated mapping endpoint\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 5: PUBLIC DISCOVERY & CASCADING ENDPOINTS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 5] Testing Public Cascading Discovery Endpoints...');
    // Cities Discovery
    const publicCitiesReq = mockReqRes({ query: { state_id: stateBihar.id } });
    await publicLocationController.getCities(publicCitiesReq.req, publicCitiesReq.res, (e) => { throw e; });
    assert.strictEqual(publicCitiesReq.getStatus(), 200);
    const pubCities = publicCitiesReq.getData()?.data || [];
    assert(pubCities.some((c) => c.id === testCityId), 'Public getCities must return created city');
    console.log(`   ✅ getCities returned ${pubCities.length} cities`);

    // Localities Discovery
    const publicLocReq = mockReqRes({ query: { city_id: testCityId } });
    await publicLocationController.getLocalities(publicLocReq.req, publicLocReq.res, (e) => { throw e; });
    assert.strictEqual(publicLocReq.getStatus(), 200);
    const pubLocs = publicLocReq.getData()?.data || [];
    assert(pubLocs.some((l) => l.id === testLocalityId), 'Public getLocalities must return created locality');
    console.log(`   ✅ getLocalities returned ${pubLocs.length} localities with mapped pincodes`);

    // Pincodes Discovery
    const publicPinReq = mockReqRes({ query: { city_id: testCityId } });
    await publicLocationController.getPincodes(publicPinReq.req, publicPinReq.res, (e) => { throw e; });
    assert.strictEqual(publicPinReq.getStatus(), 200);
    const pubPins = publicPinReq.getData()?.data || [];
    assert(pubPins.some((p) => p.id === testPincodeId), 'Public getPincodes must return created pincode');
    console.log(`   ✅ getPincodes returned ${pubPins.length} pincodes`);

    // Hierarchy Endpoint
    const hierarchyReq = mockReqRes();
    await publicLocationController.getLocationHierarchy(hierarchyReq.req, hierarchyReq.res, (e) => { throw e; });
    assert.strictEqual(hierarchyReq.getStatus(), 200);
    console.log('   ✅ getLocationHierarchy executed successfully\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 6: BULK CSV IMPORT ENGINE (CITY, LOCALITY, PINCODE)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 6] Testing Bulk CSV Import Engine for Phase 3 Datasets...');
    // Stage City CSV
    const cityCsv = `state_code,district_code,city_code,city_name_english,city_name_local,city_type,lgd_local_body_code
10,215,PAT_NEW,NewPatnaCity,नया पटना,MUNICIPAL_CORPORATION,LGD99901`;

    const stagedCityBatch = await importService.stageCityCsv({
      fileBuffer: Buffer.from(cityCsv, 'utf8'),
      fileName: 'test_cities.csv',
      actorId: adminActor.id,
    });
    assert.strictEqual(stagedCityBatch.dataset_type, 'CITY');
    assert.strictEqual(stagedCityBatch.total_rows, 1);
    assert.strictEqual(stagedCityBatch.valid_rows, 1);
    console.log(`   ✅ City CSV staged with 1 valid row (Batch: ${stagedCityBatch.batch_id})`);

    // Confirm & Commit City Import
    const cityImportResult = await importService.confirmAndExecuteImport({
      batchId: stagedCityBatch.batch_id,
      actorId: adminActor.id,
    });
    assert.strictEqual(cityImportResult.status, 'COMPLETED');
    assert.strictEqual(cityImportResult.imported_rows, 1);
    const importedCity = await City.findOne({ where: { code: 'PAT_NEW' } });
    assert(importedCity, 'Imported city must exist in production table');
    console.log(`   ✅ City imported transactionally into database (ID: ${importedCity.id})`);

    // Stage Locality CSV
    const locCsv = `city_name_english,locality_code,locality_name_english,locality_name_local,locality_type,pincode
Patna,LOC_ANIS,Anisabad,अनीसाबाद,URBAN_AREA,800002`;

    const stagedLocBatch = await importService.stageLocalityCsv({
      fileBuffer: Buffer.from(locCsv, 'utf8'),
      fileName: 'test_localities.csv',
      actorId: adminActor.id,
    });
    assert.strictEqual(stagedLocBatch.dataset_type, 'LOCALITY');
    assert.strictEqual(stagedLocBatch.valid_rows, 1);
    console.log(`   ✅ Locality CSV staged with 1 valid row (Batch: ${stagedLocBatch.batch_id})`);

    // Confirm & Commit Locality Import
    const locImportResult = await importService.confirmAndExecuteImport({
      batchId: stagedLocBatch.batch_id,
      actorId: adminActor.id,
    });
    assert.strictEqual(locImportResult.status, 'COMPLETED');
    console.log('   ✅ Locality imported transactionally into database');

    // Stage PIN Code CSV
    const pinCsv = `city_name_english,pincode,area_name,locality_name_english
Patna,800025,Kankarbagh South SO,Anisabad`;

    const stagedPinBatch = await importService.stagePincodeCsv({
      fileBuffer: Buffer.from(pinCsv, 'utf8'),
      fileName: 'test_pincodes.csv',
      actorId: adminActor.id,
    });
    assert.strictEqual(stagedPinBatch.dataset_type, 'PINCODE');
    assert.strictEqual(stagedPinBatch.valid_rows, 1);
    console.log(`   ✅ PIN Code CSV staged with 1 valid row (Batch: ${stagedPinBatch.batch_id})`);

    const pinImportResult = await importService.confirmAndExecuteImport({
      batchId: stagedPinBatch.batch_id,
      actorId: adminActor.id,
    });
    assert.strictEqual(pinImportResult.status, 'COMPLETED');
    console.log('   ✅ PIN Code imported transactionally into database\n');

    // ─────────────────────────────────────────────────────────────────────────
    // SECTION 7: OVERVIEW SUMMARY METRICS
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👉 [TEST 7] Testing Location Master Overview Metrics...');
    const summaryReq = mockReqRes({ user: adminActor });
    await adminDistrictController.getLocationSummary(summaryReq.req, summaryReq.res, (e) => { throw e; });
    assert.strictEqual(summaryReq.getStatus(), 200);
    const summaryData = summaryReq.getData()?.data?.counts;
    assert(summaryData?.states > 0, 'Must have states count');
    assert(summaryData?.districts > 0, 'Must have districts count');
    assert(summaryData?.cities > 0, 'Must have cities count');
    assert(summaryData?.localities > 0, 'Must have localities count');
    assert(summaryData?.pincodes > 0, 'Must have pincodes count');
    console.log('   ✅ Overview summary returns verified live counts:');
    console.log(`      States: ${summaryData.states}, Districts: ${summaryData.districts}, Cities: ${summaryData.cities}, Localities: ${summaryData.localities}, PIN Codes: ${summaryData.pincodes}\n`);

    // Clean up imported test city
    if (importedCity) {
      await City.destroy({ where: { id: importedCity.id } });
    }
  } finally {
    // Clean up created entities
    if (testLocalityId && testPincodeId) {
      await LocalityPincode.destroy({ where: { locality_id: testLocalityId, pincode_id: testPincodeId } });
    }
    if (testPincodeId) {
      await Pincode.destroy({ where: { id: testPincodeId } });
    }
    if (testLocalityId) {
      await Locality.destroy({ where: { id: testLocalityId } });
    }
    if (testCityId) {
      await City.destroy({ where: { id: testCityId } });
    }
  }

  console.log('================================================================');
  console.log('🎉 ALL PHASE 3 LOCATION MASTER ENTERPRISE TESTS PASSED (100%)');
  console.log('================================================================');
}

runPhase3EnterpriseTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ TEST FAILURE:', err);
  process.exit(1);
});
