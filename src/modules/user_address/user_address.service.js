import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import UserAddress from '../profile/user_address.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';

export const activeAddressWhere = (userId) => ({
  user_id: userId,
  is_deleted: false,
  is_active: true,
});

export const shouldMakeAddressDefault = ({ requestedDefault, activeAddressCount }) =>
  requestedDefault === true || activeAddressCount === 0;

export const serializeAddress = (a) => {
  if (!a) return null;
  const raw = a.get ? a.get({ plain: true }) : a;

  const type = String(raw.address_type || raw.label || 'HOME').toUpperCase();
  const normalizedType = ['HOME', 'OFFICE', 'OTHER'].includes(type) ? type : 'HOME';

  const flatUnit = raw.flat_unit || raw.house_no || null;
  const buildingName = raw.building_name || raw.landmark || null;
  const streetAddress = raw.street_address || raw.street || null;
  const locality = raw.locality || null;
  const city = raw.city || null;
  const district = raw.district || null;
  const state = raw.state || null;
  const pincode = raw.pincode || null;

  const fullAddress = raw.full_address || [
    flatUnit,
    buildingName,
    streetAddress,
    locality,
    city,
    district,
    state,
    pincode,
  ].filter(Boolean).join(', ');

  const societyObj = raw.society ? {
    id: raw.society.id,
    societyName: raw.society.society_name,
    society_name: raw.society.society_name,
    address: raw.society.address,
  } : null;

  return {
    id: raw.id,
    userId: raw.user_id,
    user_id: raw.user_id,
    addressType: normalizedType,
    address_type: normalizedType,
    flatUnit,
    flat_unit: flatUnit,
    buildingName,
    building_name: buildingName,
    streetAddress,
    street_address: streetAddress,
    locality,
    city,
    district,
    state,
    pincode,
    societyId: raw.society_id || null,
    society_id: raw.society_id || null,
    society: societyObj,
    // Backward compatibility aliases
    label: raw.label || normalizedType.charAt(0) + normalizedType.slice(1).toLowerCase(),
    houseNo: flatUnit,
    house_no: flatUnit,
    street: streetAddress,
    landmark: buildingName,
    fullAddress,
    full_address: fullAddress,
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    isDefault: !!raw.is_default,
    is_default: !!raw.is_default,
    isActive: !!raw.is_active,
    is_active: !!raw.is_active,
    createdAt: raw.created_at,
    created_at: raw.created_at,
    updatedAt: raw.updated_at || raw.updatedAt,
    updated_at: raw.updated_at || raw.updatedAt,
  };
};

/**
 * Normalizes client payload into database columns
 */
const normalizeAddressPayload = (data) => {
  let addressType = (data.addressType || data.address_type || data.label || 'HOME').toUpperCase();
  if (!['HOME', 'OFFICE', 'OTHER'].includes(addressType)) {
    addressType = 'HOME';
  }

  const flatUnit = data.flatUnit ?? data.flat_unit ?? data.houseNo ?? data.house_no ?? null;
  const buildingName = data.buildingName ?? data.building_name ?? data.landmark ?? null;
  const streetAddress = data.streetAddress ?? data.street_address ?? data.street ?? null;
  const locality = data.locality ?? null;
  const city = data.city ?? null;
  const district = data.district ?? null;
  const state = data.state ?? null;
  const pincode = data.pincode ?? null;
  const societyId = data.societyId ?? data.society_id ?? null;
  const latitude = data.latitude !== undefined ? data.latitude : null;
  const longitude = data.longitude !== undefined ? data.longitude : null;
  const requestedDefault = data.isDefault !== undefined ? Boolean(data.isDefault) : (data.is_default !== undefined ? Boolean(data.is_default) : undefined);

  let fullAddress = data.fullAddress ?? data.full_address ?? null;
  if (!fullAddress) {
    const parts = [flatUnit, buildingName, streetAddress, locality, city, district, state, pincode].filter(Boolean);
    if (parts.length > 0) {
      fullAddress = parts.join(', ');
    }
  }

  const label = data.label || (addressType.charAt(0) + addressType.slice(1).toLowerCase());

  return {
    addressType,
    flatUnit,
    buildingName,
    streetAddress,
    locality,
    city,
    district,
    state,
    pincode,
    societyId,
    latitude,
    longitude,
    fullAddress,
    label,
    requestedDefault,
  };
};

