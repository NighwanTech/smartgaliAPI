import { ANALYTICS_EVENT_TYPES, ANALYTICS_SOURCES } from './business_analytics_event.model.js';

export const ANALYTICS_RANGES = Object.freeze({
  '7D': { key: '7D', days: 7, granularity: 'daily', label: 'Last 7 Days' },
  '30D': { key: '30D', days: 30, granularity: 'daily', label: 'Last 30 Days' },
  '3M': { key: '3M', days: 90, granularity: 'weekly', label: 'Last 3 Months' },
  '6M': { key: '6M', days: 180, granularity: 'monthly', label: 'Last 6 Months' },
});

const MONTH_SHORT = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

const WEEKDAY_SHORT = Object.freeze([
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
]);

// Map event types to atomic rollup columns and dedup TTLs (seconds).
export const EVENT_CONFIG_MAP = Object.freeze({
  STORE_IMPRESSION: { column: 'impressions', dedupTtlSec: 3600 },
  PROFILE_VIEW: { column: 'profile_views', dedupTtlSec: 1800, tracksUniqueVisitor: true },
  PRODUCT_VIEW: { column: 'product_views', dedupTtlSec: 1800 },
  CALL_TAP: { column: 'calls', dedupTtlSec: 300 },
  WHATSAPP_TAP: { column: 'whatsapp_taps', dedupTtlSec: 300 },
  CHAT_START: { column: 'chats', dedupTtlSec: 300 },
  DIRECTION_TAP: { column: 'directions', dedupTtlSec: 300 },
  SHARE_TAP: { column: 'shares', dedupTtlSec: 300 },
  LEAD_SUBMIT: { column: 'enquiries', dedupTtlSec: 60 },
  FOLLOW_TAP: { column: null, dedupTtlSec: 300 },
});

export const parseAnalyticsRange = (rawRange) => {
  const key = String(rawRange || '7D').trim().toUpperCase();
  return ANALYTICS_RANGES[key] || ANALYTICS_RANGES['7D'];
};

export const normalizeEventType = (rawType) => {
  const normalized = String(rawType || '').trim().toUpperCase();
  return ANALYTICS_EVENT_TYPES.includes(normalized) ? normalized : null;
};

export const normalizeEventSource = (rawSource) => {
  const normalized = String(rawSource || 'direct').trim().toLowerCase();
  return ANALYTICS_SOURCES.includes(normalized) ? normalized : 'direct';
};

/**
 * Format Date as YYYY-MM-DD in IST (+05:30) when no explicit UTC date string is given.
 */
export const formatIstDateKey = (input = new Date()) => {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    return formatIstDateKey(new Date());
  }
  const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).toISOString().slice(0, 10);
};

export const addDaysToDateKey = (dateKey, deltaDays) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays);
  return new Date(utc).toISOString().slice(0, 10);
};

export const buildDateRangeKeys = (startKey, endKey) => {
  const keys = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < 400) {
    keys.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }
  return keys;
};

export const buildDateWindows = (rawRange, anchorInput = new Date()) => {
  const config = parseAnalyticsRange(rawRange);
  const currentEnd = formatIstDateKey(anchorInput);
  const currentStart = addDaysToDateKey(currentEnd, -(config.days - 1));
  const previousEnd = addDaysToDateKey(currentStart, -1);
  const previousStart = addDaysToDateKey(previousEnd, -(config.days - 1));
  const currentDateKeys = buildDateRangeKeys(currentStart, currentEnd);

  return {
    rangeConfig: config,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    currentDateKeys,
  };
};

export const computeGrowthMetric = (currentValue = 0, previousValue = 0) => {
  const current = Number(currentValue) || 0;
  const previous = Number(previousValue) || 0;
  const delta = Math.round((current - previous) * 100) / 100;

  if (previous <= 0 && current <= 0) {
    return {
      value: 0,
      previous: 0,
      delta: 0,
      growthPct: 0,
      isPositive: true,
      isNew: false,
      formattedGrowth: '0%',
    };
  }

  if (previous <= 0 && current > 0) {
    return {
      value: current,
      previous: 0,
      delta,
      growthPct: 100,
      isPositive: true,
      isNew: true,
      formattedGrowth: 'New',
    };
  }

  const growthPct = Math.round(((current - previous) / previous) * 1000) / 10;
  const absPct = Math.abs(growthPct);
  const displayPct = Number.isInteger(absPct) ? String(absPct) : absPct.toFixed(1);
  const isPositive = growthPct >= 0;

  return {
    value: current,
    previous,
    delta,
    growthPct,
    isPositive,
    isNew: false,
    formattedGrowth: `${isPositive ? '↑' : '↓'} ${displayPct}%`,
  };
};

