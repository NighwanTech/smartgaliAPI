import Joi from 'joi';

export const createDistrictSchema = Joi.object({
  state_id: Joi.number().integer().positive().required().messages({
    'any.required': 'state_id is required',
    'number.base': 'state_id must be a valid positive integer',
  }),
  district_name_english: Joi.string().trim().min(2).max(150).required().messages({
    'any.required': 'district_name_english is required',
    'string.empty': 'district_name_english cannot be empty',
  }),
  district_name_local: Joi.string().trim().max(150).allow(null, '').optional(),
  lgd_district_code: Joi.string().trim().max(50).allow(null, '').optional(),
  district_census2011_code: Joi.string().trim().max(50).allow(null, '').optional(),
  code: Joi.string().trim().max(50).allow(null, '').optional(),
  source_system: Joi.string().trim().max(50).default('MANUAL'),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
});

export const updateDistrictSchema = Joi.object({
  state_id: Joi.number().integer().positive().optional(),
  district_name_english: Joi.string().trim().min(2).max(150).optional(),
  district_name_local: Joi.string().trim().max(150).allow(null, '').optional(),
  lgd_district_code: Joi.string().trim().max(50).allow(null, '').optional(),
  district_census2011_code: Joi.string().trim().max(50).allow(null, '').optional(),
  code: Joi.string().trim().max(50).allow(null, '').optional(),
  source_system: Joi.string().trim().max(50).optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
}).min(1);

export const toggleDistrictStatusSchema = Joi.object({
  is_active: Joi.boolean().required().messages({
    'any.required': 'is_active is required (true or false)',
  }),
});