/**
 * List all active addresses for a resident
 */
export const getAddresses = async (userId) => {
  const rows = await UserAddress.findAll({
    where: { user_id: userId, is_deleted: false, is_active: true },
    include: [
      {
        model: SocietyProfile,
        as: 'society',
        attributes: ['id', 'society_name', 'address'],
        required: false,
      },
    ],
    order: [['is_default', 'DESC'], ['id', 'DESC']],
  });
  return rows.map(serializeAddress);
};

/**
 * Get single address by id with ownership verification
 */
export const getAddressById = async (userId, addressId) => {
  const address = await UserAddress.findOne({
    where: { id: addressId, user_id: userId, is_deleted: false, is_active: true },
    include: [
      {
        model: SocietyProfile,
        as: 'society',
        attributes: ['id', 'society_name', 'address'],
        required: false,
      },
    ],
  });
  return address ? serializeAddress(address) : null;
};

/**
 * Create a new address for the authenticated resident
 */
export const createAddress = async (userId, rawData) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return { error: 'Active user not found.', status: 404 };
    }

    const payload = normalizeAddressPayload(rawData);

    if (payload.societyId) {
      const society = await SocietyProfile.findOne({
        where: { id: payload.societyId, is_deleted: false, is_active: true },
        transaction: t,
      });
      if (!society) {
        await t.rollback();
        return { error: 'Specified society not found or inactive.', status: 400 };
      }
    }

    const activeWhere = activeAddressWhere(userId);
    const count = await UserAddress.count({ where: activeWhere, transaction: t });
    const shouldDefault = shouldMakeAddressDefault({
      requestedDefault: payload.requestedDefault,
      activeAddressCount: count,
    });

    if (shouldDefault) {
      await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
    }

    const created = await UserAddress.create({
      user_id: userId,
      address_type: payload.addressType,
      flat_unit: payload.flatUnit,
      building_name: payload.buildingName,
      street_address: payload.streetAddress,
      locality: payload.locality,
      label: payload.label,
      house_no: payload.flatUnit,
      street: payload.streetAddress,
      landmark: payload.buildingName,
      city: payload.city,
      district: payload.district,
      state: payload.state,
      pincode: payload.pincode,
      society_id: payload.societyId,
      full_address: payload.fullAddress,
      latitude: payload.latitude,
      longitude: payload.longitude,
      is_default: shouldDefault,
      is_active: true,
      is_deleted: false,
      created_by: userId,
      updated_by: userId,
    }, { transaction: t });

    await t.commit();

    const result = await UserAddress.findByPk(created.id, {
      include: [
        {
          model: SocietyProfile,
          as: 'society',
          attributes: ['id', 'society_name', 'address'],
          required: false,
        },
      ],
    });

    return { data: serializeAddress(result) };
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }
};

/**
 * Update existing address with ownership verification & transactional default handling
 */
