import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import {
  State,
  District,
  City,
  Locality,
  Pincode,
} from './location_master.models.js';
import AuditLog from '../audit_log/audit_log.model.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import logger from '../../utils/logger.js';
import { invalidateLocationCache } from './location_cache.service.js';

export const normalizeCityName = (name) => {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * GET /api/v1/admin/locations/cities
 * Paginated, searchable, filterable list of cities with State & District info.
 */
export const listCities = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { search, state_id, district_id, city_type, is_active } = req.query;
    const where = { is_deleted: false };

    if (state_id) where.state_id = Number(state_id);
    if (district_id) where.district_id = Number(district_id);
    if (city_type) where.city_type = city_type;

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === '1' || is_active === 1;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { city_name_local: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { lgd_local_body_code: { [Op.like]: q } },
      ];
    }

    const { count, rows } = await City.findAndCountAll({
      where,
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code', 'lgd_district_code'] },
      ],
      order: [
        ['display_order', 'ASC'],
        ['name', 'ASC'],
      ],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit) || 1;
    return successResponse(
      res,
      200,
      'Cities fetched successfully',
      rows,
      { total: count, page, limit, totalPages }
    );
  } catch (error) {
    logger.error('Error fetching admin cities:', error);
    next(error);
  }
};

/**
 * GET /api/v1/admin/locations/cities/:id
 */
export const getCityById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const city = await City.findOne({
      where: { id, is_deleted: false },
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code', 'lgd_district_code'] },
      ],
    });

    if (!city) {
      return errorResponse(res, 404, 'City not found.');
    }

    const [localityCount, pincodeCount] = await Promise.all([
      Locality.count({ where: { city_id: id, is_deleted: false } }),
      Pincode.count({ where: { city_id: id, is_deleted: false } }),
    ]);

    const result = city.toJSON();
    result.locality_count = localityCount;
    result.pincode_count = pincodeCount;

    return successResponse(res, 200, 'City fetched successfully', result);
  } catch (error) {
    logger.error('Error fetching admin city by id:', error);
    next(error);
  }
};

/**
 * POST /api/v1/admin/locations/cities
 */
