import Joi from 'joi';

export const createLocalitySchema = Joi.object({
  city_id: Joi.number().integer().positive().required().messages({
    'any.required': 'city_id is required',
    'number.base': 'city_id must be a valid positive integer',
  }),
  name: Joi.string().trim().min(2).max(150).required().messages({
    'any.required': 'Locality name (English) is required',
    'string.empty': 'Locality name cannot be empty',
  }),
  locality_name_english: Joi.string().trim().min(2).max(150).optional(),
  locality_name_local: Joi.string().trim().max(150).allow(null, '').optional(),
  code: Joi.string().trim().max(50).allow(null, '').optional(),
  locality_type: Joi.string().trim().max(50).default('URBAN_AREA'),
  source_system: Joi.string().trim().max(50).default('MANUAL'),
  source_reference_code: Joi.string().trim().max(50).allow(null, '').optional(),
  display_order: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
  pincode_ids: Joi.array().items(Joi.number().integer().positive()).optional(),
});

export const updateLocalitySchema = Joi.object({
  city_id: Joi.number().integer().positive().optional(),
  name: Joi.string().trim().min(2).max(150).optional(),
  locality_name_english: Joi.string().trim().min(2).max(150).optional(),
  locality_name_local: Joi.string().trim().max(150).allow(null, '').optional(),
  code: Joi.string().trim().max(50).allow(null, '').optional(),
  locality_type: Joi.string().trim().max(50).optional(),
  source_system: Joi.string().trim().max(50).optional(),
  source_reference_code: Joi.string().trim().max(50).allow(null, '').optional(),
  display_order: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional(),
  remark: Joi.string().trim().max(1000).allow(null, '').optional(),
  pincode_ids: Joi.array().items(Joi.number().integer().positive()).optional(),
}).min(1);

export const toggleLocalityStatusSchema = Joi.object({
  is_active: Joi.boolean().required().messages({
    'any.required': 'is_active is required (true or false)',
  }),
});

