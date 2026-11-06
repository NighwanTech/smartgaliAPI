import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import {
  State,
  District,
  City,
  Locality,
  Pincode,
  LocalityPincode,
} from './location_master.models.js';
import AuditLog from '../audit_log/audit_log.model.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import logger from '../../utils/logger.js';
import { invalidateLocationCache } from './location_cache.service.js';

export const normalizeLocalityName = (name) => {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * GET /api/v1/admin/locations/localities
 */
export const listLocalities = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { search, city_id, district_id, state_id, locality_type, is_active } = req.query;
    const where = { is_deleted: false };

    if (city_id) where.city_id = Number(city_id);
    if (locality_type) where.locality_type = locality_type;

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === '1' || is_active === 1;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: q } },
        { locality_name_local: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { source_reference_code: { [Op.like]: q } },
      ];
    }

    const cityWhere = { is_deleted: false };
    if (district_id) cityWhere.district_id = Number(district_id);
    if (state_id) cityWhere.state_id = Number(state_id);

    const { count, rows } = await Locality.findAndCountAll({
      where,
      include: [
        {
          model: City,
          as: 'city',
          where: Object.keys(cityWhere).length > 1 ? cityWhere : undefined,
          attributes: ['id', 'name', 'code', 'district_id', 'state_id'],
          include: [
            { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
            { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'] },
          ],
        },
        {
          model: Pincode,
          as: 'pincodes',
          attributes: ['id', 'pincode', 'area_name'],
          through: { attributes: ['is_primary'] },
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

    const totalPages = Math.ceil(count / limit) || 1;
    return successResponse(
      res,
      200,
      'Localities fetched successfully',
      rows,
      { total: count, page, limit, totalPages }
    );
  } catch (error) {
    logger.error('Error fetching admin localities:', error);
    next(error);
  }
};

/**
 * GET /api/v1/admin/locations/localities/:id
 */
export const getLocalityById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const locality = await Locality.findOne({
      where: { id, is_deleted: false },
      include: [
        {
          model: City,
          as: 'city',
          attributes: ['id', 'name', 'code', 'district_id', 'state_id'],
          include: [
            { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
            { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'] },
          ],
        },
        {
          model: Pincode,
          as: 'pincodes',
          attributes: ['id', 'pincode', 'area_name', 'is_active'],
          through: { attributes: ['is_primary', 'source_system'] },
          required: false,
        },
      ],
    });

    if (!locality) {
      return errorResponse(res, 404, 'Locality not found.');
    }

    return successResponse(res, 200, 'Locality fetched successfully', locality);
  } catch (error) {
    logger.error('Error fetching admin locality by id:', error);
    next(error);
  }
};

/**
 * POST /api/v1/admin/locations/localities
 */
export const createLocality = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const {
      city_id,
      name,
      locality_name_english,
      locality_name_local,
      code,
      locality_type,
      source_system,
      source_reference_code,
      display_order,
      is_active,
      remark,
      pincode_ids,
    } = req.body;

    const finalName = (locality_name_english || name || '').trim();
    if (!finalName) {
      await t.rollback();
      return errorResponse(res, 400, 'Locality name is required.');
    }

    // Verify City exists
    const city = await City.findOne({
      where: { id: city_id, is_deleted: false },
      transaction: t,
    });
    if (!city) {
      await t.rollback();
      return errorResponse(res, 400, `City with id ${city_id} does not exist.`);
    }

    const normalizedName = normalizeLocalityName(finalName);

    // Duplicate check in city
    const duplicate = await Locality.findOne({
      where: {
        city_id,
        is_deleted: false,
        [Op.or]: [
          { normalized_name: normalizedName },
          ...(code ? [{ code: code.trim() }] : []),
        ],
      },
      transaction: t,
    });

    if (duplicate) {
      await t.rollback();
      return errorResponse(
        res,
        409,
        `Locality '${finalName}' already exists in this city (ID: ${duplicate.id}).`
      );
    }

    const locality = await Locality.create({
      city_id,
      name: finalName,
      locality_name_local: locality_name_local ? locality_name_local.trim() : null,
      code: code ? code.trim() : null,
      normalized_name: normalizedName,
      locality_type: locality_type || 'URBAN_AREA',
      source_system: source_system || 'MANUAL',
      source_reference_code: source_reference_code ? source_reference_code.trim() : null,
      display_order: display_order !== undefined ? Number(display_order) : 0,
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      remark: remark || null,
      created_by: actorId || null,
      updated_by: actorId || null,
      created_at: new Date(),
      updatedAt: new Date(),
    }, { transaction: t });

    // Link pincodes if supplied
    if (Array.isArray(pincode_ids) && pincode_ids.length > 0) {
      const pinLinks = pincode_ids.map((pid, idx) => ({
        locality_id: locality.id,
        pincode_id: Number(pid),
        is_primary: idx === 0,
        source_system: 'MANUAL',
        created_at: new Date(),
        updatedAt: new Date(),
      }));
      await LocalityPincode.bulkCreate(pinLinks, {
        ignoreDuplicates: true,
        transaction: t,
      });
    }

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'locality.create',
        target_type: 'locality',
        target_id: locality.id,
        details: JSON.stringify({ name: finalName, city_id }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for locality create:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('LOCALITY');

    const complete = await Locality.findByPk(locality.id, {
      include: [
        {
          model: City,
          as: 'city',
          include: [
            { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
            { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'] },
          ],
        },
        {
          model: Pincode,
          as: 'pincodes',
          attributes: ['id', 'pincode', 'area_name'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });

    return successResponse(res, 201, 'Locality created successfully.', complete);
  } catch (error) {
    await t.rollback();
    logger.error('Error creating admin locality:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/admin/locations/localities/:id
 */
export const updateLocality = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const {
      city_id,
      name,
      locality_name_english,
      locality_name_local,
      code,
      locality_type,
      source_system,
      source_reference_code,
      display_order,
      is_active,
      remark,
      pincode_ids,
    } = req.body;

    const locality = await Locality.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!locality) {
      await t.rollback();
      return errorResponse(res, 404, 'Locality not found.');
    }

    const targetCityId = city_id !== undefined ? Number(city_id) : locality.city_id;
    if (city_id !== undefined && city_id !== locality.city_id) {
      const city = await City.findOne({
        where: { id: city_id, is_deleted: false },
        transaction: t,
      });
      if (!city) {
        await t.rollback();
        return errorResponse(res, 400, `City with id ${city_id} does not exist.`);
      }
    }

    const finalName = (locality_name_english || name) ? (locality_name_english || name).trim() : locality.name;
    const normalizedName = normalizeLocalityName(finalName);

    // Duplicate check
    const dupConditions = [{ normalized_name: normalizedName }];
    if (code) dupConditions.push({ code: code.trim() });

    const duplicate = await Locality.findOne({
      where: {
        id: { [Op.ne]: id },
        city_id: targetCityId,
        is_deleted: false,
        [Op.or]: dupConditions,
      },
      transaction: t,
    });

    if (duplicate) {
      await t.rollback();
      return errorResponse(res, 409, `Another locality with conflicting name or code already exists in this city (ID: ${duplicate.id}).`);
    }

    await locality.update({
      city_id: targetCityId,
      name: finalName,
      locality_name_local: locality_name_local !== undefined ? (locality_name_local ? locality_name_local.trim() : null) : locality.locality_name_local,
      code: code !== undefined ? (code ? code.trim() : null) : locality.code,
      normalized_name: normalizedName,
      locality_type: locality_type !== undefined ? locality_type : locality.locality_type,
      source_system: source_system !== undefined ? source_system : locality.source_system,
      source_reference_code: source_reference_code !== undefined ? (source_reference_code ? source_reference_code.trim() : null) : locality.source_reference_code,
      display_order: display_order !== undefined ? Number(display_order) : locality.display_order,
      is_active: is_active !== undefined ? Boolean(is_active) : locality.is_active,
      remark: remark !== undefined ? remark : locality.remark,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    // If pincode_ids is provided, synchronize locality_pincodes
    if (Array.isArray(pincode_ids)) {
      await LocalityPincode.destroy({
        where: { locality_id: id },
        transaction: t,
      });
      if (pincode_ids.length > 0) {
        const pinLinks = pincode_ids.map((pid, idx) => ({
          locality_id: id,
          pincode_id: Number(pid),
          is_primary: idx === 0,
          source_system: 'MANUAL',
          created_at: new Date(),
          updatedAt: new Date(),
        }));
        await LocalityPincode.bulkCreate(pinLinks, {
          ignoreDuplicates: true,
          transaction: t,
        });
      }
    }

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'locality.update',
        target_type: 'locality',
        target_id: locality.id,
        details: JSON.stringify({ name: finalName, city_id: targetCityId }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for locality update:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('LOCALITY');

    const complete = await Locality.findByPk(id, {
      include: [
        {
          model: City,
          as: 'city',
          include: [
            { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
            { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'] },
          ],
        },
        {
          model: Pincode,
          as: 'pincodes',
          attributes: ['id', 'pincode', 'area_name'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });

    return successResponse(res, 200, 'Locality updated successfully.', complete);
  } catch (error) {
    await t.rollback();
    logger.error('Error updating admin locality:', error);
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/locations/localities/:id/status
 */
export const toggleLocalityStatus = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const { is_active } = req.body;

    const locality = await Locality.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!locality) {
      await t.rollback();
      return errorResponse(res, 404, 'Locality not found.');
    }

    await locality.update({
      is_active,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: is_active ? 'locality.activate' : 'locality.deactivate',
        target_type: 'locality',
        target_id: locality.id,
        details: JSON.stringify({ is_active }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for locality toggle:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('LOCALITY');

    return successResponse(
      res,
      200,
      `Locality ${is_active ? 'activated' : 'deactivated'} successfully.`,
      locality
    );
  } catch (error) {
    await t.rollback();
    logger.error('Error toggling admin locality status:', error);
    next(error);
  }
};

