import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import BusinessCategory from '../business_category/business_category.model.js';

/**
 * 2-Layer Dynamic KYC Rule Engine Model:
 * - layer = 'common' (category_id IS NULL): mandatory/shared docs required for ALL businesses
 * - layer = 'category' (category_id OR category_name_pattern): extra docs specific to a business category
 */
const BusinessCategoryKycRule = sequelize.define(
  'BusinessCategoryKycRule',
  {
    id: {
      type: DataTypes.BIGINT,
      autoIncrement: true,
      primaryKey: true,
    },
    doc_code: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    help_text: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    layer: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'category', // 'common' | 'category'
    },
    category_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    category_name_pattern: {
      type: DataTypes.STRING(150),
      allowNull: true,
    },
    is_mandatory: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    needs_number: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    number_label: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    number_placeholder: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    number_regex: {
      type: DataTypes.STRING(180),
      allowNull: true,
    },
    requires_expiry: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    needs_file: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    allowed_mime_types: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    max_file_size_bytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 10485760,
    },
    condition_key: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    condition_value: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    display_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    ...commonFields,
  },
  {
    timestamps: false,
    tableName: 'business_category_kyc_rules',
  }
);

BusinessCategoryKycRule.belongsTo(BusinessCategory, {
  foreignKey: 'category_id',
  as: 'category',
});

export default BusinessCategoryKycRule;

