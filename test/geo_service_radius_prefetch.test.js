import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateBusinessMatch,
} from '../src/modules/business_profile/business_coverage.service.js';
import {
  calculateHaversineDistanceKm,
} from '../src/modules/service_booking/service_coverage.service.js';

test('Enterprise Geo Service Radius & Prefetch Envelope Strict Matching', async (t) => {
  const shopOrigin = { latitude: 25.5817, longitude: 85.0559 }; // Khagaul, Patna

  const nike15KmStore = {
    id: 101,
    businessName: 'Nike Store',
    coverage_scope: 'PUBLIC',
    city_id: 1,
    city_name: 'Patna',
    locality_id: 9,
    locality_name: 'Khagaul',
    pincode: '801105',
    latitude: shopOrigin.latitude,
    longitude: shopOrigin.longitude,
    default_radius_km: 15.0,
  };

  const radiusArea15Km = [
    {
      id: 1,
      coverage_scope: 'PUBLIC',
      coverage_method: 'RADIUS',
      origin_latitude: shopOrigin.latitude,
      origin_longitude: shopOrigin.longitude,
      resolved_radius_km: 15.0,
      is_active: true,
      is_deleted: false,
    },
  ];

  await t.test('Pin ~14 km away with 25 km prefetch matches 15 km store', () => {
    // Move north ~14.0 km from 25.5817 -> +0.126 deg lat (~14.01 km)
    const pinLat = 25.7077;
    const pinLng = 85.0559;
    const dist = calculateHaversineDistanceKm(pinLat, pinLng, shopOrigin.latitude, shopOrigin.longitude);
    assert.ok(dist > 13.5 && dist < 14.5, `Expected ~14km, got ${dist}`);

    const res = evaluateBusinessMatch(nike15KmStore, radiusArea15Km, [], {
      hasLocationFilter: true,
      latitude: pinLat,
      longitude: pinLng,
      radius_km: 25.0,
    });
    assert.equal(res.matched, true);
    assert.equal(res.matched_by, 'RADIUS');
    assert.ok(res.distance_km <= 15.0);
  });

  await t.test('Pin ~16.5 km away (outside 15 km service area) is excluded even inside 25 km prefetch', () => {
    const pinLat = 25.7302; // ~16.51 km north
    const pinLng = 85.0559;
    const dist = calculateHaversineDistanceKm(pinLat, pinLng, shopOrigin.latitude, shopOrigin.longitude);
    assert.ok(dist > 16.0 && dist < 17.0, `Expected ~16.5km, got ${dist}`);

    const res = evaluateBusinessMatch(nike15KmStore, radiusArea15Km, [], {
      hasLocationFilter: true,
      latitude: pinLat,
      longitude: pinLng,
      radius_km: 25.0,
    });
    assert.equal(res.matched, false);
    assert.equal(res.matched_by, null);
  });

  await t.test('Strict user radius 5 km excludes 15 km store situated 9.5 km away', () => {
    const pinLat = 25.6672; // ~9.5 km north
    const pinLng = 85.0559;
    const res = evaluateBusinessMatch(nike15KmStore, radiusArea15Km, [], {
      hasLocationFilter: true,
      latitude: pinLat,
      longitude: pinLng,
      radius_km: 5.0,
    });
    assert.equal(res.matched, false);
  });

  await t.test('Shop with LOCALITY coverage does NOT falsely match different locality inside 25 km prefetch', () => {
    const localityOnlyAreas = [
      {
        id: 2,
        coverage_scope: 'PUBLIC',
        coverage_method: 'LOCALITY',
        locality_id: 9,
        locality_name: 'Khagaul',
        origin_latitude: shopOrigin.latitude,
        origin_longitude: shopOrigin.longitude,
        is_active: true,
        is_deleted: false,
      },
    ];

    const resOtherLocality = evaluateBusinessMatch(nike15KmStore, localityOnlyAreas, [], {
      hasLocationFilter: true,
      latitude: 25.7302,
      longitude: 85.0559,
      locality_id: 99,
      locality_name: 'Danapur Outer',
      radius_km: 25.0,
    });
    assert.equal(resOtherLocality.matched, false);

    const resSameLocality = evaluateBusinessMatch(nike15KmStore, localityOnlyAreas, [], {
      hasLocationFilter: true,
      latitude: 25.585,
      longitude: 85.060,
      locality_id: 9,
      locality_name: 'Khagaul',
      radius_km: 25.0,
    });
    assert.equal(resSameLocality.matched, true);
    assert.equal(resSameLocality.matched_by, 'LOCALITY');
  });

  await t.test('RADIUS area with null resolved_radius_km respects shop default_radius_km instead of hardcoded 15 km', () => {
    const shop5Km = { ...nike15KmStore, id: 102, default_radius_km: 5.0 };
    const areaNoCap = [
      {
        id: 3,
        coverage_scope: 'PUBLIC',
        coverage_method: 'RADIUS',
        origin_latitude: shopOrigin.latitude,
        origin_longitude: shopOrigin.longitude,
        resolved_radius_km: null,
        is_active: true,
        is_deleted: false,
      },
    ];
    const res = evaluateBusinessMatch(shop5Km, areaNoCap, [], {
      hasLocationFilter: true,
      latitude: 25.6536, // ~8.0 km away
      longitude: 85.0559,
      radius_km: 25.0,
    });
    assert.equal(res.matched, false);
  });
});
