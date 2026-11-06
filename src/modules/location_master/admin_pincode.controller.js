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

/**
 * GET /api/v1/admin/locations/pincodes
 */
export const listPincodes = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const { search, city_id, district_id, state_id, locality_id, is_active } = req.query;
    const where = { is_deleted: false };

    if (city_id) where.city_id = Number(city_id);
    if (district_id) where.district_id = Number(district_id);
    if (state_id) where.state_id = Number(state_id);

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === '1' || is_active === 1;
    }

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { pincode: { [Op.like]: q } },
        { area_name: { [Op.like]: q } },
      ];
    }

    // Locality filter
    const include = [
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
        model: Locality,
        as: 'localities',
        attributes: ['id', 'name', 'locality_type'],
        through: { attributes: ['is_primary'] },
        where: locality_id ? { id: Number(locality_id) } : undefined,
        required: locality_id ? true : false,
      },
    ];

    const { count, rows } = await Pincode.findAndCountAll({
      where,
      include,
      order: [
        ['display_order', 'ASC'],
        ['pincode', 'ASC'],
      ],
      distinct: true,
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit) || 1;
    return successResponse(
      res,
      200,
      'Pincodes fetched successfully',
      rows,
      { total: count, page, limit, totalPages }
    );
  } catch (error) {
    logger.error('Error fetching admin pincodes:', error);
    next(error);
  }
};

/**
 * GET /api/v1/admin/locations/pincodes/:id
 */
export const getPincodeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pincode = await Pincode.findOne({
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
          model: Locality,
          as: 'localities',
          attributes: ['id', 'name', 'locality_type', 'is_active'],
          through: { attributes: ['is_primary', 'source_system'] },
          required: false,
        },
      ],
    });

    if (!pincode) {
      return errorResponse(res, 404, 'Pincode not found.');
    }

    return successResponse(res, 200, 'Pincode fetched successfully', pincode);
  } catch (error) {
    logger.error('Error fetching admin pincode by id:', error);
    next(error);
  }
};

/**
 * POST /api/v1/admin/locations/pincodes
 */
