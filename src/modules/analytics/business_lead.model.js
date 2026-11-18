import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';

export const LEAD_STATUSES = Object.freeze([
  'NEW',
  'CONTACTED',
  'CONVERTED',
  'CLOSED',
]);

const BusinessLead = sequelize.define(
  'BusinessLead',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    client_ref: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    business_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    customer_user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    customer_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    customer_phone: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: '',
    },
    inquiry_type: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: 'General Enquiry',
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'NEW',
    },
    source: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'shop_detail',
    },
    ...commonFields,
  },
  {
    tableName: 'business_leads',
    timestamps: false,
    indexes: [
      { name: 'idx_bl_biz_status_created', fields: ['business_id', 'status', 'created_at'] },
      { name: 'idx_bl_client_ref', fields: ['client_ref'] },
    ],
  }
);

export default BusinessLead;
