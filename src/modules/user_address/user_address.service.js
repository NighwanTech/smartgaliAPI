import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import User from '../user/user.model.js';
import UserAddress from '../profile/user_address.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { State, District, City, Locality, Pincode, LocalityPincode } from '../location_master/location_master.models.js';

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

  const stateId = raw.state_id != null ? Number(raw.state_id) : (raw.stateId != null ? Number(raw.stateId) : null);
  const districtId = raw.district_id != null ? Number(raw.district_id) : (raw.districtId != null ? Number(raw.districtId) : null);
  const cityId = raw.city_id != null ? Number(raw.city_id) : (raw.cityId != null ? Number(raw.cityId) : null);
  const localityId = raw.locality_id != null ? Number(raw.locality_id) : (raw.localityId != null ? Number(raw.localityId) : null);
  const pincodeId = raw.pincode_id != null ? Number(raw.pincode_id) : (raw.pincodeId != null ? Number(raw.pincodeId) : null);

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
    stateId,
    state_id: stateId,
    districtId,
    district_id: districtId,
    cityId,
    city_id: cityId,
    localityId,
    locality_id: localityId,
    pincodeId,
    pincode_id: pincodeId,
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

  const rawStateId = data.stateId ?? data.state_id;
  const rawDistrictId = data.districtId ?? data.district_id;
  const rawCityId = data.cityId ?? data.city_id;
  const rawLocalityId = data.localityId ?? data.locality_id;
  const rawPincodeId = data.pincodeId ?? data.pincode_id;

  const stateId = rawStateId !== undefined && rawStateId !== null && rawStateId !== '' ? Number(rawStateId) : null;
  const districtId = rawDistrictId !== undefined && rawDistrictId !== null && rawDistrictId !== '' ? Number(rawDistrictId) : null;
  const cityId = rawCityId !== undefined && rawCityId !== null && rawCityId !== '' ? Number(rawCityId) : null;
  const localityId = rawLocalityId !== undefined && rawLocalityId !== null && rawLocalityId !== '' ? Number(rawLocalityId) : null;
  const pincodeId = rawPincodeId !== undefined && rawPincodeId !== null && rawPincodeId !== '' ? Number(rawPincodeId) : null;

  const societyId = data.societyId ?? data.society_id ?? null;
  const latitude = data.latitude !== undefined && data.latitude !== null && data.latitude !== '' ? Number(data.latitude) : null;
  const longitude = data.longitude !== undefined && data.longitude !== null && data.longitude !== '' ? Number(data.longitude) : null;
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
    stateId,
    districtId,
    cityId,
    localityId,
    pincodeId,
    societyId: societyId != null && societyId !== '' ? Number(societyId) : null,
    latitude,
    longitude,
    fullAddress,
    label,
    requestedDefault,
  };
};

/**
 * Authoritatively validates Location Master hierarchy against database records.
 * Ensures parent-child integrity across State -> District -> City -> Locality <-> Pincode.
 * Returns null if valid, or { error: string, status: number } if invalid.
 */
