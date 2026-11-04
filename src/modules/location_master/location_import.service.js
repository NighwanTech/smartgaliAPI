import crypto from 'crypto';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import {
  Country,
  State,
  District,
  LocationImportBatch,
  LocationStagedRecord,
} from './location_master.models.js';
import User from '../user/user.model.js';
import AuditLog from '../audit_log/audit_log.model.js';
import { parseLgdCsv, serializeToCsv } from './lgd_csv_parser.service.js';
import { normalizeDistrictName } from './admin_district.controller.js';
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
      }

      // If atomic mode (default) and any row execution failed, abort and rollback transaction
      if (failedCount > 0 && !options.allow_partial) {
        throw new Error(`Atomic import aborted: ${failedCount} row(s) failed during transactional execution. First error: ${failedRows[0]?.error}`);
      } else {
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
  if (type.toUpperCase() === 'DISTRICT') {
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
