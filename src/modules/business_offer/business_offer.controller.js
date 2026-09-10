import { successResponse, errorResponse } from '../../utils/response.js';
import * as businessOfferService from './business_offer.service.js';

export const createOffer = async (req, res, next) => {
  try {
    const data = { ...req.body };
    // Map Flutter keys -> DB keys
    if (data.discountPercent !== undefined && data.discount === undefined) {
      data.discount = String(data.discountPercent);
    }
    if (data.validUntil !== undefined && data.valid_to === undefined) {
      data.valid_to = data.validUntil;
    }
    if (data.businessId !== undefined && data.business_id === undefined) {
      data.business_id = data.businessId;
    }

    const offer = await businessOfferService.createOffer(data);
    const offerJson = offer.toJSON ? offer.toJSON() : offer;
    const formatted = {
      ...offerJson,
      discountPercent: Number(offerJson.discount) || offerJson.discountPercent || 15,
      validUntil: offerJson.valid_to || offerJson.validUntil || 'End of month',
      businessId: Number(offerJson.business_id) || offerJson.businessId,
    };
    return successResponse(res, 201, 'Business offer added successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const getAllOffers = async (req, res, next) => {
  try {
    const offers = await businessOfferService.getAllOffers();
    const formatted = offers.map(o => {
      const j = o.toJSON ? o.toJSON() : o;
      return {
        ...j,
        discountPercent: Number(j.discount) || 15,
        validUntil: j.valid_to || 'End of month',
        businessId: Number(j.business_id),
      };
    });
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
    const j = offer.toJSON ? offer.toJSON() : offer;
    const formatted = {
      ...j,
      discountPercent: Number(j.discount) || 15,
      validUntil: j.valid_to || 'End of month',
      businessId: Number(j.business_id),
    };
    return successResponse(res, 200, 'Business offer fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const getOffersByBusinessId = async (req, res, next) => {
  try {
    const offers = await businessOfferService.getOffersByBusinessId(req.params.businessId);
    const formatted = offers.map(o => {
      const j = o.toJSON ? o.toJSON() : o;
      return {
        ...j,
        discountPercent: Number(j.discount) || 15,
        validUntil: j.valid_to || 'End of month',
        businessId: Number(j.business_id),
      };
    });
    return successResponse(res, 200, 'Business offers fetched successfully', formatted);
  } catch (error) {
    next(error);
  }
};

export const updateOffer = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (data.discountPercent !== undefined && data.discount === undefined) {
      data.discount = String(data.discountPercent);
    }
    if (data.validUntil !== undefined && data.valid_to === undefined) {
      data.valid_to = data.validUntil;
    }
    const offer = await businessOfferService.updateOffer(req.params.id, data);
    if (!offer) {
      return errorResponse(res, 404, 'Business offer not found');
    }
    const j = offer.toJSON ? offer.toJSON() : offer;
    const formatted = {
      ...j,
      discountPercent: Number(j.discount) || 15,
      validUntil: j.valid_to || 'End of month',
      businessId: Number(j.business_id),
    };
    return successResponse(res, 200, 'Business offer updated successfully', formatted);
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