export const validateLocationHierarchy = async ({
  stateId,
  districtId,
  cityId,
  localityId,
  pincodeId,
  transaction,
} = {}) => {
  // If no location IDs provided, passes cleanly (backward compatibility for legacy free-text addresses)
  if (!stateId && !districtId && !cityId && !localityId && !pincodeId) {
    return null;
  }

  let stateRecord = null;
  let districtRecord = null;
  let cityRecord = null;
  let localityRecord = null;
  let pincodeRecord = null;

  // 1. Validate State
  if (stateId != null) {
    stateRecord = await State.findOne({
      where: { id: stateId, is_active: true, is_deleted: false },
      transaction,
    });
    if (!stateRecord) {
      return {
        error: `Invalid location reference: State ID ${stateId} does not exist or is inactive.`,
        status: 422,
      };
    }
  }

  // 2. Validate District & District -> State relationship
  if (districtId != null) {
    districtRecord = await District.findOne({
      where: { id: districtId, is_active: true, is_deleted: false },
      transaction,
    });
    if (!districtRecord) {
      return {
        error: `Invalid location reference: District ID ${districtId} does not exist or is inactive.`,
        status: 422,
      };
    }
    if (stateId != null && Number(districtRecord.state_id) !== Number(stateId)) {
      return {
        error: `Geographic hierarchy mismatch: District '${districtRecord.district_name_english || districtRecord.name}' (ID ${districtId}) does not belong to the selected State (ID ${stateId}).`,
        status: 422,
      };
    }
  }

  // 3. Validate City & City -> (District, State) relationship
  if (cityId != null) {
    cityRecord = await City.findOne({
      where: { id: cityId, is_active: true, is_deleted: false },
      transaction,
    });
    if (!cityRecord) {
      return {
        error: `Invalid location reference: City ID ${cityId} does not exist or is inactive.`,
        status: 422,
      };
    }
    if (stateId != null && Number(cityRecord.state_id) !== Number(stateId)) {
      return {
        error: `Geographic hierarchy mismatch: City '${cityRecord.name}' (ID ${cityId}) does not belong to the selected State (ID ${stateId}).`,
        status: 422,
      };
    }
    if (districtId != null && cityRecord.district_id != null && Number(cityRecord.district_id) !== Number(districtId)) {
      return {
        error: `Geographic hierarchy mismatch: City '${cityRecord.name}' (ID ${cityId}) does not belong to the selected District (ID ${districtId}).`,
        status: 422,
      };
    }
  }

  // 4. Validate Locality & Locality -> City relationship
  if (localityId != null) {
    localityRecord = await Locality.findOne({
      where: { id: localityId, is_active: true, is_deleted: false },
      transaction,
    });
    if (!localityRecord) {
      return {
        error: `Invalid location reference: Locality ID ${localityId} does not exist or is inactive.`,
        status: 422,
      };
    }
    if (cityId != null && Number(localityRecord.city_id) !== Number(cityId)) {
      return {
        error: `Geographic hierarchy mismatch: Locality '${localityRecord.name}' (ID ${localityId}) does not belong to the selected City (ID ${cityId}).`,
        status: 422,
      };
    }
  }

  // 5. Validate PIN Code & Pincode -> (City, Locality, District, State) relationship
  if (pincodeId != null) {
    pincodeRecord = await Pincode.findOne({
      where: { id: pincodeId, is_active: true, is_deleted: false },
      transaction,
    });
    if (!pincodeRecord) {
      return {
        error: `Invalid location reference: PIN Code ID ${pincodeId} does not exist or is inactive.`,
        status: 422,
      };
    }

    // City compatibility: pincode.city_id matches OR mapping exists
    if (cityId != null) {
      const directCityMatch = Number(pincodeRecord.city_id) === Number(cityId);
      if (!directCityMatch) {
        // Check junction table locality_pincodes for localities in this city
        const mappedToCityLocality = await LocalityPincode.findOne({
          where: { pincode_id: pincodeId },
          include: [{
            model: Locality,
            as: 'locality',
            where: { city_id: cityId, is_active: true, is_deleted: false },
            required: true,
          }],
          transaction,
        });
        if (!mappedToCityLocality) {
          return {
            error: `Geographic hierarchy mismatch: PIN Code '${pincodeRecord.pincode}' (ID ${pincodeId}) is not associated with City ID ${cityId}.`,
            status: 422,
          };
        }
      }
    }

    // Locality compatibility: pincode.locality_id matches OR mapped in LocalityPincode
    if (localityId != null) {
      const directLocMatch = pincodeRecord.locality_id != null && Number(pincodeRecord.locality_id) === Number(localityId);
      if (!directLocMatch) {
        const mappingExists = await LocalityPincode.findOne({
          where: { locality_id: localityId, pincode_id: pincodeId },
          transaction,
        });
        if (!mappingExists) {
          return {
            error: `Geographic hierarchy mismatch: PIN Code '${pincodeRecord.pincode}' (ID ${pincodeId}) is not mapped to Locality ID ${localityId}.`,
            status: 422,
          };
        }
      }
    }

    // District compatibility (if pincode has district_id)
    if (districtId != null && pincodeRecord.district_id != null && Number(pincodeRecord.district_id) !== Number(districtId)) {
      return {
        error: `Geographic hierarchy mismatch: PIN Code '${pincodeRecord.pincode}' (ID ${pincodeId}) does not belong to the selected District (ID ${districtId}).`,
        status: 422,
      };
    }

    // State compatibility (if pincode has state_id)
    if (stateId != null && pincodeRecord.state_id != null && Number(pincodeRecord.state_id) !== Number(stateId)) {
      return {
        error: `Geographic hierarchy mismatch: PIN Code '${pincodeRecord.pincode}' (ID ${pincodeId}) does not belong to the selected State (ID ${stateId}).`,
        status: 422,
      };
    }
  }

  return null;
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

    // Validate geographic hierarchy against Location Master database records
    const hierarchyError = await validateLocationHierarchy({
      stateId: payload.stateId,
      districtId: payload.districtId,
      cityId: payload.cityId,
      localityId: payload.localityId,
      pincodeId: payload.pincodeId,
      transaction: t,
    });
    if (hierarchyError) {
      await t.rollback();
      return hierarchyError;
    }

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
      state_id: payload.stateId,
      district_id: payload.districtId,
      city_id: payload.cityId,
      locality_id: payload.localityId,
      pincode_id: payload.pincodeId,
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

    // Compute effective location IDs: if omitted in rawData, preserve existing address values!
    const effectiveStateId = (rawData.stateId !== undefined || rawData.state_id !== undefined)
      ? payload.stateId
      : (address.state_id != null ? Number(address.state_id) : null);

    const effectiveDistrictId = (rawData.districtId !== undefined || rawData.district_id !== undefined)
      ? payload.districtId
      : (address.district_id != null ? Number(address.district_id) : null);

    const effectiveCityId = (rawData.cityId !== undefined || rawData.city_id !== undefined)
      ? payload.cityId
      : (address.city_id != null ? Number(address.city_id) : null);

    const effectiveLocalityId = (rawData.localityId !== undefined || rawData.locality_id !== undefined)
      ? payload.localityId
      : (address.locality_id != null ? Number(address.locality_id) : null);

    const effectivePincodeId = (rawData.pincodeId !== undefined || rawData.pincode_id !== undefined)
      ? payload.pincodeId
      : (address.pincode_id != null ? Number(address.pincode_id) : null);

    // If any location IDs were explicitly updated, validate the resulting effective hierarchy
    const anyLocationFieldUpdated =
      rawData.stateId !== undefined || rawData.state_id !== undefined ||
      rawData.districtId !== undefined || rawData.district_id !== undefined ||
      rawData.cityId !== undefined || rawData.city_id !== undefined ||
      rawData.localityId !== undefined || rawData.locality_id !== undefined ||
      rawData.pincodeId !== undefined || rawData.pincode_id !== undefined;

    if (anyLocationFieldUpdated) {
      const hierarchyError = await validateLocationHierarchy({
        stateId: effectiveStateId,
        districtId: effectiveDistrictId,
        cityId: effectiveCityId,
        localityId: effectiveLocalityId,
        pincodeId: effectivePincodeId,
        transaction: t,
      });
      if (hierarchyError) {
        await t.rollback();
        return hierarchyError;
      }
    }

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

    // Location IDs: only modify if explicitly passed in rawData!
    if (rawData.stateId !== undefined || rawData.state_id !== undefined) patch.state_id = payload.stateId;
    if (rawData.districtId !== undefined || rawData.district_id !== undefined) patch.district_id = payload.districtId;
    if (rawData.cityId !== undefined || rawData.city_id !== undefined) patch.city_id = payload.cityId;
    if (rawData.localityId !== undefined || rawData.locality_id !== undefined) patch.locality_id = payload.localityId;
    if (rawData.pincodeId !== undefined || rawData.pincode_id !== undefined) patch.pincode_id = payload.pincodeId;

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

