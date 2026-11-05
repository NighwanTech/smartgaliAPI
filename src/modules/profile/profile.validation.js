import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

// Reusable middleware factory
export const validate = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((d) => d.message);
    return errorResponse(res, 422, 'Validation failed', details);
  }
  next();
};

export const updateProfileSchema = Joi.object({
  fullName: Joi.string().trim().min(2).max(120),
  email: Joi.string().email(),
  bio: Joi.string().trim().max(500).allow('', null),
  avatarUrl: Joi.string().uri().allow('', null),
  locationName: Joi.string().trim().max(255).allow('', null),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
}).min(1);

export const addressSchema = Joi.object({
  addressType: Joi.string().trim().valid('HOME', 'OFFICE', 'OTHER', 'Home', 'Office', 'Other'),
  address_type: Joi.string().trim().valid('HOME', 'OFFICE', 'OTHER', 'Home', 'Office', 'Other'),
  label: Joi.string().trim().max(100).allow('', null),
  flatUnit: Joi.string().trim().max(100).allow('', null),
  flat_unit: Joi.string().trim().max(100).allow('', null),
  houseNo: Joi.string().trim().max(120).allow('', null),
  house_no: Joi.string().trim().max(120).allow('', null),
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
  stateId: Joi.number().integer().positive().allow(null),
  state_id: Joi.number().integer().positive().allow(null),
  districtId: Joi.number().integer().positive().allow(null),
  district_id: Joi.number().integer().positive().allow(null),
  cityId: Joi.number().integer().positive().allow(null),
  city_id: Joi.number().integer().positive().allow(null),
  localityId: Joi.number().integer().positive().allow(null),
  locality_id: Joi.number().integer().positive().allow(null),
  pincodeId: Joi.number().integer().positive().allow(null),
  pincode_id: Joi.number().integer().positive().allow(null),
  fullAddress: Joi.string().trim().max(500).allow('', null),
  full_address: Joi.string().trim().max(500).allow('', null),
  latitude: Joi.number().min(-90).max(90).allow(null),
  longitude: Joi.number().min(-180).max(180).allow(null),
  isDefault: Joi.boolean(),
  is_default: Joi.boolean(),
}).min(1);

export const supportTicketSchema = Joi.object({
  category: Joi.string().trim().min(2).max(80).required(),
  description: Joi.string().trim().min(10).max(5000).required(),
});

export const dataExportRequestSchema = Joi.object({}).max(0);

export const notificationPreferencesSchema = Joi.object({
  pushNotifications: Joi.object({
    societyAnnouncements: Joi.boolean(),
    complaintUpdates: Joi.boolean(),
    visitorAlerts: Joi.boolean(),
    eventReminders: Joi.boolean(),
    communityChat: Joi.boolean(),
    promotionalOffers: Joi.boolean(),
  }),
  professionalAlerts: Joi.object({
    bookingRequests: Joi.boolean(),
    customerMessages: Joi.boolean(),
  }),
  emailNotifications: Joi.object({
    weeklyDigest: Joi.boolean(),
    invoicesReceipts: Joi.boolean(),
  }),
}).min(1);

export const privacySettingsSchema = Joi.object({
  profileVisibility: Joi.string().valid('public', 'members_only'),
  showActivityStatus: Joi.boolean(),
}).min(1);

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().allow('', null),
  newPassword: Joi.string()
    .min(8)
    .pattern(/[0-9]/, 'number')
    .pattern(/[^a-zA-Z0-9]/, 'special character')
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters.',
      'string.pattern.name': 'New password must include at least one {#name}.',
      'any.required': 'newPassword is required.',
    }),
});

export const deleteAccountSchema = Joi.object({
  password: Joi.string().allow('', null),
  reason: Joi.string().trim().max(255).allow('', null),
  confirm: Joi.boolean().valid(true).required().messages({
    'any.only': 'You must confirm the irreversible deletion.',
    'any.required': 'Confirmation is required.',
  }),
});
