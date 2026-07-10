import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const SystemLog = sequelize.define('SystemLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  level: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    allowNull: false,
    defaultValue: 'info',
  },
  type: {
    type: DataTypes.ENUM('activity', 'system', 'security', 'error'),
    allowNull: false,
    defaultValue: 'activity',
  },
  message: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  meta_data: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'system_logs',
  timestamps: true,
});

export default SystemLog;
