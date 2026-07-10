import * as cmsService from './cms.service.js';

export const createCms = async (req, res, next) => {
  try {
    const cms = await cmsService.createCmsService(req.body);
    res.status(201).json({ success: true, data: cms });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }
    next(error);
  }
};

export const getAllCms = async (req, res, next) => {
  try {
    const cmsList = await cmsService.getAllCmsService();
    res.status(200).json({ success: true, data: cmsList });
  } catch (error) {
    next(error);
  }
};

export const getCmsById = async (req, res, next) => {
  try {
    const cms = await cmsService.getCmsByIdService(req.params.id);
    if (!cms) {
      return res.status(404).json({ success: false, message: 'CMS content not found' });
    }
    res.status(200).json({ success: true, data: cms });
  } catch (error) {
    next(error);
  }
};

export const getCmsBySlug = async (req, res, next) => {
  try {
    const cms = await cmsService.getCmsBySlugService(req.params.slug);
    if (!cms) {
      return res.status(404).json({ success: false, message: 'CMS content not found' });
    }
    res.status(200).json({ success: true, data: cms });
  } catch (error) {
    next(error);
  }
};

export const updateCms = async (req, res, next) => {
  try {
    const cms = await cmsService.updateCmsService(req.params.id, req.body);
    res.status(200).json({ success: true, data: cms });
  } catch (error) {
    if (error.message === 'CMS content not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }
    next(error);
  }
};

export const deleteCms = async (req, res, next) => {
  try {
    const result = await cmsService.deleteCmsService(req.params.id);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    if (error.message === 'CMS content not found') {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
};
