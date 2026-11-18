import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import sequelize from '../src/config/db.js';
import User from '../src/modules/user/user.model.js';
import BusinessProfile from '../src/modules/business_profile/business_profile.model.js';
import BusinessProduct from '../src/modules/business_product/business_product.model.js';
import BusinessOrder from '../src/modules/business_order/business_order.model.js';
import BusinessAnalyticsEvent from '../src/modules/analytics/business_analytics_event.model.js';
import BusinessDailyMetric from '../src/modules/analytics/business_daily_metric.model.js';
import BusinessLead from '../src/modules/analytics/business_lead.model.js';
import {
  aggregateStoreAnalyticsReport,
  buildDateWindows,
  computeGrowthMetric,
  formatIstDateKey,
  parseAnalyticsRange,
} from '../src/modules/analytics/business_analytics_engine.helper.js';
import * as analyticsService from '../src/modules/analytics/business_analytics.service.js';

const CREATED = {
  businesses: [],
  products: [],
  orders: [],
  leads: [],
};

const cleanup = async () => {
  if (CREATED.businesses.length > 0) {
    await BusinessAnalyticsEvent.destroy({ where: { business_id: CREATED.businesses }, force: true });
    await BusinessDailyMetric.destroy({ where: { business_id: CREATED.businesses }, force: true });
    await BusinessLead.destroy({ where: { business_id: CREATED.businesses }, force: true });
  }
  if (CREATED.orders.length > 0) {
    await BusinessOrder.destroy({ where: { id: CREATED.orders }, force: true });
  }
  if (CREATED.products.length > 0) {
    await BusinessProduct.destroy({ where: { id: CREATED.products }, force: true });
  }
  if (CREATED.businesses.length > 0) {
    await BusinessProfile.destroy({ where: { id: CREATED.businesses }, force: true });
  }
};

after(async () => {
  await cleanup().catch((err) => console.error('Analytics test cleanup error:', err));
  await sequelize.close();
});

// ---------------------------------------------------------------------------
// UNIT TESTS: PURE ANALYTICS ENGINE MATH & WINDOW AGGREGATION
// ---------------------------------------------------------------------------

test('Analytics ranges and Period-over-Period growth metrics compute exact percentages & edge cases', () => {
  assert.equal(parseAnalyticsRange('7D').days, 7);
  assert.equal(parseAnalyticsRange('30D').days, 30);
  assert.equal(parseAnalyticsRange('3M').granularity, 'weekly');
  assert.equal(parseAnalyticsRange('6M').granularity, 'monthly');
  assert.equal(parseAnalyticsRange('invalid').key, '7D');

  const windows = buildDateWindows('7D', '2026-11-12');
  assert.equal(windows.currentStart, '2026-11-06');
  assert.equal(windows.currentEnd, '2026-11-12');
  assert.equal(windows.previousStart, '2026-10-30');
  assert.equal(windows.previousEnd, '2026-11-05');
  assert.equal(windows.currentDateKeys.length, 7);

  const up = computeGrowthMetric(120, 100);
  assert.equal(up.growthPct, 20);
  assert.equal(up.formattedGrowth, '↑ 20%');
  assert.equal(up.isPositive, true);

  const down = computeGrowthMetric(75, 100);
  assert.equal(down.growthPct, -25);
  assert.equal(down.formattedGrowth, '↓ 25%');
  assert.equal(down.isPositive, false);

  const fresh = computeGrowthMetric(14, 0);
  assert.equal(fresh.formattedGrowth, 'New');
  assert.equal(fresh.isNew, true);

  const flatZero = computeGrowthMetric(0, 0);
  assert.equal(flatZero.formattedGrowth, '0%');
});

