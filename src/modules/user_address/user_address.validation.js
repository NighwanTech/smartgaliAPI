import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

export const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((d) => d.message);
    return errorResponse(res, 422, 'Validation failed', details);
  }
  req.body = value;
  next();
};

export const createAddressSchema = Joi.object({
  addressType: Joi.string().trim().valid('HOME', 'OFFICE', 'OTHER', 'Home', 'Office', 'Other'),
  address_type: Joi.string().trim().valid('HOME', 'OFFICE', 'OTHER', 'Home', 'Office', 'Other'),
  label: Joi.string().trim().max(100).allow('', null),
  flatUnit: Joi.string().trim().max(100).allow('', null),
  flat_unit: Joi.string().trim().max(100).allow('', null),
  houseNo: Joi.string().trim().max(100).allow('', null),
  house_no: Joi.string().trim().max(100).allow('', null),
  buildingName: Joi.string().trim().max(200).allow('', null),
  building_name: Joi.string().trim().max(200).allow('', null),
  landmark: Joi.string().trim().max(200).allow('', null),
  streetAddress: Joi.string().trim().max(500).allow('', null),
  street_address: Joi.string().trim().max(500).allow('', null),
  street: Joi.string().trim().max(200).allow('', null),
  locality: Joi.string().trim().max(150).allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  district: Joi.string().trim().max(100).allow('', null),
  state: Joi.string().trim().max(100).allow('', null),
  pincode: Joi.string().trim().pattern(/^[1-9][0-9]{5}$/).message('PIN code must be a valid 6-digit Indian PIN code').allow('', null),
  societyId: Joi.number().integer().positive().allow(null),
  society_id: Joi.number().integer().positive().allow(null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isDefault: Joi.boolean(),
  is_default: Joi.boolean(),
  fullAddress: Joi.string().trim().max(500).allow('', null),
  full_address: Joi.string().trim().max(500).allow('', null),
});

export const updateAddressSchema = Joi.object({
  addressType: Joi.string().trim().valid('HOME', 'OFFICE', 'OTHER', 'Home', 'Office', 'Other'),
  address_type: Joi.string().trim().valid('HOME', 'OFFICE', 'OTHER', 'Home', 'Office', 'Other'),
  label: Joi.string().trim().max(100).allow('', null),
  flatUnit: Joi.string().trim().max(100).allow('', null),
  flat_unit: Joi.string().trim().max(100).allow('', null),
  houseNo: Joi.string().trim().max(100).allow('', null),
  house_no: Joi.string().trim().max(100).allow('', null),
  buildingName: Joi.string().trim().max(200).allow('', null),
  building_name: Joi.string().trim().max(200).allow('', null),
  landmark: Joi.string().trim().max(200).allow('', null),
  streetAddress: Joi.string().trim().max(500).allow('', null),
  street_address: Joi.string().trim().max(500).allow('', null),
  street: Joi.string().trim().max(200).allow('', null),
  locality: Joi.string().trim().max(150).allow('', null),
  city: Joi.string().trim().max(120).allow('', null),
  district: Joi.string().trim().max(100).allow('', null),
  state: Joi.string().trim().max(100).allow('', null),
  pincode: Joi.string().trim().pattern(/^[1-9][0-9]{5}$/).message('PIN code must be a valid 6-digit Indian PIN code').allow('', null),
  societyId: Joi.number().integer().positive().allow(null),
  society_id: Joi.number().integer().positive().allow(null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isDefault: Joi.boolean(),
  is_default: Joi.boolean(),
  fullAddress: Joi.string().trim().max(500).allow('', null),
  full_address: Joi.string().trim().max(500).allow('', null),
}).min(1);