export const updateAddress = async (userId, addressId, rawData) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return { error: 'Active user not found.', status: 404 };
    }

    const activeWhere = activeAddressWhere(userId);
    const address = await UserAddress.findOne({
      where: { id: addressId, ...activeWhere },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!address) {
      await t.rollback();
      return { error: 'Address not found or does not belong to you.', status: 404 };
    }

    const payload = normalizeAddressPayload(rawData);

    if (payload.societyId) {
      const society = await SocietyProfile.findOne({
        where: { id: payload.societyId, is_deleted: false, is_active: true },
        transaction: t,
      });
      if (!society) {
        await t.rollback();
        return { error: 'Specified society not found or inactive.', status: 400 };
      }
    }

    const patch = {};
    if (rawData.addressType !== undefined || rawData.address_type !== undefined) patch.address_type = payload.addressType;
    if (rawData.flatUnit !== undefined || rawData.flat_unit !== undefined || rawData.houseNo !== undefined || rawData.house_no !== undefined) {
      patch.flat_unit = payload.flatUnit;
      patch.house_no = payload.flatUnit;
    }
    if (rawData.buildingName !== undefined || rawData.building_name !== undefined || rawData.landmark !== undefined) {
      patch.building_name = payload.buildingName;
      patch.landmark = payload.buildingName;
    }
    if (rawData.streetAddress !== undefined || rawData.street_address !== undefined || rawData.street !== undefined) {
      patch.street_address = payload.streetAddress;
      patch.street = payload.streetAddress;
    }
    if (rawData.locality !== undefined) patch.locality = payload.locality;
    if (rawData.label !== undefined) patch.label = payload.label;
    if (rawData.city !== undefined) patch.city = payload.city;
    if (rawData.district !== undefined) patch.district = payload.district;
    if (rawData.state !== undefined) patch.state = payload.state;
    if (rawData.pincode !== undefined) patch.pincode = payload.pincode;
    if (rawData.societyId !== undefined || rawData.society_id !== undefined) patch.society_id = payload.societyId;
    if (rawData.latitude !== undefined) patch.latitude = payload.latitude;
    if (rawData.longitude !== undefined) patch.longitude = payload.longitude;

    if (rawData.fullAddress !== undefined || rawData.full_address !== undefined) {
      patch.full_address = payload.fullAddress;
    } else {
      const flat = patch.flat_unit ?? address.flat_unit ?? address.house_no;
      const bldg = patch.building_name ?? address.building_name ?? address.landmark;
      const str = patch.street_address ?? address.street_address ?? address.street;
      const loc = patch.locality ?? address.locality;
      const ct = patch.city ?? address.city;
      const dst = patch.district ?? address.district;
      const st = patch.state ?? address.state;
      const pin = patch.pincode ?? address.pincode;
      patch.full_address = [flat, bldg, str, loc, ct, dst, st, pin].filter(Boolean).join(', ');
    }

    if (payload.requestedDefault === true) {
      await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
      patch.is_default = true;
    } else if (payload.requestedDefault === false && address.is_default) {
      const replacement = await UserAddress.findOne({
        where: { ...activeWhere, id: { [Op.ne]: address.id } },
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      patch.is_default = replacement ? false : true;
      if (replacement) {
        await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
        await replacement.update({ is_default: true, updated_by: userId }, { transaction: t });
      }
    }

    patch.updated_by = userId;
    await address.update(patch, { transaction: t });
    await t.commit();

    const result = await UserAddress.findByPk(address.id, {
      include: [
        {
          model: SocietyProfile,
          as: 'society',
          attributes: ['id', 'society_name', 'address'],
          required: false,
        },
      ],
    });

    return { data: serializeAddress(result) };
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }
};

/**
 * Set target address as default
 */
export const setDefaultAddress = async (userId, addressId) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return { error: 'Active user not found.', status: 404 };
    }

    const activeWhere = activeAddressWhere(userId);
    const address = await UserAddress.findOne({
      where: { id: addressId, ...activeWhere },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!address) {
      await t.rollback();
      return { error: 'Address not found or does not belong to you.', status: 404 };
    }

    await UserAddress.update({ is_default: false }, { where: activeWhere, transaction: t });
    await address.update({ is_default: true, updated_by: userId }, { transaction: t });

    await t.commit();

    const result = await UserAddress.findByPk(address.id, {
      include: [
        {
          model: SocietyProfile,
          as: 'society',
          attributes: ['id', 'society_name', 'address'],
          required: false,
        },
      ],
    });

    return { data: serializeAddress(result) };
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }
};

/**
 * Soft-delete address and promote replacement if deleting current default
 */
export const deleteAddress = async (userId, addressId) => {
  const t = await sequelize.transaction();
  try {
    const owner = await User.findOne({
      where: { userId, is_deleted: false, status: 'active' },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!owner) {
      await t.rollback();
      return { error: 'Active user not found.', status: 404 };
    }

    const activeWhere = activeAddressWhere(userId);
    const address = await UserAddress.findOne({
      where: { id: addressId, ...activeWhere },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!address) {
      await t.rollback();
      return { error: 'Address not found or does not belong to you.', status: 404 };
    }

    const wasDefault = address.is_default;
    await address.update({
      is_deleted: true,
      is_active: false,
      is_default: false,
      updated_by: userId,
    }, { transaction: t });

    if (wasDefault) {
      const replacement = await UserAddress.findOne({
        where: activeWhere,
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (replacement) {
        await replacement.update({ is_default: true, updated_by: userId }, { transaction: t });
      }
    }

    await t.commit();
    return { data: true };
  } catch (error) {
    if (!t.finished) await t.rollback();
    throw error;
  }
};

export default {
  activeAddressWhere,
  shouldMakeAddressDefault,
  serializeAddress,
  getAddresses,
  getAddressById,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
};