test('aggregateStoreAnalyticsReport buckets 7D, 3M weekly & 6M monthly accurately with orders & leads', () => {
  const win7 = buildDateWindows('7D', '2026-11-12');
  const rep7 = aggregateStoreAnalyticsReport({
    rangeKey: '7D',
    currentDateKeys: win7.currentDateKeys,
    previousStart: win7.previousStart,
    previousEnd: win7.previousEnd,
    dailyRows: [
      { metric_date: '2026-11-04', profile_views: 50, calls: 4, chats: 6 },
      { metric_date: '2026-11-10', profile_views: 60, calls: 6, chats: 8 },
      { metric_date: '2026-11-12', profile_views: 40, calls: 2, chats: 4 },
    ],
    orderRows: [
      { metric_date: '2026-11-12', order_count: 3, gross_revenue: 4500 },
    ],
    leadRows: [
      { metric_date: '2026-11-02', lead_count: 2 },
      { metric_date: '2026-11-12', lead_count: 5 },
    ],
  });

  assert.equal(rep7.trend.length, 7);
  assert.equal(rep7.totals.profileViews.value, 100);
  assert.equal(rep7.totals.profileViews.previous, 50);
  assert.equal(rep7.totals.profileViews.formattedGrowth, '↑ 100%');
  assert.equal(rep7.totals.enquiries.value, 5);
  assert.equal(rep7.totals.enquiries.formattedGrowth, '↑ 150%');
  assert.equal(rep7.totals.calls.value, 8);
  assert.equal(rep7.totals.orders.value, 3);
  assert.equal(rep7.totals.revenue.value, 4500);

  const win3M = buildDateWindows('3M', '2026-11-12');
  const rep3M = aggregateStoreAnalyticsReport({
    rangeKey: '3M',
    currentDateKeys: win3M.currentDateKeys,
    previousStart: win3M.previousStart,
    previousEnd: win3M.previousEnd,
  });
  assert.equal(rep3M.trend.length, Math.ceil(90 / 7));

  const win6M = buildDateWindows('6M', '2026-11-12');
  const rep6M = aggregateStoreAnalyticsReport({
    rangeKey: '6M',
    currentDateKeys: win6M.currentDateKeys,
    previousStart: win6M.previousStart,
    previousEnd: win6M.previousEnd,
  });
  assert.ok(rep6M.trend.length >= 6 && rep6M.trend.length <= 7);
});

// ---------------------------------------------------------------------------
// E2E DATABASE INTEGRATION TESTS: EVENTS, DEDUP, LEADS & REAL ROLLUPS
// ---------------------------------------------------------------------------

