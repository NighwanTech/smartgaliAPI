import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import {
  Country,
  State,
  District,
  City,
  Locality,
  Pincode,
  LocationImportBatch,
} from './location_master.models.js';
import AuditLog from '../audit_log/audit_log.model.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import logger from '../../utils/logger.js';

/**
 * Normalizes district name to lowercase snake_case for robust duplicate prevention.
 */
export const normalizeDistrictName = (name) => {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * GET /api/v1/admin/locations/districts
 * Paginated, searchable, filterable list of districts with State info.
 */
export const listDistricts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { search, state_id, is_active } = req.query;
    const where = { is_deleted: false };

    if (state_id) {
      where.state_id = Number(state_id);
    }

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === '1' || is_active === 1;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { district_name_english: { [Op.like]: q } },
        { district_name_local: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { lgd_district_code: { [Op.like]: q } },
        { district_census2011_code: { [Op.like]: q } },
      ];
    }

    const { count, rows } = await District.findAndCountAll({
      where,
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code', 'country_id'] },
      ],
      order: [
        ['display_order', 'ASC'],
        ['district_name_english', 'ASC'],
      ],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit) || 1;
    return successResponse(
      res,
      200,
      'Districts fetched successfully',
      rows,
      { total: count, page, limit, totalPages }
    );
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/locations/districts/:id
 * Retrieve single district by primary key.
 */
export const getDistrictById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const district = await District.findOne({
      where: { id, is_deleted: false },
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code', 'country_id'] },
      ],
    });

    if (!district) {
      return errorResponse(res, 404, 'District not found.');
    }

    return successResponse(res, 200, 'District fetched successfully', district);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admin/locations/districts
 * Super Admin create single District.
 */
export const createDistrict = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const {
      state_id,
      district_name_english,
      district_name_local,
      lgd_district_code,
      district_census2011_code,
      code,
      source_system = 'MANUAL',
      display_order = 0,
      is_active = true,
      remark,
    } = req.body;

    // 1. Verify target State exists and is active
    const state = await State.findOne({
      where: { id: state_id, is_deleted: false },
      transaction: t,
    });
    if (!state) {
      await t.rollback();
      return errorResponse(res, 400, `Invalid state_id: State #${state_id} does not exist or is inactive.`);
    }

    const normalizedName = normalizeDistrictName(district_name_english);

    // 2. Enforce duplicate name check within state
    const duplicateName = await District.findOne({
      where: {
        state_id,
        normalized_name: normalizedName,
        is_deleted: false,
      },
      transaction: t,
    });
    if (duplicateName) {
      await t.rollback();
      return errorResponse(res, 409, `District '${district_name_english}' already exists in state '${state.name}'.`);
    }

    // 3. Enforce LGD code uniqueness across non-deleted districts (if provided)
    if (lgd_district_code && lgd_district_code.trim()) {
      const cleanLgd = lgd_district_code.trim();
      const duplicateLgd = await District.findOne({
        where: {
          lgd_district_code: cleanLgd,
          is_deleted: false,
        },
        transaction: t,
      });
      if (duplicateLgd) {
        await t.rollback();
        return errorResponse(
          res,
          409,
          `District with LGD code '${cleanLgd}' already exists (${duplicateLgd.district_name_english}, ID #${duplicateLgd.id}).`
        );
      }
    }

    // 4. Create district record
    const createdDistrict = await District.create({
      state_id,
      district_name_english: district_name_english.trim(),
      district_name_local: district_name_local ? district_name_local.trim() : null,
      normalized_name: normalizedName,
      code: code ? code.trim() : null,
      lgd_district_code: lgd_district_code ? lgd_district_code.trim() : null,
      district_census2011_code: district_census2011_code ? district_census2011_code.trim() : null,
      source_system: source_system.trim(),
      source_last_updated: new Date(),
      display_order,
      is_active,
      created_by: actorId || null,
      remark: remark || null,
    }, { transaction: t });

    // 5. Audit Log Entry
    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'district.create',
        target_type: 'district',
        target_id: createdDistrict.id,
        details: JSON.stringify({
          state_id,
          state_name: state.name,
          district_name_english: createdDistrict.district_name_english,
          lgd_district_code: createdDistrict.lgd_district_code,
        }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for district create:', auditErr.message);
    }

    await t.commit();

    // Fetch complete district with State relation
    const complete = await District.findByPk(createdDistrict.id, {
      include: [{ model: State, as: 'state', attributes: ['id', 'name', 'code'] }],
    });

    return successResponse(res, 201, 'District created successfully.', complete);
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * PUT /api/v1/admin/locations/districts/:id
 * Super Admin update single District.
 */
