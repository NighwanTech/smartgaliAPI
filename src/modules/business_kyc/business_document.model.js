import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

/**
 * Stores real uploaded KYC documents for a registered BusinessProfile.
 * Supports 1-to-many dynamic documents across Layer 1 (Common) & Layer 2 (Category-specific).
 */
const BusinessDocument = sequelize.define(
  'BusinessDocument',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    business_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    rule_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    doc_code: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    layer: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'common',
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    doc_number: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    file_url: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    expiry_date: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'under_review', // 'pending' | 'under_review' | 'verified' | 'rejected'
    },
    admin_remark: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    verified_by: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ...commonFields,
  },
  {
    timestamps: false,
    tableName: 'business_documents',
  }
);

BusinessProfile.hasMany(BusinessDocument, {
  foreignKey: 'business_id',
  as: 'documents',
});
BusinessDocument.belongsTo(BusinessProfile, {
  foreignKey: 'business_id',
  as: 'business',
});

export default BusinessDocument;

