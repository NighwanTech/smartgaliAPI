import Joi from 'joi';

const PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export const createPincodeSchema = Joi.object({
  city_id: Joi.number().integer().positive().required().messages({
    'any.required': 'city_id is required',
    'number.base': 'city_id must be a valid positive integer',
  }),
  state_id: Joi.number().integer().positive().allow(null).optional(),
  district_id: Joi.number().integer().positive().allow(null).optional(),
  locality_id: Joi.number().integer().positive().allow(null).optional(),
  pincode: Joi.string().pattern(PINCODE_REGEX).required().messages({
    'any.required': 'pincode is required',
    'string.pattern.base': 'pincode must be exactly 6 digits without starting with 0',
  }),
  area_name: Joi.string().trim().max(150).allow(null, '').optional(),
  source_system: Joi.string().trim().max(50).default('MANUAL'),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
  locality_ids: Joi.array().items(Joi.number().integer().positive()).optional(),
});

export const updatePincodeSchema = Joi.object({
  city_id: Joi.number().integer().positive().optional(),
  state_id: Joi.number().integer().positive().allow(null).optional(),
  district_id: Joi.number().integer().positive().allow(null).optional(),
  locality_id: Joi.number().integer().positive().allow(null).optional(),
  pincode: Joi.string().pattern(PINCODE_REGEX).optional().messages({
    'string.pattern.base': 'pincode must be exactly 6 digits without starting with 0',
  }),
  area_name: Joi.string().trim().max(150).allow(null, '').optional(),
  source_system: Joi.string().trim().max(50).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
  locality_ids: Joi.array().items(Joi.number().integer().positive()).optional(),
}).min(1);

export const togglePincodeStatusSchema = Joi.object({
  is_active: Joi.boolean().required().messages({
    'any.required': 'is_active is required (true or false)',
  }),
});

export const linkLocalityPincodeSchema = Joi.object({
  locality_id: Joi.number().integer().positive().required(),
  is_primary: Joi.boolean().default(true),
});

