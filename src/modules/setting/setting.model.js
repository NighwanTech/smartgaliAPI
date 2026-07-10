import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Setting = sequelize.define('Setting', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  group: {
    type: DataTypes.ENUM('general', 'payment', 'api'),
    allowNull: false,
    defaultValue: 'general',
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_public: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  }
}, {
  tableName: 'settings',
  timestamps: true,
});

export default Setting;