export const createPincode = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const {
      city_id,
      state_id,
      district_id,
      locality_id,
      pincode,
      area_name,
      source_system,
      display_order,
      is_active,
      remark,
      locality_ids,
    } = req.body;

    const cleanPin = String(pincode || '').trim();

    // Verify City exists and resolve State & District if omitted
    const city = await City.findOne({
      where: { id: city_id, is_deleted: false },
      transaction: t,
    });
    if (!city) {
      await t.rollback();
      return errorResponse(res, 400, `City with id ${city_id} does not exist.`);
    }

    const resolvedStateId = state_id ? Number(state_id) : city.state_id;
    const resolvedDistrictId = district_id ? Number(district_id) : city.district_id;

    // Check duplicate in same city
    const duplicate = await Pincode.findOne({
      where: {
        city_id,
        pincode: cleanPin,
        is_deleted: false,
      },
      transaction: t,
    });

    if (duplicate) {
      await t.rollback();
      return errorResponse(
        res,
        409,
        `PIN code '${cleanPin}' is already registered in this city (ID: ${duplicate.id}).`
      );
    }

    const pinRecord = await Pincode.create({
      city_id,
      state_id: resolvedStateId || null,
      district_id: resolvedDistrictId || null,
      locality_id: locality_id ? Number(locality_id) : null,
      pincode: cleanPin,
      area_name: area_name ? area_name.trim() : null,
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

    // Handle locality mapping
    const allLocalityIds = new Set();
    if (locality_id) allLocalityIds.add(Number(locality_id));
    if (Array.isArray(locality_ids)) {
      locality_ids.forEach((id) => allLocalityIds.add(Number(id)));
    }

    if (allLocalityIds.size > 0) {
      const links = Array.from(allLocalityIds).map((locId, idx) => ({
        locality_id: locId,
        pincode_id: pinRecord.id,
        is_primary: idx === 0,
        source_system: 'MANUAL',
        created_at: new Date(),
        updatedAt: new Date(),
      }));
      await LocalityPincode.bulkCreate(links, {
        ignoreDuplicates: true,
        transaction: t,
      });
    }

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'pincode.create',
        target_type: 'pincode',
        target_id: pinRecord.id,
        details: JSON.stringify({ pincode: cleanPin, city_id, area_name }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for pincode create:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('PINCODE');

    const complete = await Pincode.findByPk(pinRecord.id, {
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
          model: Locality,
          as: 'localities',
          attributes: ['id', 'name', 'locality_type'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });

    return successResponse(res, 201, 'PIN code created successfully.', complete);
  } catch (error) {
    await t.rollback();
    logger.error('Error creating admin pincode:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/admin/locations/pincodes/:id
 */
export const updatePincode = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const {
      city_id,
      state_id,
      district_id,
      locality_id,
      pincode,
      area_name,
      source_system,
      display_order,
      is_active,
      remark,
      locality_ids,
    } = req.body;

    const pinRecord = await Pincode.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pinRecord) {
      await t.rollback();
      return errorResponse(res, 404, 'Pincode not found.');
    }

    const targetCityId = city_id !== undefined ? Number(city_id) : pinRecord.city_id;
    if (city_id !== undefined && city_id !== pinRecord.city_id) {
      const city = await City.findOne({
        where: { id: city_id, is_deleted: false },
        transaction: t,
      });
      if (!city) {
        await t.rollback();
        return errorResponse(res, 400, `City with id ${city_id} does not exist.`);
      }
    }

    const finalPin = pincode ? String(pincode).trim() : pinRecord.pincode;

    // Check duplicate
    const duplicate = await Pincode.findOne({
      where: {
        id: { [Op.ne]: id },
        city_id: targetCityId,
        pincode: finalPin,
        is_deleted: false,
      },
      transaction: t,
    });

    if (duplicate) {
      await t.rollback();
      return errorResponse(res, 409, `PIN code '${finalPin}' already exists in this city (ID: ${duplicate.id}).`);
    }

    await pinRecord.update({
      city_id: targetCityId,
      state_id: state_id !== undefined ? (state_id ? Number(state_id) : null) : pinRecord.state_id,
      district_id: district_id !== undefined ? (district_id ? Number(district_id) : null) : pinRecord.district_id,
      locality_id: locality_id !== undefined ? (locality_id ? Number(locality_id) : null) : pinRecord.locality_id,
      pincode: finalPin,
      area_name: area_name !== undefined ? (area_name ? area_name.trim() : null) : pinRecord.area_name,
      source_system: source_system !== undefined ? source_system : pinRecord.source_system,
      display_order: display_order !== undefined ? Number(display_order) : pinRecord.display_order,
      is_active: is_active !== undefined ? Boolean(is_active) : pinRecord.is_active,
      remark: remark !== undefined ? remark : pinRecord.remark,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    // Sync localities if provided
    if (Array.isArray(locality_ids)) {
      await LocalityPincode.destroy({
        where: { pincode_id: id },
        transaction: t,
      });
      if (locality_ids.length > 0) {
        const links = locality_ids.map((locId, idx) => ({
          locality_id: Number(locId),
          pincode_id: id,
          is_primary: idx === 0,
          source_system: 'MANUAL',
          created_at: new Date(),
          updatedAt: new Date(),
        }));
        await LocalityPincode.bulkCreate(links, {
          ignoreDuplicates: true,
          transaction: t,
        });
      }
    }

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: 'pincode.update',
        target_type: 'pincode',
        target_id: pinRecord.id,
        details: JSON.stringify({ pincode: finalPin, city_id: targetCityId }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for pincode update:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('PINCODE');

    const complete = await Pincode.findByPk(id, {
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
          model: Locality,
          as: 'localities',
          attributes: ['id', 'name', 'locality_type'],
          through: { attributes: ['is_primary'] },
        },
      ],
    });

    return successResponse(res, 200, 'PIN code updated successfully.', complete);
  } catch (error) {
    await t.rollback();
    logger.error('Error updating admin pincode:', error);
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/locations/pincodes/:id/status
 */
export const togglePincodeStatus = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const actorId = req.user?.id || req.user?.userId;
    const { id } = req.params;
    const { is_active } = req.body;

    const pincode = await Pincode.findOne({
      where: { id, is_deleted: false },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pincode) {
      await t.rollback();
      return errorResponse(res, 404, 'Pincode not found.');
    }

    await pincode.update({
      is_active,
      updated_by: actorId || null,
      updatedAt: new Date(),
    }, { transaction: t });

    try {
      await AuditLog.create({
        actor_id: actorId,
        action: is_active ? 'pincode.activate' : 'pincode.deactivate',
        target_type: 'pincode',
        target_id: pincode.id,
        details: JSON.stringify({ is_active }),
      }, { transaction: t });
    } catch (auditErr) {
      logger.warn('Audit log write failed for pincode toggle:', auditErr.message);
    }

    await t.commit();
    await invalidateLocationCache('PINCODE');

    return successResponse(
      res,
      200,
      `PIN code ${is_active ? 'activated' : 'deactivated'} successfully.`,
      pincode
    );
  } catch (error) {
    await t.rollback();
    logger.error('Error toggling admin pincode status:', error);
    next(error);
  }
};

/**
 * POST /api/v1/admin/locations/pincodes/:id/localities
 * Link a locality to a PIN code
 */
export const linkLocalityPincode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { locality_id, is_primary } = req.body;

    const [pincode, locality] = await Promise.all([
      Pincode.findOne({ where: { id, is_deleted: false } }),
      Locality.findOne({ where: { id: locality_id, is_deleted: false } }),
    ]);

    if (!pincode) return errorResponse(res, 404, 'PIN code not found.');
    if (!locality) return errorResponse(res, 404, 'Locality not found.');

    const [mapping, created] = await LocalityPincode.findOrCreate({
      where: { locality_id, pincode_id: id },
      defaults: {
        locality_id,
        pincode_id: id,
        is_primary: is_primary !== undefined ? is_primary : true,
        source_system: 'MANUAL',
        created_at: new Date(),
        updatedAt: new Date(),
      },
    });

    if (!created && is_primary !== undefined) {
      await mapping.update({ is_primary, updatedAt: new Date() });
    }

    return successResponse(res, 200, 'Locality linked to PIN code successfully.', mapping);
  } catch (error) {
    logger.error('Error linking locality to pincode:', error);
    next(error);
  }
};

/**
 * DELETE /api/v1/admin/locations/pincodes/:id/localities/:locality_id
 * Unlink a locality from a PIN code
 */
export const unlinkLocalityPincode = async (req, res, next) => {
  try {
    const { id, locality_id } = req.params;

    const deleted = await LocalityPincode.destroy({
      where: {
        pincode_id: id,
        locality_id,
      },
    });

    if (!deleted) {
      return errorResponse(res, 404, 'Mapping not found.');
    }

    return successResponse(res, 200, 'Locality unlinked from PIN code successfully.');
  } catch (error) {
    logger.error('Error unlinking locality from pincode:', error);
    next(error);
  }
};