const emptyDayBucket = (dateKey) => ({
  dateKey,
  impressions: 0,
  profileViews: 0,
  uniqueVisitors: 0,
  productViews: 0,
  calls: 0,
  whatsappTaps: 0,
  chats: 0,
  directions: 0,
  shares: 0,
  enquiries: 0,
  orders: 0,
  revenue: 0,
  sponsoredViews: 0,
  searchViews: 0,
});

const parseUtcDateFromKey = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const formatBucketDisplay = (dateKey, rangeKey) => {
  const dt = parseUtcDateFromKey(dateKey);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mon = MONTH_SHORT[dt.getUTCMonth()];
  if (rangeKey === '7D') {
    return WEEKDAY_SHORT[dt.getUTCDay()];
  }
  if (rangeKey === '6M') {
    return mon;
  }
  return `${dd} ${mon}`;
};

const sumBuckets = (items, label, fullLabel, dateKey) => {
  const acc = emptyDayBucket(dateKey);
  for (const item of items) {
    acc.impressions += item.impressions;
    acc.profileViews += item.profileViews;
    acc.uniqueVisitors += item.uniqueVisitors;
    acc.productViews += item.productViews;
    acc.calls += item.calls;
    acc.whatsappTaps += item.whatsappTaps;
    acc.chats += item.chats;
    acc.directions += item.directions;
    acc.shares += item.shares;
    acc.enquiries += item.enquiries;
    acc.orders += item.orders;
    acc.revenue += item.revenue;
    acc.sponsoredViews += item.sponsoredViews;
    acc.searchViews += item.searchViews;
  }
  acc.revenue = Math.round(acc.revenue * 100) / 100;
  acc.contacts = acc.calls + acc.whatsappTaps + acc.chats;
  return {
    label,
    fullLabel,
    ...acc,
  };
};

/**
 * Assemble normalized daily buckets and roll up into 7D/30D (daily), 3M (weekly), or 6M (monthly) trend series,
 * plus exact current & previous window totals.
 */
