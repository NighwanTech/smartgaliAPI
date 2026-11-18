import { successResponse, errorResponse } from '../../utils/response.js';
import { isGlobalAdminUser } from '../../middleware/auth.middleware.js';
import * as businessAnalyticsService from './business_analytics.service.js';

export const trackStorefrontEvents = async (req, res) => {
  try {
    const body = req.body || {};
    const events = Array.isArray(body.events)
      ? body.events
      : body.business_id || body.businessId
        ? [body]
        : [];

    if (events.length === 0) {
      return errorResponse(res, 400, 'At least one analytics event with business_id is required.');
    }

    const viewerUserId = req.user?.id || req.user?.userId || null;
    const clientIp = req.ip || req.headers['x-forwarded-for'] || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = await businessAnalyticsService.recordAnalyticsEvents({
      events,
      viewerUserId,
      clientIp,
      userAgent,
    });

    return successResponse(res, 202, 'Analytics events processed', result);
  } catch (err) {
    console.error('trackStorefrontEvents error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to record analytics event');
  }
};

export const getStorefrontAnalytics = async (req, res) => {
  try {
    const businessId = Number(req.params.businessId || req.business?.id);
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return errorResponse(res, 400, 'Valid businessId is required.');
    }

    const range = req.query?.range || '7D';
    const report = await businessAnalyticsService.getBusinessStorefrontAnalytics(businessId, { range });
    return successResponse(res, 200, 'Storefront analytics fetched', report);
  } catch (err) {
    console.error('getStorefrontAnalytics error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to load storefront analytics');
  }
};

export const submitLead = async (req, res) => {
  try {
    const viewerUserId = req.user?.id || req.user?.userId || null;
    const lead = await businessAnalyticsService.createBusinessLead(req.body || {}, viewerUserId);
    return successResponse(res, 201, 'Enquiry submitted successfully', lead);
  } catch (err) {
    console.error('submitLead error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to submit enquiry');
  }
};

export const getLeadsByBusiness = async (req, res) => {
  try {
    const businessId = Number(req.params.businessId || req.business?.id);
    const leads = await businessAnalyticsService.listBusinessLeads(businessId);
    return successResponse(res, 200, 'Business leads fetched', leads);
  } catch (err) {
    console.error('getLeadsByBusiness error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to fetch business leads');
  }
};

export const patchLeadStatus = async (req, res) => {
  try {
    const ownerUserId = isGlobalAdminUser(req.user) ? null : (req.user?.id || req.user?.userId || null);
    const status = req.body?.status;
    const updated = await businessAnalyticsService.updateBusinessLeadStatus(req.params.id, status, ownerUserId);
    return successResponse(res, 200, 'Lead status updated', updated);
  } catch (err) {
    console.error('patchLeadStatus error:', err);
    return errorResponse(res, err.statusCode || 500, err.message || 'Failed to update lead status');
  }
};
