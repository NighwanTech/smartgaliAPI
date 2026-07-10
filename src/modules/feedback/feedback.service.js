import Feedback from './feedback.model.js';

export const createFeedback = async (data) => {
  return await Feedback.create(data);
};

export const getAllFeedback = async () => {
  return await Feedback.findAll({
    order: [['createdAt', 'DESC']]
  });
};

export const getFeedbackById = async (id) => {
  return await Feedback.findByPk(id);
};

export const updateFeedback = async (id, data) => {
  const feedback = await Feedback.findByPk(id);
  if (!feedback) return null;

  return await feedback.update(data);
};

export const deleteFeedback = async (id) => {
  const feedback = await Feedback.findByPk(id);
  if (!feedback) return null;

  await feedback.destroy();
  return true;
};
