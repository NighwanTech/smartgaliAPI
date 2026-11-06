import { Op } from 'sequelize';
import { Country, State, District, City, Locality, Pincode } from './location_master.models.js';
import {
  getOrSetCache,
  LocationCacheKeys,
  TTL_LOCATION_MASTER_SECONDS,
} from './location_cache.service.js';

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
    const cacheKey = country_id ? `smartgali:v1:loc:states:c_${country_id}` : LocationCacheKeys.states();

    const states = await getOrSetCache(cacheKey, TTL_LOCATION_MASTER_SECONDS, async () => {
      const where = { is_active: true, is_deleted: false };
      if (country_id) where.country_id = country_id;

      return await State.findAll({
        where,
        order: [['display_order', 'ASC'], ['name', 'ASC']],
      });
    });

    res.json({ success: true, data: states });
  } catch (err) {
    next(err);
  }
};

export const getDistricts = async (req, res, next) => {
  try {
    const { state_id, search } = req.query;
    const isSearch = search && search.trim();
    const cacheKey = !isSearch
      ? LocationCacheKeys.districts(state_id)
      : `smartgali:v1:loc:districts:${state_id || 'all'}:q_${encodeURIComponent(search.trim().toLowerCase())}`;

    const districts = await getOrSetCache(cacheKey, isSearch ? 300 : TTL_LOCATION_MASTER_SECONDS, async () => {
      const where = { is_active: true, is_deleted: false };
      if (state_id) where.state_id = state_id;

      if (isSearch) {
        const q = `%${search.trim()}%`;
        where[Op.or] = [
          { district_name_english: { [Op.like]: q } },
          { district_name_local: { [Op.like]: q } },
          { code: { [Op.like]: q } },
          { lgd_district_code: { [Op.like]: q } },
        ];
      }

      return await District.findAll({
        where,
        include: [
          { model: State, as: 'state', attributes: ['id', 'name', 'code'] },
        ],
        order: [['display_order', 'ASC'], ['district_name_english', 'ASC']],
      });
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
    const { state_id, district_id, search } = req.query;
    const isSearch = search && search.trim();
    const cacheKey = !isSearch
      ? LocationCacheKeys.cities(district_id, state_id)
      : `smartgali:v1:loc:cities:${district_id || 'all'}:${state_id || 'all'}:q_${encodeURIComponent(search.trim().toLowerCase())}`;

    const cities = await getOrSetCache(cacheKey, isSearch ? 300 : TTL_LOCATION_MASTER_SECONDS, async () => {
      const where = { is_active: true, is_deleted: false };
      if (state_id) where.state_id = Number(state_id);
      if (district_id) where.district_id = Number(district_id);

      if (isSearch) {
        const q = `%${search.trim()}%`;
        where[Op.or] = [
          { name: { [Op.like]: q } },
          { city_name_local: { [Op.like]: q } },
          { code: { [Op.like]: q } },
          { lgd_local_body_code: { [Op.like]: q } },
        ];
      }

      return await City.findAll({
        where,
        include: [
          { model: State, as: 'state', attributes: ['id', 'name', 'code'], required: false },
          { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'], required: false },
        ],
        order: [['display_order', 'ASC'], ['name', 'ASC']],
      });
    });

    res.json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
};

export const getLocalities = async (req, res, next) => {
  try {
    const { city_id, district_id, state_id, search } = req.query;
    const isSearch = search && search.trim();
    const cacheKey = !isSearch
      ? LocationCacheKeys.localities(city_id, district_id)
      : `smartgali:v1:loc:localities:${city_id || 'all'}:${district_id || 'all'}:q_${encodeURIComponent(search.trim().toLowerCase())}`;

    const localities = await getOrSetCache(cacheKey, isSearch ? 300 : TTL_LOCATION_MASTER_SECONDS, async () => {
      const where = { is_active: true, is_deleted: false };
      if (city_id) where.city_id = Number(city_id);

      if (isSearch) {
        const q = `%${search.trim()}%`;
        where[Op.or] = [
          { name: { [Op.like]: q } },
          { locality_name_local: { [Op.like]: q } },
          { code: { [Op.like]: q } },
        ];
      }

      const cityWhere = { is_deleted: false };
      if (district_id) cityWhere.district_id = Number(district_id);
      if (state_id) cityWhere.state_id = Number(state_id);

      return await Locality.findAll({
        where,
        include: [
          {
            model: City,
            as: 'city',
            where: Object.keys(cityWhere).length > 1 ? cityWhere : undefined,
            attributes: ['id', 'name', 'code', 'district_id', 'state_id'],
            required: Object.keys(cityWhere).length > 1,
          },
          {
            model: Pincode,
            as: 'pincodes',
            attributes: ['id', 'pincode', 'area_name'],
            through: { attributes: ['is_primary'] },
            required: false,
          },
        ],
        order: [['display_order', 'ASC'], ['name', 'ASC']],
      });
    });

    res.json({ success: true, data: localities });
  } catch (err) {
    next(err);
  }
};

export const getPincodes = async (req, res, next) => {
  try {
    const { city_id, locality_id, district_id, state_id, pincode, search } = req.query;
    const searchTerm = search || (!pincode && req.query.q ? req.query.q : null);
    const isFiltered = searchTerm || pincode || locality_id;
    const cacheKey = !isFiltered
      ? LocationCacheKeys.pincodes(city_id, locality_id)
      : `smartgali:v1:loc:pincodes:${city_id || 'all'}:${locality_id || 'all'}:${pincode || 'all'}:q_${encodeURIComponent(searchTerm ? searchTerm.trim().toLowerCase() : '')}`;

    const pincodes = await getOrSetCache(cacheKey, isFiltered ? 300 : TTL_LOCATION_MASTER_SECONDS, async () => {
      const where = { is_active: true, is_deleted: false };
      if (city_id) where.city_id = Number(city_id);
      if (district_id) where.district_id = Number(district_id);
      if (state_id) where.state_id = Number(state_id);
      if (pincode) where.pincode = String(pincode).trim();

      if (searchTerm && searchTerm.trim()) {
        const q = `%${searchTerm.trim()}%`;
        where[Op.or] = [
          { pincode: { [Op.like]: q } },
          { area_name: { [Op.like]: q } },
        ];
      }

      return await Pincode.findAll({
        where,
        include: [
          {
            model: City,
            as: 'city',
            attributes: ['id', 'name', 'code', 'district_id', 'state_id'],
            required: false,
          },
          {
            model: Locality,
            as: 'localities',
            attributes: ['id', 'name'],
            through: { attributes: ['is_primary'] },
            where: locality_id ? { id: Number(locality_id) } : undefined,
            required: locality_id ? true : false,
          },
        ],
        order: [['display_order', 'ASC'], ['pincode', 'ASC']],
      });
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
        { model: State, as: 'state', attributes: ['id', 'name', 'code'], required: false },
        { model: District, as: 'district', attributes: ['id', 'district_name_english', 'code'], required: false },
        { model: Locality, as: 'localities', where: { is_active: true, is_deleted: false }, required: false },
        { model: Pincode, as: 'pincodes', where: { is_active: true, is_deleted: false }, required: false },
      ],
      order: [
        ['display_order', 'ASC'],
        ['name', 'ASC'],
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
