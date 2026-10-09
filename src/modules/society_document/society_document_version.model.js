import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyDocument from './society_document.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import User from '../user/user.model.js';

const SocietyDocumentVersion = sequelize.define('SocietyDocumentVersion', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  document_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyDocument,
      key: 'id',
    },
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyProfile,
      key: 'id',
    },
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '1.0',
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false,
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
  change_summary: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: false,
  tableName: 'society_document_versions',
});

SocietyDocumentVersion.belongsTo(SocietyDocument, { foreignKey: 'document_id', as: 'document' });
SocietyDocumentVersion.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyDocumentVersion.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

export default SocietyDocumentVersion;
