import { Op } from 'sequelize';
import SystemLog from './system_log.model.js';

export const createLog = async (data) => {
  return await SystemLog.create(data);
};

export const getActivityLogs = async () => {
  return await SystemLog.findAll({
    where: {
      type: {
        [Op.ne]: 'error'
      }
    },
    order: [['createdAt', 'DESC']],
    limit: 1000 // Limit to last 1000 for performance
  });
};

export const getErrorLogs = async () => {
  return await SystemLog.findAll({
    where: {
      [Op.or]: [
        { type: 'error' },
        { level: ['error', 'critical'] }
      ]
    },
    order: [['createdAt', 'DESC']],
    limit: 1000
  });
};

export const getLogById = async (id) => {
  return await SystemLog.findByPk(id);
};
