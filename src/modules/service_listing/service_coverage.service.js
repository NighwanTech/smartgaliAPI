import {
  ServiceAreaType,
  ServiceRadiusOption,
} from '../service_config/service_config.models.js';
import ServiceListing from '../service_listing/service_listing.model.js';
import ServiceProviderProfile from '../service_provider_profile/service_provider_profile.model.js';
import ServiceCoverageArea from '../service_listing/service_coverage_area.model.js';
import { City, Locality, Pincode } from '../location_master/location_master.models.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import SocietyServiceAccess, { SOCIETY_SERVICE_ACCESS_STATUS } from '../society_service_access/society_service_access.model.js';
import { listingMasterIncludes } from './service_listing.service.js';
import { validateCustomerCoverageEligibility } from '../service_booking/service_coverage.service.js';

/**
 * Calculates Great-Circle Distance between two geographic points using Haversine formula.
 * Returns distance in Kilometers (KM) rounded to 2 decimal places.
 */
export const calculateHaversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const p1 = Number(lat1);
  const l1 = Number(lon1);
  const p2 = Number(lat2);
  const l2 = Number(lon2);

  if (isNaN(p1) || isNaN(l1) || isNaN(p2) || isNaN(l2)) {
    return null;
  }

  const R = 6371; // Earth mean radius in KM
  const dLat = ((p2 - p1) * Math.PI) / 180;
  const dLon = ((l2 - l1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1 * Math.PI) / 180) *
      Math.cos((p2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100;
};

/**
 * Resolves all active coverage areas for a given service listing from DB.
 */
export const resolveCoverageAreas = async (listingId) => {
  return await ServiceCoverageArea.findAll({
    where: { service_id: listingId, is_active: true, is_deleted: false },
    include: [
      { model: ServiceRadiusOption, as: 'radius_option' },
      { model: City, as: 'city' },
      { model: Locality, as: 'locality' },
      { model: Pincode, as: 'pincode' },
      { model: SocietyProfile, as: 'society' },
    ],
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });
};

/**
 * Resolves authoritative Provider Service Coverage Configuration (Fallback).
 */
export const resolveProviderCoverageConfig = async (listing, providerProfile) => {
  let areaType = listing?.service_area_type;
  if (!areaType && listing?.service_area_type_id) {
    areaType = await ServiceAreaType.findOne({
      where: { id: listing.service_area_type_id, is_deleted: false },
    });
  }

  let radiusOption = listing?.radius_option;
  if (!radiusOption && listing?.radius_option_id) {
    radiusOption = await ServiceRadiusOption.findOne({
      where: { id: listing.radius_option_id, is_deleted: false },
    });
  }

  let profileArea = providerProfile?.service_area;
  if (typeof profileArea === 'string') {
    try {
      profileArea = JSON.parse(profileArea);
    } catch (_) {
      profileArea = null;
    }
  }

  const providerCity = profileArea?.city || 'Patna';
  const providerLocalities = Array.isArray(profileArea?.localities) ? profileArea.localities : [];
  const providerPincodes = Array.isArray(profileArea?.pincodes) ? profileArea.pincodes : [];

  let effectiveRadiusKm = 10;
  if (radiusOption && radiusOption.radius_km) {
    effectiveRadiusKm = Number(radiusOption.radius_km);
  } else if (profileArea?.radiusKm) {
    effectiveRadiusKm = Number(profileArea.radiusKm);
  }

  const centerLat = profileArea?.centerLatitude != null ? Number(profileArea.centerLatitude) : (profileArea?.latitude != null ? Number(profileArea.latitude) : 25.5941);
  const centerLon = profileArea?.centerLongitude != null ? Number(profileArea.centerLongitude) : (profileArea?.longitude != null ? Number(profileArea.longitude) : 85.1376);

  return {
    areaTypeCode: areaType?.code || 'RADIUS',
    areaTypeName: areaType?.name || 'Within Radial Distance',
    radiusKm: effectiveRadiusKm,
    city: providerCity,
    localities: providerLocalities,
    pincodes: providerPincodes,
    centerLatitude: centerLat,
    centerLongitude: centerLon,
  };
};

/**
 * Evaluates live coverage eligibility against MySQL database.
 */
export const evaluateLiveCoverage = async ({ listingId, customerLocation = {} }) => {
  const listing = await ServiceListing.findOne({
    where: { id: listingId, is_deleted: false },
    include: [
      {
        model: ServiceProviderProfile,
        as: 'provider',
      },
      ...listingMasterIncludes,
    ],
  });

  if (!listing) {
    const error = new Error('Service listing not found');
    error.statusCode = 404;
    throw error;
  }

  const provider = listing.provider || {};

  // 1. Live Provider Availability Checks
  let isProviderAvailable = true;
  let providerAvailabilityLabel = 'Active';

  if (!listing.is_available) {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'Listing Paused';
  } else if (provider.vacation_mode === true) {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'On Vacation (Unavailable)';
  } else if (provider.is_online === false) {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'Offline';
  } else if (provider.is_verified === false && provider.verification_status === 'suspended') {
    isProviderAvailable = false;
    providerAvailabilityLabel = 'Account Suspended';
  }

  // 2. Authoritative Coverage Evaluation via Shared Engine
  const coverageResult = await validateCustomerCoverageEligibility({
    listing,
    providerProfile: provider,
    customerLocation,
    userRole: customerLocation.location_type === 'society' ? 'resident' : 'guest',
  });

  const isEligible = Boolean(coverageResult.isEligible && isProviderAvailable);

  return {
    is_eligible: isEligible,
    is_provider_available: isProviderAvailable,
    provider_availability: providerAvailabilityLabel,
    distance_km: coverageResult.distanceKm ?? null,
    allowed_radius_km: coverageResult.allowedRadiusKm ?? coverageResult.maxAllowedRadiusKm ?? 15,
    coverage_zone: coverageResult.matchedArea?.origin_address || customerLocation.locality || customerLocation.city || 'Service Perimeter',
    matched_method: coverageResult.coverageMethod || coverageResult.matchedArea?.coverage_method || 'RADIUS',
    reason: !isProviderAvailable
      ? `Service provider is currently ${providerAvailabilityLabel}.`
      : coverageResult.reason,
    matched_area_id: coverageResult.matchedCoverageAreaId || null,
  };
};

export default {
  calculateHaversineDistanceKm,
  resolveCoverageAreas,
  resolveProviderCoverageConfig,
  evaluateLiveCoverage,
};
