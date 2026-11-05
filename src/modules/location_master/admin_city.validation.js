import Joi from 'joi';

export const createCitySchema = Joi.object({
  state_id: Joi.number().integer().positive().required().messages({
    'any.required': 'state_id is required',
    'number.base': 'state_id must be a valid positive integer',
  }),
  district_id: Joi.number().integer().positive().allow(null).optional(),
  name: Joi.string().trim().min(2).max(100).required().messages({
    'any.required': 'City name (English) is required',
    'string.empty': 'City name cannot be empty',
  }),
  city_name_english: Joi.string().trim().min(2).max(100).optional(),
  city_name_local: Joi.string().trim().max(150).allow(null, '').optional(),
  code: Joi.string().trim().max(50).allow(null, '').optional(),
  lgd_local_body_code: Joi.string().trim().max(50).allow(null, '').optional(),
  city_type: Joi.string().trim().max(50).default('MUNICIPAL_CORPORATION'),
  source_system: Joi.string().trim().max(50).default('MANUAL'),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
});

export const updateCitySchema = Joi.object({
  state_id: Joi.number().integer().positive().optional(),
  district_id: Joi.number().integer().positive().allow(null).optional(),
  name: Joi.string().trim().min(2).max(100).optional(),
  city_name_english: Joi.string().trim().min(2).max(100).optional(),
  city_name_local: Joi.string().trim().max(150).allow(null, '').optional(),
  code: Joi.string().trim().max(50).allow(null, '').optional(),
  lgd_local_body_code: Joi.string().trim().max(50).allow(null, '').optional(),
  city_type: Joi.string().trim().max(50).optional(),
  source_system: Joi.string().trim().max(50).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
}).min(1);

export const toggleCityStatusSchema = Joi.object({
  is_active: Joi.boolean().required().messages({
    'any.required': 'is_active is required (true or false)',
  }),
});

