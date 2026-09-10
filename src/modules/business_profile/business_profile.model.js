import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import BusinessCategory from '../business_category/business_category.model.js';

const BusinessProfile = sequelize.define('BusinessProfile', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  business_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  operatingHours: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bannerUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  serviceCategory: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hourlyRate: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  availabilityDays: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_profiles',
});

// Setup relationships
BusinessProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default BusinessProfile;
