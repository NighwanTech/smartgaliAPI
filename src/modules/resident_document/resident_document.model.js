import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const ResidentDocument = sequelize.define('ResidentDocument', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  owner_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  document_type: {
    type: DataTypes.STRING(100),
    defaultValue: 'other',
    allowNull: false,
  },
  flat_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  file_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  file_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  file_size: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING(50),
    defaultValue: 'private', // 'private', 'shared_for_verification', 'verified', 'rejected'
    allowNull: false,
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  verified_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    },
  },
  verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  deletedRemarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  updated_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'resident_documents',
});

ResidentDocument.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
ResidentDocument.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
ResidentDocument.belongsTo(User, { foreignKey: 'verified_by', as: 'verifier' });

export default ResidentDocument;
