import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
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
} from './location_master.models.js';
import User from '../user/user.model.js';
import AuditLog from '../audit_log/audit_log.model.js';
import { parseLgdCsv, serializeToCsv } from './lgd_csv_parser.service.js';
import { normalizeDistrictName } from './admin_district.controller.js';
import { normalizeCityName } from './admin_city.controller.js';
import { normalizeLocalityName } from './admin_locality.controller.js';
import { invalidateLocationCache } from './location_cache.service.js';
import logger from '../../utils/logger.js';

// In-memory mutex lock for concurrent import prevention
let isImportLockActive = false;
let activeImportBatchId = null;

export const acquireImportLock = (batchId) => {
  if (isImportLockActive) {
    return false;
  }
  isImportLockActive = true;
  activeImportBatchId = batchId;
  return true;
};

export const releaseImportLock = (batchId) => {
  if (activeImportBatchId === batchId || !batchId) {
    isImportLockActive = false;
    activeImportBatchId = null;
  }
};

/**
 * Normalizes state name to lowercase snake_case.
 */
export const normalizeStateName = (name) => {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * Stage and Validate State CSV.
 */
export const stageStateCsv = async ({ fileBuffer, fileName, actorId }) => {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const parsed = parseLgdCsv(fileBuffer, 'STATE');

  const batchId = `BATCH-STATE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Find India country as root
  const country = await Country.findOne({ where: { iso_code: 'IN', is_deleted: false } })
    || await Country.findOne({ where: { is_deleted: false } });
  const countryId = country ? country.id : 1;

  // Pre-load existing states into memory for ultra-fast lookup
  const existingStates = await State.findAll({ where: { is_deleted: false } });
  const statesByLgd = new Map();
  const statesByNorm = new Map();
  for (const s of existingStates) {
    if (s.lgd_state_code) statesByLgd.set(String(s.lgd_state_code).trim(), s);
    if (s.normalized_name) statesByNorm.set(s.normalized_name, s);
  }

  const stagedRows = [];
  const seenLgdInFile = new Set();
  const seenDistrictNamesInState = new Set();
  let validCount = 0;
  let invalidCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const raw = row.record;
    const errors = [];

    const stateCode = String(raw.state_code || '').trim();
    const stateName = String(raw.state_name_english || '').trim();
    const stateNameLocal = raw.state_name_local ? String(raw.state_name_local).trim() : null;
    const censusCode = raw.state_census2011_code ? String(raw.state_census2011_code).trim() : null;
    const stateOrUt = raw.state_or_ut ? String(raw.state_or_ut).trim() : null;
    const lastUpdated = raw.last_updated ? new Date(raw.last_updated) : null;

    if (!stateCode) {
      errors.push('state_code is required');
    }
    if (!stateName || stateName.length < 2) {
      errors.push('state_name_english is required (min 2 chars)');
    }

    if (stateCode) {
      if (seenLgdInFile.has(stateCode)) {
        errors.push(`Duplicate state_code '${stateCode}' within the uploaded file`);
      } else {
        seenLgdInFile.add(stateCode);
      }
    }

    const normalizedName = normalizeStateName(stateName);
    let action = 'INSERT';
    let matchedState = null;

    if (errors.length === 0) {
      // Lookup existing state
      matchedState = statesByLgd.get(stateCode) || statesByNorm.get(normalizedName);

      if (matchedState) {
        // Compare attributes
        const isIdentical =
          matchedState.lgd_state_code === stateCode &&
          matchedState.name.toLowerCase() === stateName.toLowerCase() &&
          (!stateNameLocal || matchedState.state_name_local === stateNameLocal) &&
          (!censusCode || matchedState.state_census2011_code === censusCode);

        if (isIdentical) {
          action = 'SKIP';
          skippedCount++;
        } else {
          action = 'UPDATE';
          updatedCount++;
        }
      } else {
        action = 'INSERT';
        newCount++;
      }
      validCount++;
    } else {
      action = 'ERROR';
      invalidCount++;
    }

    stagedRows.push({
      batch_id: batchId,
      dataset_type: 'STATE',
      row_number: row.rowNumber,
      raw_data: row.rawRecord,
      parsed_data: {
        country_id: countryId,
        state_code: stateCode,
        state_name_english: stateName,
        state_name_local: stateNameLocal,
        state_census2011_code: censusCode,
        state_or_ut: stateOrUt,
        normalized_name: normalizedName,
        source_last_updated: lastUpdated && !isNaN(lastUpdated.getTime()) ? lastUpdated : null,
      },
      action,
      validation_status: errors.length === 0 ? 'VALID' : 'INVALID',
      validation_errors: errors.length > 0 ? errors : null,
      import_status: 'PENDING',
      matched_entity_id: matchedState ? matchedState.id : null,
    });
  }

  // Create batch and stage records in transaction
  const t = await sequelize.transaction();
  try {
    const batch = await LocationImportBatch.create({
      batch_id: batchId,
      dataset_type: 'STATE',
      file_name: fileName,
      file_size_bytes: fileBuffer.length,
      file_hash: fileHash,
      status: 'VALIDATED',
      total_rows: parsed.totalRows,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      new_rows: newCount,
      existing_rows: updatedCount + skippedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: 0,
      uploaded_by: actorId,
      error_summary: invalidCount > 0 ? { invalidCount, sampleErrors: stagedRows.filter(r => r.validation_errors).slice(0, 10).map(r => ({ row: r.row_number, errors: r.validation_errors })) } : null,
    }, { transaction: t });

    await LocationStagedRecord.bulkCreate(stagedRows, { transaction: t });

    await t.commit();
    return batch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

/**
 * Stage and Validate District CSV.
 */
export const stageDistrictCsv = async ({ fileBuffer, fileName, actorId }) => {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const parsed = parseLgdCsv(fileBuffer, 'DISTRICT');

  const batchId = `BATCH-DISTRICT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Pre-load all states into memory by LGD code, code, and normalized name
  const existingStates = await State.findAll({ where: { is_deleted: false } });
  const statesByLgd = new Map();
  const statesByCode = new Map();
  const statesByNorm = new Map();
  for (const s of existingStates) {
    if (s.lgd_state_code) statesByLgd.set(String(s.lgd_state_code).trim(), s);
    if (s.code) statesByCode.set(String(s.code).trim().toUpperCase(), s);
    if (s.normalized_name) statesByNorm.set(s.normalized_name, s);
  }

  // Pre-load existing districts
  const existingDistricts = await District.findAll({ where: { is_deleted: false } });
  const districtsByLgd = new Map();
  const districtsByStateAndNorm = new Map(); // key: `${state_id}_${norm_name}`
  for (const d of existingDistricts) {
    if (d.lgd_district_code) districtsByLgd.set(String(d.lgd_district_code).trim(), d);
    districtsByStateAndNorm.set(`${d.state_id}_${d.normalized_name}`, d);
  }

  const stagedRows = [];
  const seenLgdInFile = new Set();
  const seenDistrictNamesInState = new Set();
  let validCount = 0;
  let invalidCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const raw = row.record;
    const errors = [];

    const stateCode = String(raw.state_code || '').trim();
    const stateNameHint = String(raw.state_name_english || '').trim();
    const districtCode = String(raw.district_code || '').trim();
    const districtName = String(raw.district_name_english || '').trim();
    const districtNameLocal = raw.district_name_local ? String(raw.district_name_local).trim() : null;
    const censusCode = raw.district_census2011_code ? String(raw.district_census2011_code).trim() : null;

    if (!stateCode) {
      errors.push('state_code is required');
    }
    if (!districtCode) {
      errors.push('district_code is required');
    }
    if (!districtName || districtName.length < 2) {
      errors.push('district_name_english is required (min 2 chars)');
    }

    if (districtCode) {
      if (seenLgdInFile.has(districtCode)) {
        errors.push(`Duplicate district_code '${districtCode}' within uploaded file`);
      } else {
        seenLgdInFile.add(districtCode);
      }
    }

    // Resolve target State from database
    let matchedState = null;
    if (stateCode) {
      matchedState = statesByLgd.get(stateCode)
        || statesByCode.get(stateCode.toUpperCase())
        || (stateNameHint ? statesByNorm.get(normalizeStateName(stateNameHint)) : null);

      if (!matchedState) {
        errors.push(`Unknown state_code '${stateCode}' (State must be registered or imported first)`);
      }
    }

    const normalizedDistrictName = normalizeDistrictName(districtName);

    if (stateCode && normalizedDistrictName) {
      const stateDistKey = `${stateCode}_${normalizedDistrictName}`;
      if (seenDistrictNamesInState.has(stateDistKey)) {
        errors.push(`Duplicate district name '${districtName}' for state '${stateCode}' within uploaded file`);
      } else {
        seenDistrictNamesInState.add(stateDistKey);
      }
    }
    let action = 'INSERT';
    let matchedDistrict = null;

    if (errors.length === 0 && matchedState) {
      // Lookup existing district by LGD code
      matchedDistrict = districtsByLgd.get(districtCode);

      if (!matchedDistrict) {
        // Fallback: lookup by state_id + normalized_name
        matchedDistrict = districtsByStateAndNorm.get(`${matchedState.id}_${normalizedDistrictName}`);
      }

      if (matchedDistrict) {
        // If matched by name but belongs to different state or has conflicting LGD code
        if (matchedDistrict.state_id !== matchedState.id) {
          errors.push(`District name conflicts with an existing district in another state`);
          action = 'ERROR';
          invalidCount++;
        } else {
          const isIdentical =
            matchedDistrict.lgd_district_code === districtCode &&
            matchedDistrict.district_name_english.toLowerCase() === districtName.toLowerCase() &&
            (!districtNameLocal || matchedDistrict.district_name_local === districtNameLocal) &&
            (!censusCode || matchedDistrict.district_census2011_code === censusCode);

          if (isIdentical) {
            action = 'SKIP';
            skippedCount++;
          } else {
            action = 'UPDATE';
            updatedCount++;
          }
          validCount++;
        }
      } else {
        action = 'INSERT';
        newCount++;
        validCount++;
      }
    } else {
      action = 'ERROR';
      invalidCount++;
    }

    stagedRows.push({
      batch_id: batchId,
      dataset_type: 'DISTRICT',
      row_number: row.rowNumber,
      raw_data: row.rawRecord,
      parsed_data: {
        state_id: matchedState ? matchedState.id : null,
        state_code: stateCode,
        state_name: matchedState ? matchedState.name : (stateNameHint || null),
        district_code: districtCode,
        district_name_english: districtName,
        district_name_local: districtNameLocal,
        district_census2011_code: censusCode,
        normalized_name: normalizedDistrictName,
      },
      action,
      validation_status: errors.length === 0 ? 'VALID' : 'INVALID',
      validation_errors: errors.length > 0 ? errors : null,
      import_status: 'PENDING',
      matched_entity_id: matchedDistrict ? matchedDistrict.id : null,
    });
  }

  // Create batch and stage records in transaction
  const t = await sequelize.transaction();
  try {
    const batch = await LocationImportBatch.create({
      batch_id: batchId,
      dataset_type: 'DISTRICT',
      file_name: fileName,
      file_size_bytes: fileBuffer.length,
      file_hash: fileHash,
      status: 'VALIDATED',
      total_rows: parsed.totalRows,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      new_rows: newCount,
      existing_rows: updatedCount + skippedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: 0,
      uploaded_by: actorId,
      error_summary: invalidCount > 0 ? { invalidCount, sampleErrors: stagedRows.filter(r => r.validation_errors).slice(0, 10).map(r => ({ row: r.row_number, errors: r.validation_errors })) } : null,
    }, { transaction: t });

    await LocationStagedRecord.bulkCreate(stagedRows, { transaction: t });

    await t.commit();
    return batch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

/**
 * Stage and Validate City CSV.
 */
export const stageCityCsv = async ({ fileBuffer, fileName, actorId }) => {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const parsed = parseLgdCsv(fileBuffer, 'CITY');
  const batchId = `BATCH-CITY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const existingStates = await State.findAll({ where: { is_deleted: false } });
  const statesByLgd = new Map();
  const statesByCode = new Map();
  const statesByNorm = new Map();
  for (const s of existingStates) {
    if (s.lgd_state_code) statesByLgd.set(String(s.lgd_state_code).trim(), s);
    if (s.code) statesByCode.set(String(s.code).trim().toUpperCase(), s);
    if (s.normalized_name) statesByNorm.set(s.normalized_name, s);
  }

  const existingDistricts = await District.findAll({ where: { is_deleted: false } });
  const districtsByLgd = new Map();
  const districtsByStateAndNorm = new Map();
  for (const d of existingDistricts) {
    if (d.lgd_district_code) districtsByLgd.set(String(d.lgd_district_code).trim(), d);
    districtsByStateAndNorm.set(`${d.state_id}_${d.normalized_name}`, d);
  }

  const existingCities = await City.findAll({ where: { is_deleted: false } });
  const citiesByStateAndNorm = new Map();
  const citiesByLgd = new Map();
  for (const c of existingCities) {
    citiesByStateAndNorm.set(`${c.state_id}_${c.normalized_name}`, c);
    if (c.lgd_local_body_code) citiesByLgd.set(String(c.lgd_local_body_code).trim(), c);
  }

  const stagedRows = [];
  const seenCityInFile = new Set();
  const seenCityRecords = new Map();
  let validCount = 0;
  let invalidCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const raw = row.record;
    const errors = [];

    const cityName = String(raw.city_name_english || raw.name || '').trim();
    const cityNameLocal = raw.city_name_local ? String(raw.city_name_local).trim() : null;
    const stateCode = String(raw.state_code || '').trim();
    const stateNameHint = String(raw.state_name_english || '').trim();
    let districtCode = String(raw.district_code || '').trim();
    let districtNameHint = String(raw.district_name_english || '').trim();
    const cityCode = raw.city_code ? String(raw.city_code).trim() : null;
    const lgdLocalBodyCode = raw.lgd_local_body_code ? String(raw.lgd_local_body_code).trim() : null;
    let cityType = raw.city_type ? String(raw.city_type).trim() : 'MUNICIPAL_CORPORATION';

    // Normalize city type from government terminology
    const lowerType = cityType.toLowerCase();
    if (lowerType.includes('corporation')) {
      cityType = 'MUNICIPAL_CORPORATION';
    } else if (lowerType.includes('town panchayat') || lowerType.includes('nagar panchayat')) {
      cityType = 'TOWN_PANCHAYAT';
    } else if (lowerType.includes('municipality') || lowerType.includes('parishad')) {
      cityType = 'MUNICIPALITY';
    }

    if (!cityName || cityName.length < 2) {
      errors.push('city_name_english is required (min 2 chars)');
    }

    let matchedState = null;
    if (stateCode) {
      matchedState = statesByLgd.get(stateCode) || statesByCode.get(stateCode.toUpperCase()) || statesByNorm.get(normalizeStateName(stateCode));
    }
    if (!matchedState && stateNameHint) {
      matchedState = statesByNorm.get(normalizeStateName(stateNameHint));
    }
    if (!matchedState) {
      errors.push(`Could not resolve state '${stateCode || stateNameHint}'`);
    }

    // Check if this is a Rural Panchayat (not an Urban City/Town)
    const isRuralPanchayat =
      raw.local_body_type_code === '1' ||
      raw.local_body_type_code === '2' ||
      raw.local_body_type_code === '3' ||
      ['district panchayat', 'intermediate panchayat', 'village panchayat'].includes(lowerType);

    if (isRuralPanchayat) {
      skippedCount++;
      validCount++;
      stagedRows.push({
        batch_id: batchId,
        dataset_type: 'CITY',
        row_number: row.rowNumber,
        raw_data: row.rawRecord,
        parsed_data: {
          state_id: matchedState ? matchedState.id : null,
          state_name: matchedState ? matchedState.name : (stateNameHint || null),
          district_id: null,
          city_name_english: cityName,
          city_type: cityType,
        },
        action: 'SKIP',
        validation_status: 'VALID',
        validation_errors: null,
        import_status: 'SKIPPED',
        error_message: `Rural Panchayat (${raw.city_type}) skipped — City master is reserved for Urban Local Bodies`,
        matched_entity_id: null,
      });
      continue;
    }

    // Resolve District from entity fields or district hints
    let matchedDistrict = null;
    if (matchedState) {
      if (raw.entity_type === 'District' && raw.entity_name) {
        districtNameHint = raw.entity_name;
        districtCode = raw.entity_code || districtCode;
      }
      if (districtCode) {
        matchedDistrict = districtsByLgd.get(districtCode);
      }
      if (!matchedDistrict && districtNameHint) {
        matchedDistrict = districtsByStateAndNorm.get(`${matchedState.id}_${normalizeDistrictName(districtNameHint)}`);
      }
      if (!matchedDistrict && raw.entity_name) {
        matchedDistrict = districtsByStateAndNorm.get(`${matchedState.id}_${normalizeDistrictName(raw.entity_name)}`);
      }
      if (!matchedDistrict && cityName) {
        matchedDistrict = districtsByStateAndNorm.get(`${matchedState.id}_${normalizeDistrictName(cityName)}`);
      }
    }

    const normCity = normalizeCityName(cityName);
    const fileDedupeKey = lgdLocalBodyCode
      ? `lgd_${lgdLocalBodyCode}`
      : `${matchedState ? matchedState.id : 'unknown'}_${normCity}`;

    // Graceful deduplication for multi-coverage rows in LGD reports
    if (matchedState && normCity && seenCityInFile.has(fileDedupeKey)) {
      const firstStaged = seenCityRecords.get(fileDedupeKey);
      if (firstStaged && !firstStaged.parsed_data.district_id && matchedDistrict) {
        firstStaged.parsed_data.district_id = matchedDistrict.id;
        firstStaged.parsed_data.district_name = matchedDistrict.district_name_english;
      }

      skippedCount++;
      validCount++;
      stagedRows.push({
        batch_id: batchId,
        dataset_type: 'CITY',
        row_number: row.rowNumber,
        raw_data: row.rawRecord,
        parsed_data: {
          state_id: matchedState ? matchedState.id : null,
          state_name: matchedState ? matchedState.name : (stateNameHint || null),
          district_id: matchedDistrict ? matchedDistrict.id : null,
          district_name: matchedDistrict ? matchedDistrict.district_name_english : null,
          city_name_english: cityName,
          city_name_local: cityNameLocal,
          code: cityCode,
          lgd_local_body_code: lgdLocalBodyCode,
          city_type: cityType,
          normalized_name: normCity,
        },
        action: 'SKIP',
        validation_status: 'VALID',
        validation_errors: null,
        import_status: 'SKIPPED',
        error_message: `Coverage row for '${cityName}' skipped (first occurrence on row ${firstStaged ? firstStaged.row_number : 'earlier'} will be imported)`,
        matched_entity_id: null,
      });
      continue;
    } else if (matchedState && normCity) {
      seenCityInFile.add(fileDedupeKey);
    }

    let action = 'INSERT';
    let matchedCity = null;

    if (errors.length === 0 && matchedState) {
      if (lgdLocalBodyCode && citiesByLgd.has(lgdLocalBodyCode)) {
        matchedCity = citiesByLgd.get(lgdLocalBodyCode);
      } else {
        matchedCity = citiesByStateAndNorm.get(`${matchedState.id}_${normCity}`);
      }

      if (matchedCity) {
        const isIdentical =
          (!lgdLocalBodyCode || matchedCity.lgd_local_body_code === lgdLocalBodyCode) &&
          matchedCity.name.toLowerCase() === cityName.toLowerCase() &&
          (!cityNameLocal || matchedCity.city_name_local === cityNameLocal) &&
          (!matchedDistrict || Number(matchedCity.district_id) === Number(matchedDistrict.id));

        if (isIdentical) {
          action = 'SKIP';
          skippedCount++;
        } else {
          action = 'UPDATE';
          updatedCount++;
        }
        validCount++;
      } else {
        action = 'INSERT';
        newCount++;
        validCount++;
      }
    } else {
      action = 'ERROR';
      invalidCount++;
    }

    const stagedRowObj = {
      batch_id: batchId,
      dataset_type: 'CITY',
      row_number: row.rowNumber,
      raw_data: row.rawRecord,
      parsed_data: {
        state_id: matchedState ? matchedState.id : null,
        state_name: matchedState ? matchedState.name : (stateNameHint || null),
        district_id: matchedDistrict ? matchedDistrict.id : null,
        district_name: matchedDistrict ? matchedDistrict.district_name_english : null,
        city_name_english: cityName,
        city_name_local: cityNameLocal,
        code: cityCode,
        lgd_local_body_code: lgdLocalBodyCode,
        city_type: cityType,
        normalized_name: normCity,
      },
      action,
      validation_status: errors.length === 0 ? 'VALID' : 'INVALID',
      validation_errors: errors.length > 0 ? errors : null,
      import_status: 'PENDING',
      matched_entity_id: matchedCity ? matchedCity.id : null,
    };
    stagedRows.push(stagedRowObj);
    if (matchedState && normCity) {
      seenCityRecords.set(fileDedupeKey, stagedRowObj);
    }
  }

  const t = await sequelize.transaction();
  try {
    const batch = await LocationImportBatch.create({
      batch_id: batchId,
      dataset_type: 'CITY',
      file_name: fileName,
      file_size_bytes: fileBuffer.length,
      file_hash: fileHash,
      status: 'VALIDATED',
      total_rows: parsed.totalRows,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      new_rows: newCount,
      existing_rows: updatedCount + skippedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: 0,
      uploaded_by: actorId,
      error_summary: invalidCount > 0 ? { invalidCount, sampleErrors: stagedRows.filter(r => r.validation_errors).slice(0, 10).map(r => ({ row: r.row_number, errors: r.validation_errors })) } : null,
    }, { transaction: t });

    await LocationStagedRecord.bulkCreate(stagedRows, { transaction: t, batchSize: 1000 });
    await t.commit();
    return batch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

/**
 * Stage and Validate Locality CSV.
 */
export const stageLocalityCsv = async ({ fileBuffer, fileName, actorId }) => {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const parsed = parseLgdCsv(fileBuffer, 'LOCALITY');
  const batchId = `BATCH-LOCALITY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const existingCities = await City.findAll({ where: { is_deleted: false } });
  const citiesByNorm = new Map();
  const citiesByCode = new Map();
  for (const c of existingCities) {
    citiesByNorm.set(c.normalized_name, c);
    if (c.code) citiesByCode.set(String(c.code).trim().toLowerCase(), c);
  }

  const existingLocalities = await Locality.findAll({ where: { is_deleted: false } });
  const localitiesByCityAndNorm = new Map();
  for (const l of existingLocalities) {
    localitiesByCityAndNorm.set(`${l.city_id}_${l.normalized_name}`, l);
  }

  const existingPincodes = await Pincode.findAll({ where: { is_deleted: false } });
  const pincodesByCode = new Map();
  for (const p of existingPincodes) {
    pincodesByCode.set(String(p.pincode).trim(), p);
  }

  const stagedRows = [];
  const seenLocInFile = new Set();
  let validCount = 0;
  let invalidCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const raw = row.record;
    const errors = [];

    const locName = String(raw.locality_name_english || raw.name || '').trim();
    const locNameLocal = raw.locality_name_local ? String(raw.locality_name_local).trim() : null;
    const cityNameHint = String(raw.city_name_english || raw.city || '').trim();
    const cityCodeHint = String(raw.city_code || '').trim().toLowerCase();
    const locCode = raw.locality_code ? String(raw.locality_code).trim() : null;
    const locType = raw.locality_type ? String(raw.locality_type).trim() : 'URBAN_AREA';
    const sourceRef = raw.source_reference_code ? String(raw.source_reference_code).trim() : null;
    const pinHint = raw.pincode ? String(raw.pincode).trim() : null;

    if (!locName || locName.length < 2) {
      errors.push('locality_name_english is required (min 2 chars)');
    }

    let matchedCity = null;
    if (cityCodeHint && citiesByCode.has(cityCodeHint)) {
      matchedCity = citiesByCode.get(cityCodeHint);
    } else if (cityNameHint) {
      matchedCity = citiesByNorm.get(normalizeCityName(cityNameHint));
    }

    if (!matchedCity) {
      errors.push(`Could not resolve city '${cityNameHint || cityCodeHint}'`);
    }

    let matchedPincode = null;
    if (pinHint) {
      if (!/^[1-9][0-9]{5}$/.test(pinHint)) {
        errors.push(`Invalid pincode format '${pinHint}', must be 6 digits`);
      } else {
        matchedPincode = pincodesByCode.get(pinHint) || null;
      }
    }

    const normLoc = normalizeLocalityName(locName);
    if (matchedCity && normLoc) {
      const fileKey = `${matchedCity.id}_${normLoc}`;
      if (seenLocInFile.has(fileKey)) {
        errors.push(`Duplicate locality '${locName}' in city within uploaded file`);
      } else {
        seenLocInFile.add(fileKey);
      }
    }

    let action = 'INSERT';
    let matchedLocality = null;

    if (errors.length === 0 && matchedCity) {
      matchedLocality = localitiesByCityAndNorm.get(`${matchedCity.id}_${normLoc}`);

      if (matchedLocality) {
        const isIdentical =
          matchedLocality.name.toLowerCase() === locName.toLowerCase() &&
          (!locNameLocal || matchedLocality.locality_name_local === locNameLocal);

        if (isIdentical) {
          action = 'SKIP';
          skippedCount++;
        } else {
          action = 'UPDATE';
          updatedCount++;
        }
        validCount++;
      } else {
        action = 'INSERT';
        newCount++;
        validCount++;
      }
    } else {
      action = 'ERROR';
      invalidCount++;
    }

    stagedRows.push({
      batch_id: batchId,
      dataset_type: 'LOCALITY',
      row_number: row.rowNumber,
      raw_data: row.rawRecord,
      parsed_data: {
        city_id: matchedCity ? matchedCity.id : null,
        city_name: matchedCity ? matchedCity.name : cityNameHint,
        locality_name_english: locName,
        locality_name_local: locNameLocal,
        code: locCode,
        locality_type: locType,
        source_reference_code: sourceRef,
        normalized_name: normLoc,
        pincode_id: matchedPincode ? matchedPincode.id : null,
        pincode: pinHint || null,
      },
      action,
      validation_status: errors.length === 0 ? 'VALID' : 'INVALID',
      validation_errors: errors.length > 0 ? errors : null,
      import_status: 'PENDING',
      matched_entity_id: matchedLocality ? matchedLocality.id : null,
    });
  }

  const t = await sequelize.transaction();
  try {
    const batch = await LocationImportBatch.create({
      batch_id: batchId,
      dataset_type: 'LOCALITY',
      file_name: fileName,
      file_size_bytes: fileBuffer.length,
      file_hash: fileHash,
      status: 'VALIDATED',
      total_rows: parsed.totalRows,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      new_rows: newCount,
      existing_rows: updatedCount + skippedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: 0,
      uploaded_by: actorId,
      error_summary: invalidCount > 0 ? { invalidCount, sampleErrors: stagedRows.filter(r => r.validation_errors).slice(0, 10).map(r => ({ row: r.row_number, errors: r.validation_errors })) } : null,
    }, { transaction: t });

    await LocationStagedRecord.bulkCreate(stagedRows, { transaction: t });
    await t.commit();
    return batch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

/**
 * Stage and Validate PIN Code CSV.
 */
export const stagePincodeCsv = async ({ fileBuffer, fileName, actorId }) => {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const parsed = parseLgdCsv(fileBuffer, 'PINCODE');
  const batchId = `BATCH-PINCODE-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const existingCities = await City.findAll({ where: { is_deleted: false } });
  const citiesByNorm = new Map();
  const citiesByCode = new Map();
  for (const c of existingCities) {
    citiesByNorm.set(c.normalized_name, c);
    if (c.code) citiesByCode.set(String(c.code).trim().toLowerCase(), c);
  }

  const existingLocalities = await Locality.findAll({ where: { is_deleted: false } });
  const localitiesByCityAndNorm = new Map();
  for (const l of existingLocalities) {
    localitiesByCityAndNorm.set(`${l.city_id}_${l.normalized_name}`, l);
  }

  const existingPincodes = await Pincode.findAll({ where: { is_deleted: false } });
  const pincodesByCityAndCode = new Map();
  for (const p of existingPincodes) {
    pincodesByCityAndCode.set(`${p.city_id}_${p.pincode}`, p);
  }

  const stagedRows = [];
  const seenPinInFile = new Set();
  let validCount = 0;
  let invalidCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const row of parsed.rows) {
    const raw = row.record;
    const errors = [];

    const pin = String(raw.pincode || raw.code || '').trim();
    const areaName = raw.area_name ? String(raw.area_name).trim() : null;
    const cityNameHint = String(raw.city_name_english || raw.city || '').trim();
    const cityCodeHint = String(raw.city_code || '').trim().toLowerCase();
    const locNameHint = raw.locality_name_english ? String(raw.locality_name_english).trim() : null;

    if (!pin) {
      errors.push('pincode is required');
    } else if (!/^[1-9][0-9]{5}$/.test(pin)) {
      errors.push(`Invalid pincode '${pin}', must be exactly 6 digits without starting with 0`);
    }

    let matchedCity = null;
    if (cityCodeHint && citiesByCode.has(cityCodeHint)) {
      matchedCity = citiesByCode.get(cityCodeHint);
    } else if (cityNameHint) {
      matchedCity = citiesByNorm.get(normalizeCityName(cityNameHint));
    }

    if (!matchedCity) {
      // If only one city in system, fallback to it
      if (existingCities.length === 1) {
        matchedCity = existingCities[0];
      } else {
        errors.push(`Could not resolve city '${cityNameHint || cityCodeHint}'`);
      }
    }

    let matchedLocality = null;
    if (matchedCity && locNameHint) {
      matchedLocality = localitiesByCityAndNorm.get(`${matchedCity.id}_${normalizeLocalityName(locNameHint)}`);
    }

    if (matchedCity && pin) {
      const fileKey = `${matchedCity.id}_${pin}`;
      if (seenPinInFile.has(fileKey)) {
        errors.push(`Duplicate PIN code '${pin}' for city within uploaded file`);
      } else {
        seenPinInFile.add(fileKey);
      }
    }

    let action = 'INSERT';
    let matchedPinRecord = null;

    if (errors.length === 0 && matchedCity) {
      matchedPinRecord = pincodesByCityAndCode.get(`${matchedCity.id}_${pin}`);

      if (matchedPinRecord) {
        const isIdentical =
          matchedPinRecord.pincode === pin &&
          (!areaName || matchedPinRecord.area_name === areaName);

        if (isIdentical) {
          action = 'SKIP';
          skippedCount++;
        } else {
          action = 'UPDATE';
          updatedCount++;
        }
        validCount++;
      } else {
        action = 'INSERT';
        newCount++;
        validCount++;
      }
    } else {
      action = 'ERROR';
      invalidCount++;
    }

    stagedRows.push({
      batch_id: batchId,
      dataset_type: 'PINCODE',
      row_number: row.rowNumber,
      raw_data: row.rawRecord,
      parsed_data: {
        city_id: matchedCity ? matchedCity.id : null,
        state_id: matchedCity ? matchedCity.state_id : null,
        district_id: matchedCity ? matchedCity.district_id : null,
        city_name: matchedCity ? matchedCity.name : cityNameHint,
        pincode: pin,
        area_name: areaName,
        locality_id: matchedLocality ? matchedLocality.id : null,
        locality_name: matchedLocality ? matchedLocality.name : locNameHint,
      },
      action,
      validation_status: errors.length === 0 ? 'VALID' : 'INVALID',
      validation_errors: errors.length > 0 ? errors : null,
      import_status: 'PENDING',
      matched_entity_id: matchedPinRecord ? matchedPinRecord.id : null,
    });
  }

  const t = await sequelize.transaction();
  try {
    const batch = await LocationImportBatch.create({
      batch_id: batchId,
      dataset_type: 'PINCODE',
      file_name: fileName,
      file_size_bytes: fileBuffer.length,
      file_hash: fileHash,
      status: 'VALIDATED',
      total_rows: parsed.totalRows,
      valid_rows: validCount,
      invalid_rows: invalidCount,
      new_rows: newCount,
      existing_rows: updatedCount + skippedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: 0,
      uploaded_by: actorId,
      error_summary: invalidCount > 0 ? { invalidCount, sampleErrors: stagedRows.filter(r => r.validation_errors).slice(0, 10).map(r => ({ row: r.row_number, errors: r.validation_errors })) } : null,
    }, { transaction: t });

    await LocationStagedRecord.bulkCreate(stagedRows, { transaction: t });
    await t.commit();
    return batch;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};


/**
 * Get Import Preview with breakdown, sample records, and errors.
 */
export const getImportPreview = async (batchId) => {
  const batch = await LocationImportBatch.findOne({
    where: { batch_id: batchId },
    include: [
      { model: User, as: 'uploader', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'confirmer', attributes: ['userId', 'userName', 'email'] },
    ],
  });

  if (!batch) {
    const err = new Error('Import batch not found.');
    err.statusCode = 404;
    throw err;
  }

  // Sample valid records (first 50)
  const sampleRecords = await LocationStagedRecord.findAll({
    where: { batch_id: batchId },
    order: [['row_number', 'ASC']],
    limit: 50,
  });

  // Sample error records (first 50)
  const errorRecords = await LocationStagedRecord.findAll({
    where: { batch_id: batchId, validation_status: 'INVALID' },
    order: [['row_number', 'ASC']],
    limit: 50,
  });

  const formatRecord = (r) => {
    const plain = r.get ? r.get({ plain: true }) : r;
    const parsed = typeof plain.parsed_data === 'string'
      ? (() => { try { return JSON.parse(plain.parsed_data); } catch { return {}; } })()
      : (plain.parsed_data || {});
    return {
      ...plain,
      parsed_data: parsed,
      parsed_payload: parsed,
      target_action: plain.action,
      error_messages: Array.isArray(plain.validation_errors)
        ? plain.validation_errors
        : (plain.error_message ? [plain.error_message] : []),
    };
  };

  return {
    batch,
    summary: {
      batch_id: batch.batch_id,
      dataset_type: batch.dataset_type,
      file_name: batch.file_name,
      status: batch.status,
      total_rows: batch.total_rows,
      valid_rows: batch.valid_rows,
      invalid_rows: batch.invalid_rows,
      new_rows: batch.new_rows,
      updated_rows: batch.updated_rows,
      skipped_rows: batch.skipped_rows,
      can_confirm: batch.status === 'VALIDATED' && batch.valid_rows > 0,
    },
    sample_records: sampleRecords.map(formatRecord),
    error_records: errorRecords.map(formatRecord),
  };
};

/**
 * Execute Transactional Import for a confirmed batch.
 */
export const confirmAndExecuteImport = async ({ batchId, actorId, options = {} }) => {
  // Acquire import lock
  if (!acquireImportLock(batchId)) {
    const err = new Error('Another location import batch is currently being processed. Please wait for it to complete.');
    err.statusCode = 409;
    throw err;
  }

  try {
    const batch = await LocationImportBatch.findOne({
      where: { batch_id: batchId },
    });

    if (!batch) {
      const err = new Error('Import batch not found.');
      err.statusCode = 404;
      throw err;
    }

    if (batch.status === 'COMPLETED') {
      const err = new Error('This import batch has already been completed.');
      err.statusCode = 400;
      throw err;
    }

    if (batch.status === 'IMPORTING') {
      const err = new Error('This import batch is already in progress.');
      err.statusCode = 409;
      throw err;
    }

    if (batch.valid_rows === 0) {
      const err = new Error('Cannot import: Batch contains zero valid rows.');
      err.statusCode = 400;
      throw err;
    }

    // Mark batch as IMPORTING
    await batch.update({
      status: 'IMPORTING',
      confirmed_by: actorId,
      started_at: new Date(),
    });

    // Fetch all valid staged records
    const validRecords = await LocationStagedRecord.findAll({
      where: {
        batch_id: batchId,
        validation_status: 'VALID',
        import_status: 'PENDING',
      },
      order: [['row_number', 'ASC']],
    });

    const isState = batch.dataset_type === 'STATE';
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedRows = [];

    // Execute in a single transactional unit
    const t = await sequelize.transaction();
    try {
      if (isState) {
        for (const staged of validRecords) {
          const data = staged.parsed_data;
          try {
            if (staged.action === 'INSERT') {
              const created = await State.create({
                country_id: data.country_id || 1,
                name: data.state_name_english,
                normalized_name: data.normalized_name,
                code: data.state_code,
                lgd_state_code: data.state_code,
                state_name_local: data.state_name_local,
                state_census2011_code: data.state_census2011_code,
                state_or_ut: data.state_or_ut,
                source_system: 'LGD',
                source_last_updated: data.source_last_updated || new Date(),
                is_active: true,
                created_by: actorId,
              }, { transaction: t });

              await staged.update({
                import_status: 'IMPORTED',
                matched_entity_id: created.id,
              }, { transaction: t });
              importedCount++;
            } else if (staged.action === 'UPDATE' && staged.matched_entity_id) {
              const state = await State.findByPk(staged.matched_entity_id, { transaction: t, lock: t.LOCK.UPDATE });
              if (state) {
                await state.update({
                  lgd_state_code: data.state_code,
                  state_name_local: data.state_name_local || state.state_name_local,
                  state_census2011_code: data.state_census2011_code || state.state_census2011_code,
                  state_or_ut: data.state_or_ut || state.state_or_ut,
                  source_system: 'LGD',
                  source_last_updated: new Date(),
                  updated_by: actorId,
                  updatedAt: new Date(),
                }, { transaction: t });

                await staged.update({
                  import_status: 'IMPORTED',
                }, { transaction: t });
                updatedCount++;
              }
            } else {
              // SKIP
              await staged.update({ import_status: 'SKIPPED' }, { transaction: t });
              skippedCount++;
            }
          } catch (rowErr) {
            failedCount++;
            failedRows.push({ row: staged.row_number, error: rowErr.message });
            await staged.update({ import_status: 'FAILED', error_message: rowErr.message }, { transaction: t });
          }
        }
      } else if (batch.dataset_type === 'DISTRICT') {
        // DISTRICT IMPORT
        for (const staged of validRecords) {
          const data = staged.parsed_data;
          try {
            if (staged.action === 'INSERT') {
              const created = await District.create({
                state_id: data.state_id,
                district_name_english: data.district_name_english,
                district_name_local: data.district_name_local,
                normalized_name: data.normalized_name,
                code: data.district_code,
                lgd_district_code: data.district_code,
                district_census2011_code: data.district_census2011_code,
                source_system: 'LGD',
                source_last_updated: new Date(),
                is_active: true,
                created_by: actorId,
              }, { transaction: t });

              await staged.update({
                import_status: 'IMPORTED',
                matched_entity_id: created.id,
              }, { transaction: t });
              importedCount++;
            } else if (staged.action === 'UPDATE' && staged.matched_entity_id) {
              const dist = await District.findByPk(staged.matched_entity_id, { transaction: t, lock: t.LOCK.UPDATE });
              if (dist) {
                await dist.update({
                  lgd_district_code: data.district_code,
                  district_name_local: data.district_name_local || dist.district_name_local,
                  district_census2011_code: data.district_census2011_code || dist.district_census2011_code,
                  source_system: 'LGD',
                  source_last_updated: new Date(),
                  updated_by: actorId,
                  updatedAt: new Date(),
                }, { transaction: t });

                await staged.update({
                  import_status: 'IMPORTED',
                }, { transaction: t });
                updatedCount++;
              }
            } else {
              // SKIP
              await staged.update({ import_status: 'SKIPPED' }, { transaction: t });
              skippedCount++;
            }
          } catch (rowErr) {
            failedCount++;
            failedRows.push({ row: staged.row_number, error: rowErr.message });
            await staged.update({ import_status: 'FAILED', error_message: rowErr.message }, { transaction: t });
          }
        }
      } else if (batch.dataset_type === 'CITY') {
        // CITY IMPORT
        for (const staged of validRecords) {
          const data = staged.parsed_data;
          try {
            if (staged.action === 'INSERT') {
              const created = await City.create({
                state_id: data.state_id,
                district_id: data.district_id || null,
                name: data.city_name_english,
                city_name_local: data.city_name_local,
                code: data.code,
                lgd_local_body_code: data.lgd_local_body_code,
                normalized_name: data.normalized_name,
                city_type: data.city_type || 'MUNICIPAL_CORPORATION',
                source_system: 'LGD',
                source_last_updated: new Date(),
                is_active: true,
                created_by: actorId,
              }, { transaction: t });

              await staged.update({
                import_status: 'IMPORTED',
                matched_entity_id: created.id,
              }, { transaction: t });
              importedCount++;
            } else if (staged.action === 'UPDATE' && staged.matched_entity_id) {
              const city = await City.findByPk(staged.matched_entity_id, { transaction: t, lock: t.LOCK.UPDATE });
              if (city) {
                await city.update({
                  district_id: data.district_id || city.district_id,
                  city_name_local: data.city_name_local || city.city_name_local,
                  lgd_local_body_code: data.lgd_local_body_code || city.lgd_local_body_code,
                  city_type: data.city_type || city.city_type,
                  source_system: 'LGD',
                  source_last_updated: new Date(),
                  updated_by: actorId,
                  updatedAt: new Date(),
                }, { transaction: t });

                await staged.update({ import_status: 'IMPORTED' }, { transaction: t });
                updatedCount++;
              }
            } else {
              await staged.update({ import_status: 'SKIPPED' }, { transaction: t });
              skippedCount++;
            }
          } catch (rowErr) {
            failedCount++;
            failedRows.push({ row: staged.row_number, error: rowErr.message });
            await staged.update({ import_status: 'FAILED', error_message: rowErr.message }, { transaction: t });
          }
        }
      } else if (batch.dataset_type === 'LOCALITY') {
        // LOCALITY IMPORT
        for (const staged of validRecords) {
          const data = staged.parsed_data;
          try {
            let localityId = staged.matched_entity_id;
            if (staged.action === 'INSERT') {
              const created = await Locality.create({
                city_id: data.city_id,
                name: data.locality_name_english,
                locality_name_local: data.locality_name_local,
                code: data.code,
                normalized_name: data.normalized_name,
                locality_type: data.locality_type || 'URBAN_AREA',
                source_reference_code: data.source_reference_code,
                source_system: 'LGD',
                is_active: true,
                created_by: actorId,
              }, { transaction: t });
              localityId = created.id;

              await staged.update({
                import_status: 'IMPORTED',
                matched_entity_id: created.id,
              }, { transaction: t });
              importedCount++;
            } else if (staged.action === 'UPDATE' && staged.matched_entity_id) {
              const loc = await Locality.findByPk(staged.matched_entity_id, { transaction: t, lock: t.LOCK.UPDATE });
              if (loc) {
                await loc.update({
                  locality_name_local: data.locality_name_local || loc.locality_name_local,
                  locality_type: data.locality_type || loc.locality_type,
                  source_reference_code: data.source_reference_code || loc.source_reference_code,
                  updated_by: actorId,
                  updatedAt: new Date(),
                }, { transaction: t });
                await staged.update({ import_status: 'IMPORTED' }, { transaction: t });
                updatedCount++;
              }
            } else {
              await staged.update({ import_status: 'SKIPPED' }, { transaction: t });
              skippedCount++;
            }

            // If pincode_id is present, link in locality_pincodes
            if (localityId && data.pincode_id) {
              await LocalityPincode.findOrCreate({
                where: { locality_id: localityId, pincode_id: data.pincode_id },
                defaults: {
                  locality_id: localityId,
                  pincode_id: data.pincode_id,
                  is_primary: true,
                  source_system: 'IMPORT',
                  created_at: new Date(),
                  updatedAt: new Date(),
                },
                transaction: t,
              });
            }
          } catch (rowErr) {
            failedCount++;
            failedRows.push({ row: staged.row_number, error: rowErr.message });
            await staged.update({ import_status: 'FAILED', error_message: rowErr.message }, { transaction: t });
          }
        }
      } else if (batch.dataset_type === 'PINCODE' || batch.dataset_type === 'POST_OFFICE') {
        // PINCODE IMPORT
        for (const staged of validRecords) {
          const data = staged.parsed_data;
          try {
            let pinId = staged.matched_entity_id;
            if (staged.action === 'INSERT') {
              const created = await Pincode.create({
                city_id: data.city_id,
                state_id: data.state_id,
                district_id: data.district_id,
                locality_id: data.locality_id || null,
                pincode: data.pincode,
                area_name: data.area_name,
                source_system: 'LGD',
                source_last_updated: new Date(),
                is_active: true,
                created_by: actorId,
              }, { transaction: t });
              pinId = created.id;

              await staged.update({
                import_status: 'IMPORTED',
                matched_entity_id: created.id,
              }, { transaction: t });
              importedCount++;
            } else if (staged.action === 'UPDATE' && staged.matched_entity_id) {
              const pin = await Pincode.findByPk(staged.matched_entity_id, { transaction: t, lock: t.LOCK.UPDATE });
              if (pin) {
                await pin.update({
                  area_name: data.area_name || pin.area_name,
                  source_last_updated: new Date(),
                  updated_by: actorId,
                  updatedAt: new Date(),
                }, { transaction: t });
                await staged.update({ import_status: 'IMPORTED' }, { transaction: t });
                updatedCount++;
              }
            } else {
              await staged.update({ import_status: 'SKIPPED' }, { transaction: t });
              skippedCount++;
            }

            // If locality_id is present, link in locality_pincodes
            if (pinId && data.locality_id) {
              await LocalityPincode.findOrCreate({
                where: { locality_id: data.locality_id, pincode_id: pinId },
                defaults: {
                  locality_id: data.locality_id,
                  pincode_id: pinId,
                  is_primary: true,
                  source_system: 'IMPORT',
                  created_at: new Date(),
                  updatedAt: new Date(),
                },
                transaction: t,
              });
            }
          } catch (rowErr) {
            failedCount++;
            failedRows.push({ row: staged.row_number, error: rowErr.message });
            await staged.update({ import_status: 'FAILED', error_message: rowErr.message }, { transaction: t });
          }
        }
      }

      // If atomic mode (default) and any row execution failed, abort and rollback transaction
      if (failedCount > 0 && !options.allow_partial) {
        throw new Error(`Atomic import aborted: ${failedCount} row(s) failed during transactional execution. First error: ${failedRows[0]?.error}`);
      }

      // Record audit log
      try {
        await AuditLog.create({
          actor_id: actorId,
          action: `location_import.${batch.dataset_type.toLowerCase()}`,
          target_type: 'location_import_batch',
          target_id: batch.id,
          details: JSON.stringify({
            batch_id: batch.batch_id,
            dataset_type: batch.dataset_type,
            imported: importedCount,
            updated: updatedCount,
            skipped: skippedCount,
            failed: failedCount,
          }),
        }, { transaction: t });
      } catch (auditErr) {
        logger.warn('Audit log write failed for location import:', auditErr.message);
      }

      await t.commit();
      await invalidateLocationCache(batch.dataset_type);
    } catch (txErr) {
      await t.rollback();
      await batch.update({
        status: 'FAILED',
        completed_at: new Date(),
        error_summary: { message: txErr.message },
      });
      throw txErr;
    }

    // Update batch to COMPLETED
    await batch.update({
      status: failedCount > 0 && importedCount === 0 && updatedCount === 0 ? 'FAILED' : 'COMPLETED',
      completed_at: new Date(),
      new_rows: importedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: failedCount,
      error_report: failedRows.length > 0 ? failedRows : null,
    });

    return {
      batch_id: batch.batch_id,
      status: batch.status,
      dataset_type: batch.dataset_type,
      imported_rows: importedCount,
      updated_rows: updatedCount,
      skipped_rows: skippedCount,
      failed_rows: failedCount,
    };
  } finally {
    releaseImportLock(batchId);
  }
};

/**
 * List Import Batches with pagination and filters.
 */
export const listImportBatches = async ({ page = 1, limit = 20, dataset_type, status } = {}) => {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const where = {};
  if (dataset_type) where.dataset_type = dataset_type.toUpperCase();
  if (status) where.status = status.toUpperCase();

  const { count, rows } = await LocationImportBatch.findAndCountAll({
    where,
    include: [
      { model: User, as: 'uploader', attributes: ['userId', 'userName', 'email'] },
      { model: User, as: 'confirmer', attributes: ['userId', 'userName', 'email'] },
    ],
    order: [['id', 'DESC']],
    limit: limitNum,
    offset,
  });

  return {
    batches: rows,
    items: rows,
    pagination: {
      total: count,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(count / limitNum) || 1,
    },
  };
};

/**
 * Generate CSV Error Report for a given batch.
 */
export const generateErrorReportCsv = async (batchId) => {
  const invalidRecords = await LocationStagedRecord.findAll({
    where: {
      batch_id: batchId,
      [Op.or]: [
        { validation_status: 'INVALID' },
        { import_status: 'FAILED' },
      ],
    },
    order: [['row_number', 'ASC']],
  });

  if (invalidRecords.length === 0) {
    return serializeToCsv([
      { Row_Number: 1, Error_Message: 'No validation errors or import failures found for this batch.' }
    ]);
  }

  const exportRows = invalidRecords.map((r) => {
    const raw = r.raw_data || {};
    const errs = Array.isArray(r.validation_errors) ? r.validation_errors.join('; ') : (r.error_message || 'Validation error');
    return {
      Row_Number: r.row_number,
      Validation_Status: r.validation_status,
      Import_Status: r.import_status,
      Error_Details: errs,
      ...raw,
    };
  });

  return serializeToCsv(exportRows);
};

/**
 * Generate Sample Template CSV.
 */
export const generateSampleCsv = (type = 'STATE') => {
  const t = String(type || 'STATE').toUpperCase();
  if (t === 'DISTRICT') {
    const sampleDistricts = [
      {
        state_code: '10',
        state_name_english: 'BIHAR',
        district_code: '215',
        district_name_english: 'PATNA',
        district_name_local: 'पटना',
        district_census2011_code: '230',
      },
      {
        state_code: '10',
        state_name_english: 'BIHAR',
        district_code: '216',
        district_name_english: 'GAYA',
        district_name_local: 'गया',
        district_census2011_code: '254',
      },
      {
        state_code: '27',
        state_name_english: 'MAHARASHTRA',
        district_code: '517',
        district_name_english: 'MUMBAI',
        district_name_local: 'मुंबई',
        district_census2011_code: '519',
      },
    ];
    return serializeToCsv(sampleDistricts);
  }

  if (t === 'CITY') {
    const sampleCities = [
      {
        state_code: '10',
        state_name_english: 'BIHAR',
        district_code: '215',
        district_name_english: 'PATNA',
        city_code: 'PAT',
        city_name_english: 'Patna',
        city_name_local: 'पटना',
        lgd_local_body_code: '800001',
        city_type: 'MUNICIPAL_CORPORATION',
      },
      {
        state_code: '10',
        state_name_english: 'BIHAR',
        district_code: '216',
        district_name_english: 'GAYA',
        city_code: 'GAY',
        city_name_english: 'Gaya',
        city_name_local: 'गया',
        lgd_local_body_code: '800002',
        city_type: 'MUNICIPAL_CORPORATION',
      },
    ];
    return serializeToCsv(sampleCities);
  }

  if (t === 'LOCALITY') {
    const sampleLocalities = [
      {
        city_name_english: 'Patna',
        locality_code: 'LOC-BOR',
        locality_name_english: 'Boring Road',
        locality_name_local: 'बोरिंग रोड',
        locality_type: 'URBAN_AREA',
        pincode: '800001',
      },
      {
        city_name_english: 'Patna',
        locality_code: 'LOC-KAN',
        locality_name_english: 'Kankarbagh',
        locality_name_local: 'कंकड़बाग',
        locality_type: 'URBAN_AREA',
        pincode: '800020',
      },
    ];
    return serializeToCsv(sampleLocalities);
  }

  if (t === 'PINCODE' || t === 'POST_OFFICE') {
    const samplePincodes = [
      {
        city_name_english: 'Patna',
        pincode: '800001',
        area_name: 'Patna G.P.O.',
        locality_name_english: 'Boring Road',
      },
      {
        city_name_english: 'Patna',
        pincode: '800020',
        area_name: 'Kankarbagh S.O.',
        locality_name_english: 'Kankarbagh',
      },
    ];
    return serializeToCsv(samplePincodes);
  }

  const sampleStates = [
    {
      state_code: '10',
      state_name_english: 'BIHAR',
      state_name_local: 'बिहार',
      state_census2011_code: '10',
      state_or_ut: 'State',
      last_updated: '2026-01-15',
    },
    {
      state_code: '27',
      state_name_english: 'MAHARASHTRA',
      state_name_local: 'महाराष्ट्र',
      state_census2011_code: '27',
      state_or_ut: 'State',
      last_updated: '2026-01-15',
    },
    {
      state_code: '07',
      state_name_english: 'DELHI',
      state_name_local: 'दिल्ली',
      state_census2011_code: '07',
      state_or_ut: 'UT',
      last_updated: '2026-01-15',
    },
  ];
  return serializeToCsv(sampleStates);
};
