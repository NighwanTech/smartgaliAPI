import Cms from './cms.model.js';

export const createCmsService = async (data) => {
  return await Cms.create(data);
};

export const getAllCmsService = async () => {
  return await Cms.findAll({ order: [['createdAt', 'DESC']] });
};

export const getCmsByIdService = async (id) => {
  return await Cms.findByPk(id);
};

export const getCmsBySlugService = async (slug) => {
  return await Cms.findOne({ where: { slug } });
};

export const updateCmsService = async (id, data) => {
  const cms = await Cms.findByPk(id);
  if (!cms) {
    throw new Error('CMS content not found');
  }
  return await cms.update(data);
};

export const deleteCmsService = async (id) => {
  const cms = await Cms.findByPk(id);
  if (!cms) {
    throw new Error('CMS content not found');
  }
  await cms.destroy();
  return { message: 'CMS content deleted successfully' };
};