export const aggregateStoreAnalyticsReport = ({
  rangeKey,
  currentDateKeys,
  previousStart,
  previousEnd,
  dailyRows = [],
  orderRows = [],
  leadRows = [],
}) => {
  const byDate = new Map();
  const getOrCreateDay = (dateKey) => {
    if (!byDate.has(dateKey)) byDate.set(dateKey, emptyDayBucket(dateKey));
    return byDate.get(dateKey);
  };

  for (const row of dailyRows) {
    const dk = formatIstDateKey(row.metric_date);
    const b = getOrCreateDay(dk);
    b.impressions += Number(row.impressions) || 0;
    b.profileViews += Number(row.profile_views) || 0;
    b.uniqueVisitors += Number(row.unique_visitors) || 0;
    b.productViews += Number(row.product_views) || 0;
    b.calls += Number(row.calls) || 0;
    b.whatsappTaps += Number(row.whatsapp_taps) || 0;
    b.chats += Number(row.chats) || 0;
    b.directions += Number(row.directions) || 0;
    b.shares += Number(row.shares) || 0;
    b.sponsoredViews += Number(row.sponsored_views) || 0;
    b.searchViews += Number(row.search_views) || 0;
    // Note: enquiries prefers persistent business_leads table; daily row kept as fallback below
    b._telemetryEnquiries = (b._telemetryEnquiries || 0) + (Number(row.enquiries) || 0);
  }

  for (const row of orderRows) {
    const dk = formatIstDateKey(row.metric_date);
    const b = getOrCreateDay(dk);
    b.orders += Number(row.order_count) || 0;
    b.revenue += Number(row.gross_revenue) || 0;
  }

  const hasPersistentLeads = leadRows.some((r) => (Number(r.lead_count) || 0) > 0);
  for (const row of leadRows) {
    const dk = formatIstDateKey(row.metric_date);
    const b = getOrCreateDay(dk);
    b.enquiries += Number(row.lead_count) || 0;
  }

  if (!hasPersistentLeads) {
    for (const b of byDate.values()) {
      if (b._telemetryEnquiries) b.enquiries = b._telemetryEnquiries;
    }
  }

  const currentDays = currentDateKeys.map((dk) => byDate.get(dk) || emptyDayBucket(dk));
  const previousKeys = buildDateRangeKeys(previousStart, previousEnd);
  const previousDays = previousKeys.map((dk) => byDate.get(dk) || emptyDayBucket(dk));

  const currentTotals = sumBuckets(currentDays, 'Current', 'Current Period', currentDateKeys[0]);
  const previousTotals = sumBuckets(previousDays, 'Previous', 'Previous Period', previousStart);

  // Build range-appropriate chart points
  let points = [];
  if (rangeKey === '7D' || rangeKey === '30D') {
    points = currentDays.map((day) => {
      const lbl = formatBucketDisplay(day.dateKey, rangeKey);
      const dt = parseUtcDateFromKey(day.dateKey);
      const full = `${String(dt.getUTCDate()).padStart(2, '0')} ${MONTH_SHORT[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
      return sumBuckets([day], lbl, full, day.dateKey);
    });
  } else if (rangeKey === '3M') {
    // 7-day weekly chunks
    for (let i = 0; i < currentDays.length; i += 7) {
      const slice = currentDays.slice(i, i + 7);
      const first = slice[0];
      const last = slice[slice.length - 1];
      const lbl = formatBucketDisplay(first.dateKey, '30D');
      const full = `${formatBucketDisplay(first.dateKey, '30D')} - ${formatBucketDisplay(last.dateKey, '30D')}`;
      points.push(sumBuckets(slice, lbl, full, first.dateKey));
    }
  } else {
    // 6M monthly buckets
    const monthGroups = new Map();
    for (const day of currentDays) {
      const monthKey = day.dateKey.slice(0, 7);
      if (!monthGroups.has(monthKey)) monthGroups.set(monthKey, []);
      monthGroups.get(monthKey).push(day);
    }
    for (const [monthKey, slice] of monthGroups.entries()) {
      const dt = parseUtcDateFromKey(`${monthKey}-01`);
      const mon = MONTH_SHORT[dt.getUTCMonth()];
      const full = `${mon} ${dt.getUTCFullYear()}`;
      points.push(sumBuckets(slice, mon, full, `${monthKey}-01`));
    }
  }

  const contactsCurrent = currentTotals.calls + currentTotals.whatsappTaps + currentTotals.chats;
  const contactsPrevious = previousTotals.calls + previousTotals.whatsappTaps + previousTotals.chats;
  const totalEnquiriesChatsCurrent = currentTotals.enquiries;
  const totalEnquiriesChatsPrev = previousTotals.enquiries;

  // Conversion ratio: (orders + leads + calls + whatsapp + chats) / max(1, profileViews)
  const intentCurrent = totalEnquiriesChatsCurrent + contactsCurrent + currentTotals.orders;
  const conversionRate =
    currentTotals.profileViews > 0
      ? Math.min(100, Math.round((intentCurrent / currentTotals.profileViews) * 1000) / 10)
      : 0;

  return {
    totals: {
      impressions: computeGrowthMetric(currentTotals.impressions, previousTotals.impressions),
      profileViews: computeGrowthMetric(currentTotals.profileViews, previousTotals.profileViews),
      uniqueVisitors: computeGrowthMetric(currentTotals.uniqueVisitors, previousTotals.uniqueVisitors),
      productViews: computeGrowthMetric(currentTotals.productViews, previousTotals.productViews),
      enquiries: computeGrowthMetric(totalEnquiriesChatsCurrent, totalEnquiriesChatsPrev),
      calls: computeGrowthMetric(currentTotals.calls, previousTotals.calls),
      whatsappTaps: computeGrowthMetric(currentTotals.whatsappTaps, previousTotals.whatsappTaps),
      chats: computeGrowthMetric(currentTotals.chats + currentTotals.whatsappTaps, previousTotals.chats + previousTotals.whatsappTaps),
      directChats: computeGrowthMetric(currentTotals.chats, previousTotals.chats),
      directions: computeGrowthMetric(currentTotals.directions, previousTotals.directions),
      orders: computeGrowthMetric(currentTotals.orders, previousTotals.orders),
      revenue: computeGrowthMetric(currentTotals.revenue, previousTotals.revenue),
      contacts: computeGrowthMetric(contactsCurrent, contactsPrevious),
      sponsoredViews: currentTotals.sponsoredViews,
      searchViews: currentTotals.searchViews,
      conversionRate,
    },
    trend: points,
  };
};

export const buildDedupKey = ({ businessId, productId, eventType, actorKey, windowBucket }) => {
  return `ba_dedup:${businessId}:${productId || 0}:${eventType}:${actorKey}:${windowBucket}`;
};