test('Live DB: Telemetry records events, excludes owner, deduplicates repeats, and aggregates storefront analytics', async () => {
  await analyticsService.ensureBusinessAnalyticsTables();

  const users = await User.findAll({ attributes: ['userId'], limit: 2, order: [['userId', 'ASC']] });
  const ownerUserId = users[0]?.userId ? Number(users[0].userId) : null;
  const customerId = users[1]?.userId
    ? Number(users[1].userId)
    : (ownerUserId ? ownerUserId : null);

  const uniqueSuffix = Date.now();
  const biz = await BusinessProfile.create({
    userId: ownerUserId,
    businessName: `Analytics Test Shop ${uniqueSuffix}`,
    serviceCategory: 'Footwear',
    city_name: 'Patna',
    is_featured: true,
    is_open: true,
  });
  CREATED.businesses.push(biz.id);

  const prod = await BusinessProduct.create({
    business_id: biz.id,
    name: `Analytics Sneaker ${uniqueSuffix}`,
    sku: `SKU-ANA-${uniqueSuffix}`,
    selling_price: 1999,
    mrp: 2499,
    available_quantity: 12,
    status: 'active',
    approval_status: 'approved',
  });
  CREATED.products.push(prod.id);

  // 1. Owner self-view must be excluded cleanly (when ownerUserId exists)
  if (ownerUserId) {
    const selfRes = await analyticsService.recordAnalyticsEvents({
      events: [{ business_id: biz.id, event_type: 'PROFILE_VIEW', source: 'nearby' }],
      viewerUserId: ownerUserId,
    });
    assert.equal(selfRes.excludedSelfCount, 1);
    assert.equal(selfRes.acceptedCount, 0);
  }

  // 2. Customer 1 (distinct session/user) generates view, product view, call, whatsapp, chat + duplicate repeat
  const distinctCustomerId = users[1]?.userId ? Number(users[1].userId) : null;
  const customerSessionKey = `cust-sess-${uniqueSuffix}`;
  const custRes = await analyticsService.recordAnalyticsEvents({
    events: [
      { business_id: biz.id, event_type: 'PROFILE_VIEW', source: 'search', session_key: customerSessionKey },
      { business_id: biz.id, event_type: 'PROFILE_VIEW', source: 'search', session_key: customerSessionKey }, // dup in same window
      { business_id: biz.id, product_id: prod.id, event_type: 'PRODUCT_VIEW', source: 'shop_detail', session_key: customerSessionKey },
      { business_id: biz.id, event_type: 'CALL_TAP', source: 'shop_detail', session_key: customerSessionKey },
      { business_id: biz.id, event_type: 'WHATSAPP_TAP', source: 'shop_detail', session_key: customerSessionKey },
      { business_id: biz.id, event_type: 'CHAT_START', source: 'shop_detail', session_key: customerSessionKey },
    ],
    viewerUserId: distinctCustomerId,
  });
  assert.equal(custRes.acceptedCount, 5);
  assert.equal(custRes.deduplicatedCount, 1);

  // 3. Second distinct customer views shop (sponsored)
  const guestRes = await analyticsService.recordAnalyticsEvents({
    events: [
      { business_id: biz.id, event_type: 'PROFILE_VIEW', source: 'featured', is_sponsored: true, session_key: `guest-${uniqueSuffix}` },
    ],
    viewerUserId: null,
  });
  assert.equal(guestRes.acceptedCount, 1);

  // 4. Persistent customer lead (with idempotency client_ref check) & status workflow
  const lead1 = await analyticsService.createBusinessLead(
    {
      businessId: biz.id,
      client_ref: `ref-${uniqueSuffix}`,
      customerName: 'Pawan Resident',
      customerPhone: '9876543210',
      inquiryType: 'Stock Query',
      message: 'Size 9 available?',
      source: 'shop_detail',
    },
    customerId
  );
  CREATED.leads.push(lead1.id);

  const dupLead = await analyticsService.createBusinessLead(
    {
      businessId: biz.id,
      client_ref: `ref-${uniqueSuffix}`,
      customerName: 'Pawan Resident',
      message: 'Size 9 available?',
    },
    customerId
  );
  assert.equal(Number(dupLead.id), Number(lead1.id));

  await analyticsService.updateBusinessLeadStatus(lead1.id, 'CONTACTED', biz.userId);
  const leadsList = await analyticsService.listBusinessLeads(biz.id);
  assert.equal(leadsList.length, 1);
  assert.equal(leadsList[0].status, 'CONTACTED');

  // 5. Real order contributes to orders & revenue rollup
  const order = await BusinessOrder.create({
    order_number: `ORD-ANA-${uniqueSuffix}`,
    business_id: biz.id,
    customer_user_id: customerId,
    customer_name: 'Pawan Resident',
    customer_phone: '9876543210',
    subtotal: 1999,
    total_amount: 1999,
    status: 'completed',
    created_at: new Date(),
  });
  CREATED.orders.push(order.id);

  // 6. Verify aggregated enterprise storefront report
  const anchorToday = formatIstDateKey(new Date());
  const report = await analyticsService.getBusinessStorefrontAnalytics(biz.id, {
    range: '7D',
    anchorDate: anchorToday,
  });

  assert.equal(report.businessId, biz.id);
  assert.equal(report.range, '7D');
  assert.equal(report.isFeatured, true);
  assert.equal(report.summary.profileViews.value, 2);
  assert.equal(report.summary.uniqueVisitors.value, 2);
  assert.equal(report.summary.productViews.value, 1);
  assert.equal(report.summary.calls.value, 1);
  assert.equal(report.summary.whatsappTaps.value, 1);
  assert.equal(report.summary.chats.value, 2); // CHAT_START (1) + WHATSAPP_TAP (1)
  assert.equal(report.summary.enquiries.value, 1);
  assert.equal(report.summary.orders.value, 1);
  assert.equal(report.summary.revenue.value, 1999);
  assert.equal(report.summary.sponsoredViews, 1);
  assert.equal(report.summary.searchViews, 1);
  assert.equal(report.leadPipeline.CONTACTED, 1);
  assert.equal(report.topProducts.length, 1);
  assert.equal(report.topProducts[0].productId, Number(prod.id));
  assert.equal(report.topProducts[0].views, 1);
  assert.ok(report.sourceBreakdown.some((s) => s.source === 'search' && s.count === 1));
  assert.equal(report.trend.length, 7);
});
