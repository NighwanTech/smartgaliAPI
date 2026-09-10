import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

const UserProfile = sequelize.define('UserProfile', {
  userProfileId: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    }
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  avatarUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  locationName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isProfileComplete: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'user_profiles',
});

// Setup relationships
UserProfile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasOne(UserProfile, { foreignKey: 'user_id', as: 'profile' });

export default UserProfile;
