/**
 * SmartGali — Stage 4 Provider Profile Normalization & Coverage Migration
 * ─────────────────────────────────────────────────────────────────────────────
 * Safe, idempotent migration engine that maps legacy provider `service_area`
 * JSON into structured Location Master IDs and `service_coverage_areas`.
 *
 * Safety Guarantees:
 * 1. Defaults to --dry-run. No database mutation unless --commit is specified.
 * 2. Never deletes or alters historical `service_area` legacy JSON.
 * 3. Never assigns unknown or ambiguous providers to default cities (Patna).
 * 4. Generates an exhaustive audit report with full trace and manual review queue.
 * 5. Idempotent: Can be run repeatedly without creating duplicate coverage areas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../src/config/db.js';
import ServiceProviderProfile from '../../src/modules/service_provider_profile/service_provider_profile.model.js';
import ServiceListing from '../../src/modules/service_listing/service_listing.model.js';
import ServiceCoverageArea from '../../src/modules/service_listing/service_coverage_area.model.js';
import { State, District, City, Locality, Pincode } from '../../src/modules/location_master/location_master.models.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const runStage4Migration = async (options = {}) => {
  const isCommit = Boolean(options.commit);
  const verbose = Boolean(options.verbose);

  console.log('================================================================================');
  console.log(`🚀 STAGE 4: PROVIDER PROFILE NORMALIZATION & COVERAGE MIGRATION`);
  console.log(`MODE: ${isCommit ? '🔴 LIVE COMMIT (MUTATION ENABLED)' : '🟢 DRY-RUN (READ-ONLY SIMULATION)'}`);
  console.log('================================================================================\n');

  // 1. Fetch Reference Location Masters
  const [states, districts, cities, localities, pincodes] = await Promise.all([
    State.findAll({ where: { is_deleted: false } }),
    District.findAll({ where: { is_deleted: false } }),
    City.findAll({ where: { is_deleted: false } }),
    Locality.findAll({ where: { is_deleted: false } }),
    Pincode.findAll({ where: { is_deleted: false } }),
  ]);

  // Index references for rapid, unambiguous lookup
  const citiesByName = new Map();
  const citiesByNorm = new Map();
  for (const c of cities) {
    const rawName = c.name.trim();
    if (!citiesByName.has(rawName)) citiesByName.set(rawName, []);
    citiesByName.get(rawName).push(c);

    const norm = (c.normalized_name || rawName.toLowerCase()).trim();
    if (!citiesByNorm.has(norm)) citiesByNorm.set(norm, []);
    citiesByNorm.get(norm).push(c);
  }

  const localitiesByCityAndNorm = new Map();
  for (const l of localities) {
    const key = `${l.city_id}_${(l.normalized_name || l.name.toLowerCase()).trim()}`;
    if (!localitiesByCityAndNorm.has(key)) localitiesByCityAndNorm.set(key, []);
    localitiesByCityAndNorm.get(key).push(l);
  }

  const pincodesByCode = new Map();
  for (const p of pincodes) {
    const code = String(p.pincode).trim();
    if (!pincodesByCode.has(code)) pincodesByCode.set(code, []);
    pincodesByCode.get(code).push(p);
  }

  // 2. Fetch all active provider profiles
  const profiles = await ServiceProviderProfile.findAll({
    where: { is_deleted: false },
    order: [['id', 'ASC']],
  });

  const stats = {
    total_inspected: profiles.length,
    with_legacy_service_area: 0,
    null_or_empty_service_area: 0,
    successfully_mapped_cities: 0,
    unmapped_cities: 0,
    ambiguous_cities: 0,
    localities_mapped: 0,
    localities_unmapped: 0,
    pincodes_mapped: 0,
    pincodes_unmapped: 0,
    candidate_coverage_records_generated: 0,
    duplicate_coverage_skipped: 0,
    records_requiring_manual_review: 0,
  };

  const manualReviewQueue = [];
  const migrationLogs = [];
  const stagedCoverageRecords = [];

  for (const profile of profiles) {
    const pId = profile.id;
    const uId = profile.user_id;
    const bName = profile.business_name || `Provider #${pId}`;
    const sArea = profile.service_area;

    if (!sArea || typeof sArea !== 'object' || Object.keys(sArea).length === 0) {
      stats.null_or_empty_service_area++;
      continue;
    }

    stats.with_legacy_service_area++;
    const logItem = {
      provider_id: pId,
      user_id: uId,
      business_name: bName,
      legacy_city: sArea.city || null,
      resolved_city_id: null,
      resolved_district_id: null,
      resolved_state_id: null,
      status: 'PENDING',
      localities_resolved: [],
      localities_unresolved: [],
      pincodes_resolved: [],
      pincodes_unresolved: [],
      coverage_candidates_count: 0,
      notes: [],
    };

    // A. City Resolution
    const rawCity = String(sArea.city || '').trim();
    let resolvedCity = null;

    if (!rawCity) {
      stats.unmapped_cities++;
      stats.records_requiring_manual_review++;
      logItem.status = 'MANUAL_REVIEW';
      logItem.notes.push('Missing legacy city in service_area');
      manualReviewQueue.push(logItem);
      migrationLogs.push(logItem);
      continue;
    }

    // Exact lookup first
    const exactMatches = citiesByName.get(rawCity) || [];
    if (exactMatches.length === 1) {
      resolvedCity = exactMatches[0];
    } else if (exactMatches.length > 1) {
      // Ambiguous! Multiple cities with same name in different districts/states
      stats.ambiguous_cities++;
      stats.records_requiring_manual_review++;
      logItem.status = 'AMBIGUOUS_CITY';
      logItem.notes.push(`Ambiguous city name '${rawCity}' matches ${exactMatches.length} cities`);
      manualReviewQueue.push(logItem);
      migrationLogs.push(logItem);
      continue;
    } else {
      // Normalized lookup
      const normKey = rawCity.toLowerCase().replace(/[^a-z0-9]/g, '');
      const normMatches = citiesByNorm.get(normKey) || [];
      if (normMatches.length === 1) {
        resolvedCity = normMatches[0];
      } else if (normMatches.length > 1) {
        stats.ambiguous_cities++;
        stats.records_requiring_manual_review++;
        logItem.status = 'AMBIGUOUS_CITY';
        logItem.notes.push(`Ambiguous normalized city '${normKey}' matches ${normMatches.length} cities`);
        manualReviewQueue.push(logItem);
        migrationLogs.push(logItem);
        continue;
      } else {
        stats.unmapped_cities++;
        stats.records_requiring_manual_review++;
        logItem.status = 'UNMAPPED_CITY';
        logItem.notes.push(`City '${rawCity}' not found in Location Master`);
        manualReviewQueue.push(logItem);
        migrationLogs.push(logItem);
        continue;
      }
    }

    // City successfully resolved!
    stats.successfully_mapped_cities++;
    logItem.resolved_city_id = resolvedCity.id;
    logItem.resolved_district_id = resolvedCity.district_id;
    logItem.resolved_state_id = resolvedCity.state_id;

    // B. Locality Resolution
    const legacyLocalities = Array.isArray(sArea.localities) ? sArea.localities : [];
    for (const rawLoc of legacyLocalities) {
      const locStr = String(rawLoc || '').trim();
      if (!locStr) continue;

      const locKey = `${resolvedCity.id}_${locStr.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const locMatches = localitiesByCityAndNorm.get(locKey) || [];

      if (locMatches.length >= 1) {
        stats.localities_mapped++;
        logItem.localities_resolved.push({
          raw_name: locStr,
          locality_id: locMatches[0].id,
          name: locMatches[0].name,
        });
      } else {
        stats.localities_unmapped++;
        logItem.localities_unresolved.push(locStr);
        logItem.notes.push(`Unmapped locality '${locStr}' in city ${resolvedCity.name}`);
      }
    }

    // C. Pincode Resolution
    const legacyPincodes = Array.isArray(sArea.pincodes) ? sArea.pincodes : [];
    for (const rawPin of legacyPincodes) {
      const pinStr = String(rawPin || '').trim();
      if (!pinStr) continue;

      const pinMatches = pincodesByCode.get(pinStr) || [];
      // Prefer pincode linked to the resolved city
      const cityPinMatch = pinMatches.find((p) => p.city_id === resolvedCity.id);
      const chosenPin = cityPinMatch || pinMatches[0];

      if (chosenPin) {
        stats.pincodes_mapped++;
        logItem.pincodes_resolved.push({
          raw_pincode: pinStr,
          pincode_id: chosenPin.id,
          city_id: chosenPin.city_id,
        });
      } else {
        stats.pincodes_unmapped++;
        logItem.pincodes_unresolved.push(pinStr);
        logItem.notes.push(`Unmapped pincode '${pinStr}'`);
      }
    }

    if (logItem.localities_unresolved.length > 0 || logItem.pincodes_unresolved.length > 0) {
      stats.records_requiring_manual_review++;
      logItem.status = 'PARTIAL_MATCH';
      manualReviewQueue.push(logItem);
    } else {
      logItem.status = 'FULLY_RESOLVED';
    }

    // D. Build Service Coverage Candidates for Provider's Active Listings
    const listings = await ServiceListing.findAll({
      where: {
        provider_id: pId,
        is_deleted: false,
      },
    });

    const radiusKm = parseFloat(sArea.radiusKm || sArea.radius_km || 15);
    const centerLat = sArea.centerLatitude != null ? parseFloat(sArea.centerLatitude) : null;
    const centerLng = sArea.centerLongitude != null ? parseFloat(sArea.centerLongitude) : null;

    for (const listing of listings) {
      // 1. City-Wide coverage area candidate
      stagedCoverageRecords.push({
        service_id: listing.id,
        provider_id: pId,
        coverage_scope: 'PUBLIC',
        coverage_method: 'CITY',
        city_id: resolvedCity.id,
        locality_id: null,
        pincode_id: null,
        society_id: null,
        origin_latitude: centerLat,
        origin_longitude: centerLng,
        origin_address: `${resolvedCity.name} City Area`,
        resolved_radius_km: null,
        radius_option_id: null,
        is_active: true,
      });

      // 2. Locality coverage candidates
      for (const locItem of logItem.localities_resolved) {
        stagedCoverageRecords.push({
          service_id: listing.id,
          provider_id: pId,
          coverage_scope: 'PUBLIC',
          coverage_method: 'LOCALITY',
          city_id: resolvedCity.id,
          locality_id: locItem.locality_id,
          pincode_id: null,
          society_id: null,
          origin_latitude: centerLat,
          origin_longitude: centerLng,
          origin_address: `${locItem.name}, ${resolvedCity.name}`,
          resolved_radius_km: null,
          radius_option_id: null,
          is_active: true,
        });
      }

      // 3. Pincode coverage candidates
      for (const pinItem of logItem.pincodes_resolved) {
        stagedCoverageRecords.push({
          service_id: listing.id,
          provider_id: pId,
          coverage_scope: 'PUBLIC',
          coverage_method: 'PINCODE',
          city_id: resolvedCity.id,
          locality_id: null,
          pincode_id: pinItem.pincode_id,
          society_id: null,
          origin_latitude: centerLat,
          origin_longitude: centerLng,
          origin_address: `PIN ${pinItem.raw_pincode}, ${resolvedCity.name}`,
          resolved_radius_km: null,
          radius_option_id: null,
          is_active: true,
        });
      }

      // 4. Radial coverage candidate
      if (centerLat != null && centerLng != null) {
        stagedCoverageRecords.push({
          service_id: listing.id,
          provider_id: pId,
          coverage_scope: 'PUBLIC',
          coverage_method: 'RADIUS',
          city_id: resolvedCity.id,
          locality_id: logItem.localities_resolved[0]?.locality_id || null,
          pincode_id: logItem.pincodes_resolved[0]?.pincode_id || null,
          society_id: null,
          origin_latitude: centerLat,
          origin_longitude: centerLng,
          origin_address: `${resolvedCity.name} Radial Hub`,
          resolved_radius_km: radiusKm,
          radius_option_id: null,
          is_active: true,
        });
      }
    }

    logItem.coverage_candidates_count = stagedCoverageRecords.filter((r) => r.provider_id === pId).length;
    migrationLogs.push(logItem);
  }

  stats.candidate_coverage_records_generated = stagedCoverageRecords.length;

  // 3. Execute Transactional Commit if Enabled
  let insertedCount = 0;
  if (isCommit) {
    const t = await sequelize.transaction();
    try {
      for (const candidate of stagedCoverageRecords) {
        // Prevent duplicate coverage records
        const existing = await ServiceCoverageArea.findOne({
          where: {
            service_id: candidate.service_id,
            coverage_method: candidate.coverage_method,
            city_id: candidate.city_id,
            locality_id: candidate.locality_id,
            pincode_id: candidate.pincode_id,
            society_id: candidate.society_id,
            is_deleted: false,
          },
          transaction: t,
        });

        if (existing) {
          stats.duplicate_coverage_skipped++;
          continue;
        }

        await ServiceCoverageArea.create(candidate, { transaction: t });
        insertedCount++;
      }

      await t.commit();
      console.log(`✅ Transaction committed. Inserted ${insertedCount} coverage areas.`);
    } catch (err) {
      await t.rollback();
      console.error('❌ Transaction rolled back due to error:', err);
      throw err;
    }
  }

  // 4. Generate Reports
  const report = {
    timestamp: new Date().toISOString(),
    mode: isCommit ? 'COMMIT' : 'DRY_RUN',
    statistics: stats,
    manual_review_queue: manualReviewQueue,
    migration_logs: migrationLogs,
  };

  const reportPath = path.join(process.cwd(), 'stage4_provider_migration_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log('📊 MIGRATION STATISTICS SUMMARY');
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log(`Total Providers Inspected:              ${stats.total_inspected}`);
  console.log(`With Legacy service_area JSON:         ${stats.with_legacy_service_area}`);
  console.log(`Null / Empty service_area:             ${stats.null_or_empty_service_area}`);
  console.log(`Successfully Mapped Cities:            ${stats.successfully_mapped_cities}`);
  console.log(`Unmapped Cities:                       ${stats.unmapped_cities}`);
  console.log(`Ambiguous Cities:                      ${stats.ambiguous_cities}`);
  console.log(`Localities Mapped:                     ${stats.localities_mapped}`);
  console.log(`Localities Unmapped:                   ${stats.localities_unmapped}`);
  console.log(`Pincodes Mapped:                       ${stats.pincodes_mapped}`);
  console.log(`Pincodes Unmapped:                     ${stats.pincodes_unmapped}`);
  console.log(`Candidate Coverage Records Generated:  ${stats.candidate_coverage_records_generated}`);
  console.log(`Duplicate Coverage Skipped:            ${stats.duplicate_coverage_skipped}`);
  console.log(`Records Requiring Manual Review:       ${stats.records_requiring_manual_review}`);
  console.log('────────────────────────────────────────────────────────────────────────────────');
  console.log(`📄 Comprehensive report saved to: ${reportPath}`);

  return report;
};

// Direct CLI invocation
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commit = process.argv.includes('--commit');
  runStage4Migration({ commit })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Migration Error:', err);
      process.exit(1);
    });
}
