import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const BusinessDailyMetric = sequelize.define(
  'BusinessDailyMetric',
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
    metric_date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    impressions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    profile_views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    unique_visitors: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    product_views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    calls: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    whatsapp_taps: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    chats: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    directions: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    shares: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    enquiries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sponsored_views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    search_views: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'business_daily_metrics',
    timestamps: false,
    indexes: [
      {
        name: 'uniq_bdm_biz_date',
        unique: true,
        fields: ['business_id', 'metric_date'],
      },
      {
        name: 'idx_bdm_date',
        fields: ['metric_date'],
      },
    ],
  }
);

export default BusinessDailyMetric;
