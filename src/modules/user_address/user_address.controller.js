import * as userAddressService from './user_address.service.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export const listAddresses = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const addresses = await userAddressService.getAddresses(userId);
    return successResponse(res, 200, 'User addresses fetched successfully.', addresses);
  } catch (error) {
    next(error);
  }
};

export const getAddress = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const address = await userAddressService.getAddressById(userId, req.params.id);
    if (!address) {
      return errorResponse(res, 404, 'Address not found or does not belong to you.');
    }
    return successResponse(res, 200, 'Address details fetched successfully.', address);
  } catch (error) {
    next(error);
  }
};

export const addAddress = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await userAddressService.createAddress(userId, req.body);
    if (result.error) {
      return errorResponse(res, result.status || 400, result.error);
    }
    return successResponse(res, 201, 'Address added successfully.', result.data);
  } catch (error) {
    next(error);
  }
};

export const editAddress = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await userAddressService.updateAddress(userId, req.params.id, req.body);
    if (result.error) {
      return errorResponse(res, result.status || 400, result.error);
    }
    return successResponse(res, 200, 'Address updated successfully.', result.data);
  } catch (error) {
    next(error);
  }
};

export const setDefault = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await userAddressService.setDefaultAddress(userId, req.params.id);
    if (result.error) {
      return errorResponse(res, result.status || 400, result.error);
    }
    return successResponse(res, 200, 'Default address updated successfully.', result.data);
  } catch (error) {
    next(error);
  }
};

export const removeAddress = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user.userId;
    const result = await userAddressService.deleteAddress(userId, req.params.id);
    if (result.error) {
      return errorResponse(res, result.status || 400, result.error);
    }
    return successResponse(res, 200, 'Address deleted successfully.', null);
  } catch (error) {
    next(error);
  }
};

