const fs = require('fs');

// 1. Update service_booking.service.js
const servicePath = 'C:/Users/pawan/Downloads/smartgaliapi-main/smartgaliapi-main/src/modules/service_booking/service_booking.service.js';
let serviceContent = fs.readFileSync(servicePath, 'utf8');

// Ensure import
if (!serviceContent.includes('booking_privacy.utils.js')) {
  serviceContent = serviceContent.replace(
    "import { logger } from '../../utils/logger.js';",
    "import { logger } from '../../utils/logger.js';\r\nimport {\r\n  maskPhoneNumber,\r\n  maskServiceAddress,\r\n  coarsenCoordinate,\r\n  sanitizeBookingForParty,\r\n} from './booking_privacy.utils.js';"
  );
}

// Replace socket payload in createBooking
const marker = 'const socketPayload = {';
if (serviceContent.includes(marker)) {
  const startIndex = serviceContent.indexOf('const socketPayload = {');
  // Find where the socket emission block ends (after the second io.to block)
  const endIndex = serviceContent.indexOf('}\r\n          }\r\n        }\r\n      } catch (notifErr)', startIndex);
  if (endIndex !== -1) {
    const replacement = `const isAutoAccept = booking.status === 'confirmed' || booking.status === 'accepted';

            // Provider payload: Sensitive customer phone & address masked in requested state
            const providerSocketPayload = {
              id: Number(booking.id),
              bookingId: Number(booking.id),
              bookingReference: booking.booking_reference,
              status: booking.status,
              listingId: Number(listing.id),
              serviceTitle: listing.title,
              scheduledAt: booking.scheduled_at,
              timeSlot: booking.time_slot,
              serviceAddress: isAutoAccept ? booking.service_address : maskServiceAddress(booking.service_address),
              amount: Number(booking.amount),
              customerName: actorUser?.userName || 'Resident Customer',
              customerPhone: isAutoAccept ? (actorUser?.phone || null) : maskPhoneNumber(actorUser?.phone),
              latitude: isAutoAccept ? booking.latitude : coarsenCoordinate(booking.latitude),
              longitude: isAutoAccept ? booking.longitude : coarsenCoordinate(booking.longitude),
              doorstepPin: null, // Never expose safety PIN in initial booking request
              notes: booking.notes,
              createdAt: booking.createdAt || new Date(),
            };

            // Resident payload: Resident always sees their own unmasked details & Doorstep PIN
            const residentSocketPayload = {
              id: Number(booking.id),
              bookingId: Number(booking.id),
              bookingReference: booking.booking_reference,
              status: booking.status,
              listingId: Number(listing.id),
              serviceTitle: listing.title,
              scheduledAt: booking.scheduled_at,
              timeSlot: booking.time_slot,
              serviceAddress: booking.service_address,
              amount: Number(booking.amount),
              customerName: actorUser?.userName || 'Resident Customer',
              customerPhone: actorUser?.phone || null,
              doorstepPin: booking.doorstep_pin,
              latitude: booking.latitude,
              longitude: booking.longitude,
              notes: booking.notes,
              createdAt: booking.createdAt || new Date(),
            };

            // Emit masked payload to both user:id and user_id rooms of provider
            io.to(\`user:\${providerUid}\`).emit('booking_request', providerSocketPayload);
            io.to(\`user_\${providerUid}\`).emit('booking_request', providerSocketPayload);
            io.to(\`user:\${providerUid}\`).emit('booking:request', providerSocketPayload);
            io.to(\`user_\${providerUid}\`).emit('booking:request', providerSocketPayload);
            io.to(\`user:\${providerUid}\`).emit('booking:new', providerSocketPayload);
            io.to(\`user_\${providerUid}\`).emit('booking:new', providerSocketPayload);

            // Emit unmasked payload to resident
            if (actorId && Number(actorId) !== Number(providerUid)) {
              io.to(\`user:\${actorId}\`).emit('booking_request', residentSocketPayload);
              io.to(\`user_\${actorId}\`).emit('booking_request', residentSocketPayload);
              io.to(\`user:\${actorId}\`).emit('booking:request', residentSocketPayload);
              io.to(\`user_\${actorId}\`).emit('booking:request', residentSocketPayload);
              io.to(\`user:\${actorId}\`).emit('booking:new', residentSocketPayload);
              io.to(\`user_\${actorId}\`).emit('booking:new', residentSocketPayload);
            }`;

    serviceContent = serviceContent.slice(0, startIndex) + replacement + serviceContent.slice(endIndex);
    console.log('Updated createBooking socket emission with privacy masking.');
  }
}

// Enhance statusPayload in transitionBooking
const statusMarker = 'const statusPayload = {\r\n            id: Number(booking.id),';
if (serviceContent.includes(statusMarker)) {
  const newStatusPayload = `const isAcceptedNow = nextStatus === 'accepted' || nextStatus === 'confirmed';
          const statusPayload = {
            id: Number(booking.id),
            bookingId: Number(booking.id),
            status: nextStatus,
            serviceTitle: listingTitle,
            ...(isAcceptedNow ? {
              customerName: booking.user?.userName || 'Resident Customer',
              customerPhone: booking.user?.phone || null,
              customerEmail: booking.user?.email || null,
              serviceAddress: booking.service_address,
              latitude: booking.latitude,
              longitude: booking.longitude,
            } : {}),`;
  serviceContent = serviceContent.replace(statusMarker, newStatusPayload);
  console.log('Updated transitionBooking statusPayload.');
}

