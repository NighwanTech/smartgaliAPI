/**
 * Idempotent Enterprise Store Analytics & Lead Pipeline Migration
 * Run with: node src/database/migrations/add_enterprise_business_analytics.js
 *
 * Creates:
 *  1. `business_analytics_events` (raw store/product telemetry events)
 *  2. `business_daily_metrics` (pre-aggregated daily rollup per business_id + metric_date)
 *  3. `business_leads` (persistent customer enquiries & conversion pipeline)
 */
import sequelize from '../../config/db.js';
import BusinessAnalyticsEvent from '../../modules/analytics/business_analytics_event.model.js';
import BusinessDailyMetric from '../../modules/analytics/business_daily_metric.model.js';
import BusinessLead from '../../modules/analytics/business_lead.model.js';

export const runEnterpriseBusinessAnalyticsMigration = async () => {
  console.log('Running Enterprise Store Analytics migration...');
  await BusinessAnalyticsEvent.sync();
  await BusinessDailyMetric.sync();
  await BusinessLead.sync();
  console.log('  + [OK]   Synced business_analytics_events, business_daily_metrics & business_leads tables');
  return true;
};

const isMain = process.argv[1] && process.argv[1].endsWith('add_enterprise_business_analytics.js');
if (isMain) {
  runEnterpriseBusinessAnalyticsMigration()
    .then(async () => {
      console.log('Enterprise Store Analytics migration finished successfully.');
      await sequelize.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Migration failed:', err);
      await sequelize.close();
      process.exit(1);
    });
}
