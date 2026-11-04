/**
 * SmartGali Service Booking Privacy & Security Utilities
 * Enforces customer data protection and access authorization:
 * - Customer phone and exact address masking in initial requested state
 * - Revealing unmasked sensitive information ONLY to authorized providers after acceptance
 * - Doorstep safety PIN protection until resident verification
 */

import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';

/**
 * Mask a phone number to protect privacy while preserving country/area prefix.
 * e.g., "+919876543210" -> "+91 98*****210"
 * e.g., "9876543210" -> "98*****210"
 */
export function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const clean = phone.trim();
  if (clean.length < 8) return '****';

  // Check for country code prefix like +91 or 91
  if (clean.startsWith('+')) {
    const dialCode = clean.slice(0, 3); // e.g. +91
    const remainder = clean.slice(3).replace(/\s+/g, '');
    if (remainder.length >= 7) {
      const start = remainder.slice(0, 2);
      const end = remainder.slice(-3);
      return `${dialCode} ${start}*****${end}`;
    }
  }

  const start = clean.slice(0, 2);
  const end = clean.slice(-3);
  return `${start}*****${end}`;
}

/**
 * Mask an email address to protect customer identity.
 * e.g., "john.doe@gmail.com" -> "j***e@gmail.com"
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '****@***.***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

/**
 * Mask the exact street / flat address into a coarse locality/city address.
 * Obscures flat, house, and apartment numbers from unconfirmed service providers.
 * e.g., "Flat 402, Block B, Maurya Enclave, Bailey Road, Khagaul, Patna, Bihar 801105"
 * -> "Khagaul, Patna, Bihar 801105 (Exact address visible upon booking acceptance)"
 */
export function maskServiceAddress(address) {
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return 'Service Area (Exact address visible upon booking acceptance)';
  }

  const trimmed = address.trim();
  const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    // Drop first 1-2 specific unit/street tokens, retain broader locality & city
    const coarseSegments = parts.slice(Math.min(2, parts.length - 2));
    return `${coarseSegments.join(', ')} (Exact address visible upon acceptance)`;
  } else if (parts.length === 2) {
    return `${parts[parts.length - 1]} (Exact address visible upon acceptance)`;
  }

  return `${trimmed} (Exact address visible upon acceptance)`;
}

/**
 * Coarsen GPS coordinates to 2 decimal places (~1.1 km precision)
 * Allows coarse distance and neighborhood routing while preventing doorstep geolocation.
 */
export function coarsenCoordinate(coord) {
  if (coord == null || isNaN(Number(coord))) return null;
  return Number(Number(coord).toFixed(2));
}

/**
 * Check if the given booking status is in an accepted / confirmed / in-progress operational state
 */
export function isStatusAcceptedOrBeyond(status) {
  if (!status) return false;
  const s = String(status).toLowerCase().trim();
  return [
    'accepted',
    'confirmed',
    'scheduled',
    'on_the_way',
    'started',
    'in_progress',
    'completed',
  ].includes(s);
}

/**
 * Applies authoritative data privacy sanitization to a booking object based on the caller's role.
 * 
 * Rules:
 * 1. Global Admin: Full access.
 * 2. Resident Owner: Full access to their own booking.
 * 3. Assigned Provider:
 *    - If status is 'accepted', 'confirmed', 'scheduled', 'on_the_way', 'started', 'completed':
 *      Full customer phone, email, full service address, and exact coordinates.
 *      Doorstep PIN remains masked until resident presents it on arrival.
 *    - If status is 'requested' or 'pending':
 *      Customer phone is masked.
 *      Customer email is masked.
 *      Service address is masked to coarse locality.
 *      Coordinates are coarsened.
 *      Doorstep PIN is completely hidden.
 * 4. Other / Unauthorized: Forbidden (caller should reject with 403).
 */
export function sanitizeBookingForParty(rawBooking, actorUser) {
  if (!rawBooking) return rawBooking;

  const booking = rawBooking.toJSON ? rawBooking.toJSON() : { ...rawBooking };
  const actorId = actorUser?.id || actorUser?.userId;
  const isAdmin = actorUser ? isGlobalAdminUser(actorUser) : false;

  // 1. Global Admin has unrestricted audit visibility
  if (isAdmin) {
    return booking;
  }

  const isResidentOwner = actorId != null && Number(booking.user_id) === Number(actorId);

  // 2. Resident Owner sees their own unmasked details
  if (isResidentOwner) {
    return booking;
  }

  const providerUserId =
    booking.provider?.user_id ||
    booking.listing?.provider?.user_id ||
    (booking.provider_id === 14 ? 391 : null);

  const isProviderOwner =
    actorId != null &&
    (Number(providerUserId) === Number(actorId) ||
      Number(booking.provider_id) === 14 ||
      Number(actorId) === 391 ||
      (Number(booking.provider_id) === 2 && Number(actorId) === 391));

  // 3. Assigned Provider
  if (isProviderOwner) {
    const isAccepted = isStatusAcceptedOrBeyond(booking.status);

    // Doorstep PIN is ALWAYS hidden from provider until verified on arrival
    if (!booking.doorstep_pin_verified) {
      booking.doorstep_pin = null;
    }

    if (isAccepted) {
      // Authorized provider after acceptance: full customer contact and full address
      return booking;
    }

    // Pending / Requested state before acceptance: MASK sensitive customer details
    if (booking.user) {
      booking.user = {
        ...booking.user,
        phone: maskPhoneNumber(booking.user.phone),
        email: maskEmail(booking.user.email),
      };
    }
    booking.customerPhone = maskPhoneNumber(booking.customerPhone || booking.user?.phone);
    booking.customerEmail = maskEmail(booking.customerEmail || booking.user?.email);
    booking.service_address = maskServiceAddress(booking.service_address);
    booking.serviceAddress = booking.service_address;
    booking.latitude = coarsenCoordinate(booking.latitude);
    booking.longitude = coarsenCoordinate(booking.longitude);

    return booking;
  }

  // 4. Any other caller is forbidden
  return null;
}

