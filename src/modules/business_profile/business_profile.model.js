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
  category_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: BusinessCategory,
      key: 'id',
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  logo: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  is_featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'business_profiles',
});

// Setup relationships
BusinessProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
BusinessProfile.belongsTo(BusinessCategory, { foreignKey: 'category_id', as: 'category' });

export default BusinessProfile;