fs.writeFileSync(servicePath, serviceContent, 'utf8');

// 2. Update service_booking.controller.js
const controllerPath = 'C:/Users/pawan/Downloads/smartgaliapi-main/smartgaliapi-main/src/modules/service_booking/service_booking.controller.js';
let controllerContent = fs.readFileSync(controllerPath, 'utf8');

if (!controllerContent.includes('booking_privacy.utils.js')) {
  controllerContent = "import { sanitizeBookingForParty } from './booking_privacy.utils.js';\r\n" + controllerContent;
}

// Replace getProviderRequests
const oldProvReq = `export const getProviderRequests = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const requests = await serviceBookingService.getProviderBookings(userId, { isRequestsOnly: true });
    return successResponse(res, 200, 'Provider booking requests fetched successfully', requests);
  } catch (error) {
    next(error);
  }
};`;

const newProvReq = `export const getProviderRequests = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const requests = await serviceBookingService.getProviderBookings(userId, { isRequestsOnly: true });
    const sanitized = requests.map(r => sanitizeBookingForParty(r, req.user)).filter(Boolean);
    return successResponse(res, 200, 'Provider booking requests fetched successfully', sanitized);
  } catch (error) {
    next(error);
  }
};`;

// Replace getProviderBookings
const oldProvBook = `export const getProviderBookings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const bookings = await serviceBookingService.getProviderBookings(userId, { statusFilter: req.query.status });
    return successResponse(res, 200, 'Provider bookings fetched successfully', bookings);
  } catch (error) {
    next(error);
  }
};`;

const newProvBook = `export const getProviderBookings = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    const bookings = await serviceBookingService.getProviderBookings(userId, { statusFilter: req.query.status });
    const sanitized = bookings.map(b => sanitizeBookingForParty(b, req.user)).filter(Boolean);
    return successResponse(res, 200, 'Provider bookings fetched successfully', sanitized);
  } catch (error) {
    next(error);
  }
};`;

// Replace getBookingById
const oldGetBooking = `export const getBookingById = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.getBookingById(req.params.id);
    if (!booking) {
      return errorResponse(res, 404, 'Service booking not found');
    }

    const userId = req.user?.id || req.user?.userId;
    const isAdmin = isGlobalAdminUser(req.user);
    const isResident = booking.user_id === userId;
    const isProvider = booking.provider?.user_id === userId || booking.listing?.provider?.user_id === userId;

    if (!isAdmin && !isResident && !isProvider) {
      return errorResponse(res, 403, 'Forbidden: You do not have permission to view this booking');
    }

    // Convert to JSON and apply Doorstep PIN privacy rule:
    // Only resident or admin can view the plaintext PIN before it is verified!
    const bookingJson = booking.toJSON ? booking.toJSON() : { ...booking };
    if (isProvider && !isAdmin && !bookingJson.doorstep_pin_verified) {
      bookingJson.doorstep_pin = null; // Do NOT leak doorstep PIN to provider before arrival verification!
    }

    return successResponse(res, 200, 'Service booking fetched successfully', bookingJson);
  } catch (error) {
    next(error);
  }
};`;

const newGetBooking = `export const getBookingById = async (req, res, next) => {
  try {
    const booking = await serviceBookingService.getBookingById(req.params.id);
    if (!booking) {
      return errorResponse(res, 404, 'Service booking not found');
    }

    const sanitized = sanitizeBookingForParty(booking, req.user);
    if (!sanitized) {
      return errorResponse(res, 403, 'Forbidden: You do not have permission to view this booking');
    }

    return successResponse(res, 200, 'Service booking fetched successfully', sanitized);
  } catch (error) {
    next(error);
  }
};`;

// Replace acceptBooking
const oldAccept = `export const acceptBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'accept', req.body, req.user);
    return successResponse(res, 200, 'Booking accepted successfully', updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};`;

const newAccept = `export const acceptBooking = async (req, res, next) => {
  try {
    const updated = await serviceBookingService.transitionBooking(req.params.id, 'accept', req.body, req.user);
    const sanitized = sanitizeBookingForParty(updated, req.user);
    return successResponse(res, 200, 'Booking accepted successfully', sanitized || updated);
  } catch (error) {
    if (error.statusCode) return errorResponse(res, error.statusCode, error.message);
    next(error);
  }
};`;

controllerContent = controllerContent
  .replace(oldProvReq.replace(/\n/g, '\r\n'), newProvReq.replace(/\n/g, '\r\n'))
  .replace(oldProvBook.replace(/\n/g, '\r\n'), newProvBook.replace(/\n/g, '\r\n'))
  .replace(oldGetBooking.replace(/\n/g, '\r\n'), newGetBooking.replace(/\n/g, '\r\n'))
  .replace(oldAccept.replace(/\n/g, '\r\n'), newAccept.replace(/\n/g, '\r\n'));

fs.writeFileSync(controllerPath, controllerContent, 'utf8');
console.log('Updated service_booking.controller.js successfully.');