export const createCity = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const {
      state_id,
      district_id,
      name,
      city_name_english,
      city_name_local,
      code,
      lgd_local_body_code,
      city_type,
      source_system,
      display_order,
      is_active,
      remark,
    } = req.body;

    const finalName = (city_name_english || name || '').trim();
    if (!finalName) {
      await t.rollback();
      return errorResponse(res, 400, 'City name is required.');
    }

    // Validate State
    const state = await State.findOne({
      where: { id: state_id, is_deleted: false },
      transaction: t,
    });
    if (!state) {
      await t.rollback();
      return errorResponse(res, 400, `State with id ${state_id} does not exist or is inactive.`);
    }

    // Validate District if provided
    if (district_id) {
      const district = await District.findOne({
        where: { id: district_id, is_deleted: false },
        transaction: t,
      });
      if (!district) {
        await t.rollback();
        return errorResponse(res, 400, `District with id ${district_id} does not exist.`);
      }
      if (Number(district.state_id) !== Number(state_id)) {
        await t.rollback();
        return errorResponse(res, 400, `District ${district.district_name_english} belongs to a different state.`);
      }
    }

    const normalizedName = normalizeCityName(finalName);

    // Duplicate check within state
    const duplicate = await City.findOne({
      where: {
        state_id,
        is_deleted: false,
        [Op.or]: [
          { normalized_name: normalizedName },
          ...(code ? [{ code: code.trim() }] : []),
          ...(lgd_local_body_code ? [{ lgd_local_body_code: lgd_local_body_code.trim() }] : []),
        ],
      },
      transaction: t,
    });

    if (duplicate) {
      await t.rollback();
      return errorResponse(
        res,
        409,
        `A city with name '${finalName}' or code already exists in this state (ID: ${duplicate.id}).`
      );
    }

    const city = await City.create({
      state_id,
      district_id: district_id || null,
      name: finalName,
      city_name_local: city_name_local ? city_name_local.trim() : null,
      code: code ? code.trim() : null,
      lgd_local_body_code: lgd_local_body_code ? lgd_local_body_code.trim() : null,
      normalized_name: normalizedName,
      city_type: city_type || 'MUNICIPAL_CORPORATION',
      source_system: source_system || 'MANUAL',
      source_last_updated: new Date(),
      display_order: display_order !== undefined ? Number(display_order) : 0,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      remark: remark || null,
      created_by: actorId || null,
      updated_by: actorId || null,
      created_at: new Date(),
      updatedAt: new Date(),
    }, { transaction: t });

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'city.create',
        target_type: 'city',
        target_id: city.id,
        details: JSON.stringify({ name: finalName, state_id, district_id }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for city create:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('CITY');

    const complete = await City.findByPk(city.id, {
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'] },
      ],
    });

    return successResponse(res, 201, 'City created successfully.', complete);
  } catch (error) {
    await t.rollback();
    logger.error('Error creating admin city:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/admin/locations/cities/:id
 */
export const updateCity = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const {
      state_id,
      district_id,
      name,
      city_name_english,
      city_name_local,
      code,
      lgd_local_body_code,
      city_type,
      source_system,
      display_order,
      is_active,
      remark,
    } = req.body;

    const city = await City.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!city) {
      await t.rollback();
      return errorResponse(res, 404, 'City not found.');
    }

    const targetStateId = state_id !== undefined ? Number(state_id) : city.state_id;
    if (state_id !== undefined && state_id !== city.state_id) {
      const state = await State.findOne({
        where: { id: state_id, is_deleted: false },
        transaction: t,
      });
      if (!state) {
        await t.rollback();
        return errorResponse(res, 400, `State with id ${state_id} does not exist.`);
      }
    }

    const targetDistrictId = district_id !== undefined ? (district_id ? Number(district_id) : null) : city.district_id;
    if (targetDistrictId) {
      const district = await District.findOne({
        where: { id: targetDistrictId, is_deleted: false },
        transaction: t,
      });
      if (!district) {
        await t.rollback();
        return errorResponse(res, 400, `District with id ${targetDistrictId} does not exist.`);
      }
      if (Number(district.state_id) !== targetStateId) {
        await t.rollback();
        return errorResponse(res, 400, `District belongs to state id ${district.state_id}, not state id ${targetStateId}.`);
      }
    }

    const finalName = (city_name_english || name) ? (city_name_english || name).trim() : city.name;
    const normalizedName = normalizeCityName(finalName);

    // Duplicate check
    const dupConditions = [{ normalized_name: normalizedName }];
    if (code) dupConditions.push({ code: code.trim() });
    if (lgd_local_body_code) dupConditions.push({ lgd_local_body_code: lgd_local_body_code.trim() });

    const duplicate = await City.findOne({
      where: {
        id: { [Op.ne]: id },
        state_id: targetStateId,
        is_deleted: false,
        [Op.or]: dupConditions,
      },
      transaction: t,
    });

    if (duplicate) {
      await t.rollback();
      return errorResponse(res, 409, `Another city with conflicting name or code already exists (ID: ${duplicate.id}).`);
    }

    await city.update({
      state_id: targetStateId,
      district_id: targetDistrictId,
      name: finalName,
      city_name_local: city_name_local !== undefined ? (city_name_local ? city_name_local.trim() : null) : city.city_name_local,
      code: code !== undefined ? (code ? code.trim() : null) : city.code,
      lgd_local_body_code: lgd_local_body_code !== undefined ? (lgd_local_body_code ? lgd_local_body_code.trim() : null) : city.lgd_local_body_code,
      normalized_name: normalizedName,
      city_type: city_type !== undefined ? city_type : city.city_type,
      source_system: source_system !== undefined ? source_system : city.source_system,
      display_order: display_order !== undefined ? Number(display_order) : city.display_order,
      is_active: is_active !== undefined ? Boolean(is_active) : city.is_active,
      remark: remark !== undefined ? remark : city.remark,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'city.update',
        target_type: 'city',
        target_id: city.id,
        details: JSON.stringify({ name: finalName, state_id: targetStateId, district_id: targetDistrictId }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for city update:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('CITY');

    const complete = await City.findByPk(id, {
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'] },
      ],
    });

    return successResponse(res, 200, 'City updated successfully.', complete);
  } catch (error) {
    await t.rollback();
    logger.error('Error updating admin city:', error);
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/locations/cities/:id/status
 */
export const toggleCityStatus = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const { is_active } = req.body;

    const city = await City.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!city) {
      await t.rollback();
      return errorResponse(res, 404, 'City not found.');
    }

    await city.update({
      is_active,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: is_active ? 'city.activate' : 'city.deactivate',
        target_type: 'city',
        target_id: city.id,
        details: JSON.stringify({ is_active }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for city toggle:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('CITY');

    return successResponse(
      res,
      200,
      `City ${is_active ? 'activated' : 'deactivated'} successfully.`,
      city
    );
  } catch (error) {
    await t.rollback();
    logger.error('Error toggling admin city status:', error);
    next(error);
  }
};

