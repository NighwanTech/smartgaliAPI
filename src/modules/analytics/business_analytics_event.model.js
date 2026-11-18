import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

export const ANALYTICS_EVENT_TYPES = Object.freeze([
  'STORE_IMPRESSION',
  'PROFILE_VIEW',
  'PRODUCT_VIEW',
  'CALL_TAP',
  'WHATSAPP_TAP',
  'CHAT_START',
  'DIRECTION_TAP',
  'LEAD_SUBMIT',
  'SHARE_TAP',
  'FOLLOW_TAP',
]);

export const ANALYTICS_SOURCES = Object.freeze([
  'search',
  'nearby',
  'featured',
  'offer',
  'product_detail',
  'shop_detail',
  'direct',
]);

const BusinessAnalyticsEvent = sequelize.define(
  'BusinessAnalyticsEvent',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    product_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    viewer_user_id: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    session_key: {
      type: DataTypes.STRING(80),
      allowNull: true,
    },
    event_type: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'direct',
    },
    is_sponsored: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    metadata_json: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    event_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'business_analytics_events',
    timestamps: false,
    indexes: [
      { name: 'idx_bae_biz_date_type', fields: ['business_id', 'event_date', 'event_type'] },
      { name: 'idx_bae_biz_prod_date', fields: ['business_id', 'product_id', 'event_date'] },
      { name: 'idx_bae_created_at', fields: ['created_at'] },
    ],
  }
);

export default BusinessAnalyticsEvent;
