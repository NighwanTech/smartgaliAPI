import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessOfferService from './business_offer.service.js';

const formatOffer = (offer) => {
  if (!offer) return null;
  const json = typeof offer.toJSON === 'function' ? offer.toJSON() : { ...offer };
  let discountPercent = json.discountPercent;
  if (discountPercent === undefined) {
    if (json.discount) {
      const parsed = parseFloat(json.discount);
      discountPercent = isNaN(parsed) ? json.discount : parsed;
    } else {
      discountPercent = null;
    }
  }
  return {
    ...json,
    businessId: json.businessId || json.business_id,
    discountPercent,
    validUntil: json.validUntil || json.valid_to,
  };
};

export const createOffer = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (!data.business_id && data.businessId) {
      data.business_id = data.businessId;
    }
    if (!data.discount && data.discountPercent !== undefined) {
      data.discount = typeof data.discountPercent === 'number' ? `${data.discountPercent}%` : data.discountPercent;
    }
    if (!data.valid_to && data.validUntil) {
      data.valid_to = data.validUntil;
    }
    const offer = await businessOfferService.createOffer(data);
    return successResponse(res, 201, 'Business offer added successfully', formatOffer(offer));
  } catch (error) {
    next(error);
  }
};

export const getAllOffers = async (req, res, next) => {
  try {
    const offers = await businessOfferService.getAllOffers();
    const formatted = Array.isArray(offers) ? offers.map(formatOffer) : offers;
    return successResponse(res, 200, 'Business offers fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const getOfferById = async (req, res, next) => {
  try {
    const offer = await businessOfferService.getOfferById(req.params.id);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer fetched successfully', formatOffer(offer));
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (req, res, next) => {
  try {
    const offer = await businessOfferService.updateOffer(req.params.id, req.body);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer updated successfully', formatOffer(offer));
  } catch (error) {
    next(error);
  }
};

export const deleteOffer = async (req, res, next) => {
  try {
    const { deletedRemarks, updated_by } = req.body;
    const offer = await businessOfferService.softDeleteOffer(req.params.id, deletedRemarks, updated_by);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    return successResponse(res, 200, 'Business offer deleted successfully (soft delete)', null);
  } catch (error) {
    next(error);
  }
};

export const getOffersByBusinessId = async (req, res, next) => {
  try {
    const offers = await businessOfferService.getOffersByBusinessId(req.params.id);
    const formatted = Array.isArray(offers) ? offers.map(formatOffer) : offers;
    return successResponse(res, 200, 'Business offers fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};
