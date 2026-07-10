import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Cms = sequelize.define('Cms', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('page', 'faq', 'policy'),
    allowNull: false,
    defaultValue: 'page',
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    allowNull: false,
    defaultValue: 'active',
  },
}, {
  tableName: 'cms',
  timestamps: true,
});

export default Cms;
