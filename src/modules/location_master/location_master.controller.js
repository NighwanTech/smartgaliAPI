import { Op } from 'sequelize';
import { Country, State, District, City, Locality, Pincode } from './location_master.models.js';

export const getCountries = async (req, res, next) => {
  try {
    const countries = await Country.findAll({
      where: { is_active: true, is_deleted: false },
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: countries });
  } catch (err) {
    next(err);
  }
};

export const getStates = async (req, res, next) => {
  try {
    const { country_id } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (country_id) where.country_id = country_id;

    const states = await State.findAll({
      where,
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: states });
  } catch (err) {
    next(err);
  }
};

export const getDistricts = async (req, res, next) => {
  try {
    const { state_id, search } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (state_id) where.state_id = state_id;

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { district_name_english: { [Op.like]: q } },
        { district_name_local: { [Op.like]: q } },
        { code: { [Op.like]: q } },
        { lgd_district_code: { [Op.like]: q } },
      ];
    }

    const districts = await District.findAll({
      where,
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
      ],
      order: [['display_order', 'ASC'], ['district_name_english', 'ASC']],
    });
    res.json({ success: true, data: districts });
  } catch (err) {
    next(err);
  }
};

export const getDistrictById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const district = await District.findOne({
      where: { id, is_deleted: false },
      include: [
        { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
      ],
    });
    if (!district) {
      return res.status(404).json({ success: false, message: 'District not found.' });
    }
    res.json({ success: true, data: district });
  } catch (err) {
    next(err);
  }
};

export const getCities = async (req, res, next) => {
  try {
    const { state_id, district_id } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (state_id) where.state_id = state_id;
    if (district_id) where.district_id = district_id;

    const cities = await City.findAll({
      where,
      include: [
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'], required: false },
      ],
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
};

export const getLocalities = async (req, res, next) => {
  try {
    const { city_id, search } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (city_id) where.city_id = city_id;

    const localities = await Locality.findAll({
      where,
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    res.json({ success: true, data: localities });
  } catch (err) {
    next(err);
  }
};

export const getPincodes = async (req, res, next) => {
  try {
    const { city_id, locality_id } = req.query;
    const where = { is_active: true, is_deleted: false };
    if (city_id) where.city_id = city_id;
    if (locality_id) where.locality_id = locality_id;

    const pincodes = await Pincode.findAll({
      where,
      order: [['display_order', 'ASC'], ['pincode', 'ASC']],
    });
    res.json({ success: true, data: pincodes });
  } catch (err) {
    next(err);
  }
};

export const getLocationHierarchy = async (req, res, next) => {
  try {
    const cities = await City.findAll({
      where: { is_active: true, is_deleted: false },
      include: [
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'], required: false },
        { model: Locality, as: 'localities', where: { is_active: true, is_deleted: false }, required: false },
        { model: Pincode, as: 'pincodes', where: { is_active: true, is_deleted: false }, required: false },
      ],
      order: [
        ['display_order', 'ASC'],
        [{ model: Locality, as: 'localities' }, 'display_order', 'ASC'],
        [{ model: Pincode, as: 'pincodes' }, 'display_order', 'ASC'],
      ],
    });
    res.json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
};

export default {
  getCountries,
  getStates,
  getDistricts,
  getDistrictById,
  getCities,
  getLocalities,
  getPincodes,
  getLocationHierarchy,
};
