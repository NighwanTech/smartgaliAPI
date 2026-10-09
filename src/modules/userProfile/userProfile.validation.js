import Joi from 'joi';
import { errorResponse } from '../../utils/response.js';

// ─────────────────────────────────────────────
// Schema: Send OTP
// Accepts: phoneNumber and email
// ─────────────────────────────────────────────
export const normalizeMobile = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
};

export const sendOtpSchema = Joi.object({
  phoneNumber: Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      const normalized = normalizeMobile(value);
      return /^[6-9]\d{9}$/.test(normalized) ? normalized : helpers.error('string.mobile');
    })
    .messages({
      'any.required': 'phoneNumber is required.',
      'string.empty': 'phoneNumber cannot be empty.',
      'string.mobile': 'phoneNumber must be a valid 10-digit Indian mobile number (e.g. 9876543210 or +919876543210).',
    }),
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': 'email must be a valid email address.',
    'any.required': 'email is required.',
    'string.empty': 'email cannot be empty.',
  }),
});

// ─────────────────────────────────────────────
// Schema: Verify OTP
// ─────────────────────────────────────────────
export const verifyOtpSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    'string.email': 'email must be a valid email address.',
    'any.required': 'email is required.',
    'string.empty': 'email cannot be empty.',
  }),
  otp: Joi.string()
    .length(6)
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.length': 'otp must be exactly 6 digits.',
      'string.pattern.base': 'otp must contain only digits.',
      'any.required': 'otp is required.',
      'string.empty': 'otp cannot be empty.',
    }),
});

// ─────────────────────────────────────────────
// Middleware Factory
// Usage: validate(sendOtpSchema)
// ─────────────────────────────────────────────
export const validate = (schema) => (req, res, next) => {
  const { value, error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const details = error.details.map((d) => d.message);
    return errorResponse(res, 422, 'Validation failed', details);
  }
  req.body = value;
  next();
};