export const updateDistrict = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;

    const district = await District.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!district) {
      await t.rollback();
      return errorResponse(res, 404, 'District not found.');
    }

    const {
      state_id,
      district_name_english,
      district_name_local,
      lgd_district_code,
      district_census2011_code,
      code,
      source_system,
      display_order,
      is_active,
      remark,
    } = req.body;

    const targetStateId = state_id !== undefined ? Number(state_id) : district.state_id;

    // 1. Verify target state if changed
    if (state_id !== undefined && Number(state_id) !== district.state_id) {
      const state = await State.findOne({
        where: { id: targetStateId, is_deleted: false },
        transaction: t,
      });
      if (!state) {
        await t.rollback();
        return errorResponse(res, 400, `Invalid state_id: State #${targetStateId} does not exist or is inactive.`);
      }
    }

    // 2. Enforce duplicate name check if name or state changed
    const targetName = district_name_english !== undefined ? district_name_english.trim() : district.district_name_english;
    const targetNormalized = normalizeDistrictName(targetName);

    if (targetNormalized !== district.normalized_name || targetStateId !== district.state_id) {
      const duplicateName = await District.findOne({
        where: {
          id: { [Op.ne]: id },
          state_id: targetStateId,
          normalized_name: targetNormalized,
          is_deleted: false,
        },
        transaction: t,
      });
      if (duplicateName) {
        await t.rollback();
        return errorResponse(res, 409, `District '${targetName}' already exists in the designated state.`);
      }
    }

    // 3. Enforce LGD code uniqueness if code changed
    if (lgd_district_code !== undefined && lgd_district_code !== null && lgd_district_code.trim()) {
      const cleanLgd = lgd_district_code.trim();
      const duplicateLgd = await District.findOne({
        where: {
          id: { [Op.ne]: id },
          lgd_district_code: cleanLgd,
          is_deleted: false,
        },
        transaction: t,
      });
      if (duplicateLgd) {
        await t.rollback();
        return errorResponse(
          res,
          409,
          `District with LGD code '${cleanLgd}' already exists (${duplicateLgd.district_name_english}, ID #${duplicateLgd.id}).`
        );
      }
    }

    // 4. Apply updates
    const updates = {};
    if (state_id !== undefined) updates.state_id = targetStateId;
    if (district_name_english !== undefined) {
      updates.district_name_english = targetName;
      updates.normalized_name = targetNormalized;
    }
    if (district_name_local !== undefined) updates.district_name_local = district_name_local ? district_name_local.trim() : null;
    if (code !== undefined) updates.code = code ? code.trim() : null;
    if (lgd_district_code !== undefined) updates.lgd_district_code = lgd_district_code ? lgd_district_code.trim() : null;
    if (district_census2011_code !== undefined) updates.district_census2011_code = district_census2011_code ? district_census2011_code.trim() : null;
    if (source_system !== undefined) updates.source_system = source_system.trim();
    if (display_order !== undefined) updates.display_order = display_order;
    if (is_active !== undefined) updates.is_active = is_active;
    if (remark !== undefined) updates.remark = remark;
    updates.updated_by = actorId || null;
    updates.source_last_updated = new Date();
    updates.updatedAt = new Date();

    await district.update(updates, { transaction: t });

    // 5. Audit Log
    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'district.update',
        target_type: 'district',
        target_id: district.id,
        details: JSON.stringify(updates),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for district update:', auditErr.message);
    }

    await t.commit();

    const complete = await District.findByPk(id, {
      include: [{ model: State, as: 'state', attributes: ['id', 'name', 'code'] }],
    });

    return successResponse(res, 200, 'District updated successfully.', complete);
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/locations/districts/:id/status
 * Super Admin activate or deactivate single District.
 */
export const toggleDistrictStatus = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const { is_active } = req.body;

    const district = await District.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!district) {
      await t.rollback();
      return errorResponse(res, 404, 'District not found.');
    }

    await district.update({
      is_active,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: is_active ? 'district.activate' : 'district.deactivate',
        target_type: 'district',
        target_id: district.id,
        details: JSON.stringify({ is_active }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for district toggle:', auditErr.message);
    }

    await t.commit();

    return successResponse(
      res,
      200,
      `District ${is_active ? 'activated' : 'deactivated'} successfully.`,
      district
    );
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

/**
 * GET /api/v1/admin/locations/states
 * Paginated and searchable list of states with LGD metadata and district count.
 */
export const listStates = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { search, is_active } = req.query;
    const where = { is_deleted: false };

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === '1' || is_active === 1;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { lgd_state_code: { [Op.like]: q } },
        { state_census2011_code: { [Op.like]: q } },
      ];
    }

    const { count, rows } = await State.findAndCountAll({
      where,
      include: [
        {
          model: District,
          as: 'districts',
          attributes: ['id'],
          where: { is_deleted: false },
          required: false,
        },
      ],
      order: [
        ['display_order', 'ASC'],
        ['name', 'ASC'],
      ],
      distinct: true,
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);
    const formatted = rows.map((s) => {
      const plain = s.get({ plain: true });
      plain.district_count = plain.districts ? plain.districts.length : 0;
      delete plain.districts;
      return plain;
    });

    return successResponse(
      res,
      200,
      'States fetched successfully',
      formatted,
      { total: count, page, limit, totalPages }
    );
  } catch (error) {
    logger.error('Error fetching admin states:', error);
    next(error);
  }
};

/**
 * GET /api/v1/admin/locations/summary
 * Overall location master metrics: counts of states, districts, cities, localities, pincodes, and recent import activity.
 */
export const getLocationSummary = async (req, res, next) => {
  try {
    const [
      totalStates,
      totalDistricts,
      activeDistricts,
      totalCities,
      totalLocalities,
      totalPincodes,
      recentBatches,
    ] = await Promise.all([
      State.count({ where: { is_deleted: false } }),
      District.count({ where: { is_deleted: false } }),
      District.count({ where: { is_active: true, is_deleted: false } }),
      City.count({ where: { is_deleted: false } }),
      Locality.count({ where: { is_deleted: false } }),
      Pincode.count({ where: { is_deleted: false } }),
      LocationImportBatch.findAll({
        order: [['created_at', 'DESC']],
        limit: 5,
      }),
    ]);

    return successResponse(res, 200, 'Location master summary fetched successfully.', {
      counts: {
        states: totalStates,
        districts: totalDistricts,
        active_districts: activeDistricts,
        cities: totalCities,
        localities: totalLocalities,
        pincodes: totalPincodes,
      },
      recent_imports: recentBatches,
    });
  } catch (error) {
    logger.error('Error fetching location master summary:', error);
    next(error);
  }
};


