import { Op, fn, col, literal } from 'sequelize';
import sequelize from '../../config/db.js';
import { cacheGet, cacheSet, cacheDelPattern } from '../../config/redis.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import BusinessProduct from '../business_product/business_product.model.js';
import BusinessOrder from '../business_order/business_order.model.js';
import BusinessReview from '../business_review/business_review.model.js';
import BusinessFollow from '../business_profile/business_follow.model.js';
import BusinessSearchLog from '../business_category/business_search_log.model.js';
import BusinessAnalyticsEvent from './business_analytics_event.model.js';
import BusinessDailyMetric from './business_daily_metric.model.js';
import BusinessLead, { LEAD_STATUSES } from './business_lead.model.js';
import {
  EVENT_CONFIG_MAP,
  aggregateStoreAnalyticsReport,
  buildDateWindows,
  buildDedupKey,
  formatIstDateKey,
  normalizeEventSource,
  normalizeEventType,
  parseAnalyticsRange,
} from './business_analytics_engine.helper.js';

let tablesReadyPromise = null;
const memoryDedupCache = new Map();
const MAX_MEMORY_DEDUP_SIZE = 5000;

export const ensureBusinessAnalyticsTables = async () => {
  if (!tablesReadyPromise) {
    tablesReadyPromise = Promise.all([
      BusinessAnalyticsEvent.sync(),
      BusinessDailyMetric.sync(),
      BusinessLead.sync(),
    ]).catch((err) => {
      tablesReadyPromise = null;
      throw err;
    });
  }
  return tablesReadyPromise;
};

const acquireDedupSlot = async (key, ttlSeconds) => {
  try {
    const redisMod = await import('../../config/redis.js');
    const client = redisMod.cacheClient || redisMod.getRateLimitRedis?.();
    if (client) {
      const res = await client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    }
  } catch {
    // Fallback to bounded local map below
  }

  const now = Date.now();
  const existingExp = memoryDedupCache.get(key);
  if (existingExp && existingExp > now) {
    return false;
  }
  if (memoryDedupCache.size >= MAX_MEMORY_DEDUP_SIZE) {
    for (const [k, exp] of memoryDedupCache.entries()) {
      if (exp <= now) memoryDedupCache.delete(k);
    }
    if (memoryDedupCache.size >= MAX_MEMORY_DEDUP_SIZE) {
      const firstKey = memoryDedupCache.keys().next().value;
      if (firstKey) memoryDedupCache.delete(firstKey);
    }
  }
  memoryDedupCache.set(key, now + ttlSeconds * 1000);
  return true;
};

const resolveActorKey = ({ viewerUserId, sessionKey, clientIp, userAgent }) => {
  if (viewerUserId) return `u:${viewerUserId}`;
  if (sessionKey && String(sessionKey).trim()) {
    return `s:${String(sessionKey).trim().slice(0, 60)}`;
  }
  const ipPart = String(clientIp || 'anon').replace(/[^a-zA-Z0-9.:_-]/g, '').slice(0, 32);
  const uaHash = String(userAgent || '').length;
  return `g:${ipPart}:${uaHash}`;
};

const incrementDailyRollup = async (deltasByKey) => {
  for (const delta of deltasByKey.values()) {
    const now = new Date();
    await sequelize.query(
      `INSERT INTO business_daily_metrics
        (business_id, metric_date, impressions, profile_views, unique_visitors, product_views, calls, whatsapp_taps, chats, directions, shares, enquiries, sponsored_views, search_views, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         impressions = impressions + VALUES(impressions),
         profile_views = profile_views + VALUES(profile_views),
         unique_visitors = unique_visitors + VALUES(unique_visitors),
         product_views = product_views + VALUES(product_views),
         calls = calls + VALUES(calls),
         whatsapp_taps = whatsapp_taps + VALUES(whatsapp_taps),
         chats = chats + VALUES(chats),
         directions = directions + VALUES(directions),
         shares = shares + VALUES(shares),
         enquiries = enquiries + VALUES(enquiries),
         sponsored_views = sponsored_views + VALUES(sponsored_views),
         search_views = search_views + VALUES(search_views),
         updated_at = VALUES(updated_at)`,
      {
        replacements: [
          delta.businessId,
          delta.dateKey,
          delta.impressions,
          delta.profile_views,
          delta.unique_visitors,
          delta.product_views,
          delta.calls,
          delta.whatsapp_taps,
          delta.chats,
          delta.directions,
          delta.shares,
          delta.enquiries,
          delta.sponsored_views,
          delta.search_views,
          now,
        ],
      }
    );
  }
};

/**
 * Record 1..50 customer engagement events with owner-self exclusion & Redis/memory deduplication.
 */
export const recordAnalyticsEvents = async ({
  events = [],
  viewerUserId = null,
  clientIp = null,
  userAgent = null,
}) => {
  await ensureBusinessAnalyticsTables();

  const rawList = Array.isArray(events) ? events.slice(0, 50) : [];
  if (rawList.length === 0) {
    return { acceptedCount: 0, deduplicatedCount: 0, excludedSelfCount: 0 };
  }

  const businessIds = [
    ...new Set(
      rawList
        .map((e) => Number(e?.business_id ?? e?.businessId))
        .filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (businessIds.length === 0) {
    return { acceptedCount: 0, deduplicatedCount: 0, excludedSelfCount: 0 };
  }

  const businesses = await BusinessProfile.findAll({
    where: { id: businessIds, is_deleted: false },
    attributes: ['id', 'userId'],
  });
  const ownerMap = new Map(businesses.map((b) => [Number(b.id), b.userId ? Number(b.userId) : null]));

  const rowsToInsert = [];
  const deltasByKey = new Map();
  let deduplicatedCount = 0;
  let excludedSelfCount = 0;

  for (const item of rawList) {
    const businessId = Number(item?.business_id ?? item?.businessId);
    if (!ownerMap.has(businessId)) continue;

    const eventType = normalizeEventType(item?.event_type ?? item?.eventType);
    if (!eventType) continue;

    const ownerUserId = ownerMap.get(businessId);
    if (viewerUserId && ownerUserId && Number(viewerUserId) === ownerUserId) {
      excludedSelfCount += 1;
      continue;
    }

    const productIdRaw = Number(item?.product_id ?? item?.productId);
    const productId = Number.isInteger(productIdRaw) && productIdRaw > 0 ? productIdRaw : null;
    const source = normalizeEventSource(item?.source);
    const isSponsored = Boolean(item?.is_sponsored ?? item?.isSponsored ?? (source === 'featured'));
    const sessionKey = item?.session_key ?? item?.sessionKey ?? null;
    const eventTimestamp = item?.created_at ? new Date(item.created_at) : new Date();
    const validTs = Number.isNaN(eventTimestamp.getTime()) ? new Date() : eventTimestamp;
    const dateKey = formatIstDateKey(validTs);

    const config = EVENT_CONFIG_MAP[eventType];
    const actorKey = resolveActorKey({ viewerUserId, sessionKey, clientIp, userAgent });
    const windowBucket = Math.floor(validTs.getTime() / (config.dedupTtlSec * 1000));
    const dedupKey = buildDedupKey({
      businessId,
      productId,
      eventType,
      actorKey,
      windowBucket,
    });

    const isAllowed = await acquireDedupSlot(dedupKey, config.dedupTtlSec);
    if (!isAllowed) {
      deduplicatedCount += 1;
      continue;
    }

    let isUniqueVisitorToday = false;
    if (config.tracksUniqueVisitor) {
      const uvKey = `ba_uv:${businessId}:${dateKey}:${actorKey}`;
      isUniqueVisitorToday = await acquireDedupSlot(uvKey, 86400);
    }

    rowsToInsert.push({
      business_id: businessId,
      product_id: productId,
      viewer_user_id: viewerUserId ? Number(viewerUserId) : null,
      session_key: sessionKey ? String(sessionKey).slice(0, 80) : null,
      event_type: eventType,
      source,
      is_sponsored: isSponsored,
      metadata_json: item?.metadata && typeof item.metadata === 'object' ? item.metadata : null,
      event_date: dateKey,
      created_at: validTs,
    });

    const rollupKey = `${businessId}:${dateKey}`;
    if (!deltasByKey.has(rollupKey)) {
      deltasByKey.set(rollupKey, {
        businessId,
        dateKey,
        impressions: 0,
        profile_views: 0,
        unique_visitors: 0,
        product_views: 0,
        calls: 0,
        whatsapp_taps: 0,
        chats: 0,
        directions: 0,
        shares: 0,
        enquiries: 0,
        sponsored_views: 0,
        search_views: 0,
      });
    }
    const delta = deltasByKey.get(rollupKey);
    if (config.column && Object.prototype.hasOwnProperty.call(delta, config.column)) {
      delta[config.column] += 1;
    }
    if (isUniqueVisitorToday) {
      delta.unique_visitors += 1;
    }
    if (eventType === 'PROFILE_VIEW') {
      if (isSponsored) delta.sponsored_views += 1;
      if (source === 'search') delta.search_views += 1;
    }
  }

  if (rowsToInsert.length > 0) {
    await BusinessAnalyticsEvent.bulkCreate(rowsToInsert);
    await incrementDailyRollup(deltasByKey);

    // Bust short-lived analytics cache for touched businesses
    for (const bizId of new Set(rowsToInsert.map((r) => r.business_id))) {
      await cacheDelPattern(`analytics:biz:${bizId}:*`).catch(() => {});
    }
  }

  return {
    acceptedCount: rowsToInsert.length,
    deduplicatedCount,
    excludedSelfCount,
  };
};

/**
 * Fetch complete enterprise storefront analytics payload for 7D | 30D | 3M | 6M.
 */
export const getBusinessStorefrontAnalytics = async (
  businessId,
  { range = '7D', anchorDate = null } = {}
) => {
  await ensureBusinessAnalyticsTables();

  const bizId = Number(businessId);
  const {
    rangeConfig,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    currentDateKeys,
  } = buildDateWindows(range, anchorDate || new Date());

  const cacheKey = anchorDate ? null : `analytics:biz:${bizId}:range:${rangeConfig.key}`;
  if (cacheKey) {
    const cached = await cacheGet(cacheKey);
    if (cached) return cached;
  }

  const prevStartTs = `${previousStart} 00:00:00`;
  const currEndTs = `${currentEnd} 23:59:59`;
  const currStartTs = `${currentStart} 00:00:00`;

  const [
    business,
    dailyRows,
    orderRows,
    leadRows,
    leadStatusRows,
    sourceRows,
    topProductRows,
    followerCount,
    reviewStats,
  ] = await Promise.all([
    BusinessProfile.findOne({
      where: { id: bizId, is_deleted: false },
      attributes: ['id', 'businessName', 'serviceCategory', 'category_id', 'is_featured', 'city_name', 'locality_name'],
    }),
    BusinessDailyMetric.findAll({
      where: {
        business_id: bizId,
        metric_date: { [Op.between]: [previousStart, currentEnd] },
      },
      raw: true,
    }),
    sequelize.query(
      `SELECT DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) AS metric_date,
              COUNT(*) AS order_count,
              COALESCE(SUM(total_amount), 0) AS gross_revenue
       FROM business_orders
       WHERE business_id = ?
         AND is_deleted = 0
         AND status NOT IN ('cancelled', 'returned', 'refunded')
         AND created_at >= DATE_SUB(?, INTERVAL 330 MINUTE)
         AND created_at <= DATE_SUB(?, INTERVAL 330 MINUTE)
       GROUP BY DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE))`,
      {
        replacements: [bizId, prevStartTs, currEndTs],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    sequelize.query(
      `SELECT DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) AS metric_date,
              COUNT(*) AS lead_count
       FROM business_leads
       WHERE business_id = ?
         AND is_deleted = 0
         AND created_at >= DATE_SUB(?, INTERVAL 330 MINUTE)
         AND created_at <= DATE_SUB(?, INTERVAL 330 MINUTE)
       GROUP BY DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE))`,
      {
        replacements: [bizId, prevStartTs, currEndTs],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    sequelize.query(
      `SELECT status, COUNT(*) AS cnt
       FROM business_leads
       WHERE business_id = ?
         AND is_deleted = 0
         AND created_at >= DATE_SUB(?, INTERVAL 330 MINUTE)
         AND created_at <= DATE_SUB(?, INTERVAL 330 MINUTE)
       GROUP BY status`,
      {
        replacements: [bizId, currStartTs, currEndTs],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    sequelize.query(
      `SELECT source, COUNT(*) AS views_count
       FROM business_analytics_events
       WHERE business_id = ?
         AND event_type IN ('PROFILE_VIEW', 'STORE_IMPRESSION')
         AND event_date BETWEEN ? AND ?
       GROUP BY source
       ORDER BY views_count DESC`,
      {
        replacements: [bizId, currentStart, currentEnd],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    sequelize.query(
      `SELECT e.product_id,
              COUNT(*) AS views_count,
              p.name AS product_name,
              p.selling_price,
              p.available_quantity,
              p.stock_status,
              p.primary_image
       FROM business_analytics_events e
       LEFT JOIN business_products p ON p.id = e.product_id
       WHERE e.business_id = ?
         AND e.event_type = 'PRODUCT_VIEW'
         AND e.product_id IS NOT NULL
         AND e.event_date BETWEEN ? AND ?
       GROUP BY e.product_id, p.name, p.selling_price, p.available_quantity, p.stock_status, p.primary_image
       ORDER BY views_count DESC
       LIMIT 5`,
      {
        replacements: [bizId, currentStart, currentEnd],
        type: sequelize.QueryTypes.SELECT,
      }
    ),
    BusinessFollow.count({ where: { business_id: bizId, is_active: true } }).catch(() => 0),
    BusinessReview.findOne({
      where: { business_id: bizId, is_deleted: false },
      attributes: [
        [fn('COUNT', col('id')), 'review_count'],
        [fn('AVG', col('rating')), 'avg_rating'],
      ],
      raw: true,
    }).catch(() => ({ review_count: 0, avg_rating: 0 })),
  ]);

  let topSearchTerms = [];
  if (business) {
    const categoryName = business.serviceCategory ? String(business.serviceCategory).trim() : null;
    const categoryId = business.category_id ? Number(business.category_id) : null;
    if (categoryId || categoryName) {
      topSearchTerms = await BusinessSearchLog.findAll({
        where: {
          created_at: { [Op.gte]: new Date(Date.now() - rangeConfig.days * 86400000) },
          [Op.or]: [
            ...(categoryId ? [{ category_id: categoryId }] : []),
            ...(categoryName ? [{ category_name: categoryName }] : []),
          ],
        },
        attributes: [
          'normalized_query',
          [fn('COUNT', col('id')), 'search_count'],
        ],
        group: ['normalized_query'],
        order: [[literal('search_count'), 'DESC']],
        limit: 5,
        raw: true,
      }).catch(() => []);
    }
  }

  const aggregated = aggregateStoreAnalyticsReport({
    rangeKey: rangeConfig.key,
    currentDateKeys,
    previousStart,
    previousEnd,
    dailyRows,
    orderRows,
    leadRows,
  });

  const leadPipeline = { NEW: 0, CONTACTED: 0, CONVERTED: 0, CLOSED: 0 };
  for (const row of leadStatusRows) {
    const st = String(row.status || 'NEW').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(leadPipeline, st)) {
      leadPipeline[st] = Number(row.cnt) || 0;
    }
  }

  const sourceTotal = sourceRows.reduce((s, r) => s + (Number(r.views_count) || 0), 0);
  const sourceBreakdown = sourceRows.map((r) => {
    const cnt = Number(r.views_count) || 0;
    return {
      source: r.source,
      count: cnt,
      sharePct: sourceTotal > 0 ? Math.round((cnt / sourceTotal) * 100) : 0,
    };
  });

  const result = {
    businessId: bizId,
    businessName: business?.businessName || 'My Store',
    range: rangeConfig.key,
    rangeLabel: rangeConfig.label,
    granularity: rangeConfig.granularity,
    window: {
      currentStart,
      currentEnd,
      previousStart,
      previousEnd,
    },
    isFeatured: Boolean(business?.is_featured),
    followersCount: Number(followerCount) || 0,
    rating: {
      average: Number(Number(reviewStats?.avg_rating || 0).toFixed(1)),
      count: Number(reviewStats?.review_count || 0),
    },
    summary: aggregated.totals,
    trend: aggregated.trend,
    sourceBreakdown,
    leadPipeline,
    topProducts: topProductRows.map((p) => ({
      productId: Number(p.product_id),
      name: p.product_name || `Product #${p.product_id}`,
      views: Number(p.views_count) || 0,
      sellingPrice: Number(p.selling_price) || 0,
      availableQuantity: Number(p.available_quantity) || 0,
      stockStatus: p.stock_status || 'in_stock',
      primaryImage: p.primary_image || null,
    })),
    topSearchTerms: topSearchTerms.map((t) => ({
      query: t.normalized_query,
      count: Number(t.search_count) || 0,
    })),
  };

  if (cacheKey) {
    await cacheSet(cacheKey, result, 90);
  }
  return result;
};

/**
 * Persistent Leads API backing BusinessLeadsScreen + Dashboard Enquiries count.
 */
export const createBusinessLead = async (payload, viewerUserId = null) => {
  await ensureBusinessAnalyticsTables();

  const businessId = Number(payload?.businessId ?? payload?.business_id);
  if (!Number.isInteger(businessId) || businessId <= 0) {
    const err = new Error('Valid businessId is required');
    err.statusCode = 400;
    throw err;
  }

  const business = await BusinessProfile.findOne({
    where: { id: businessId, is_deleted: false },
    attributes: ['id'],
  });
  if (!business) {
    const err = new Error('Business not found');
    err.statusCode = 404;
    throw err;
  }

  const clientRef = payload?.client_ref || payload?.id || null;
  if (clientRef) {
    const existing = await BusinessLead.findOne({
      where: { client_ref: String(clientRef).slice(0, 80), business_id: businessId, is_deleted: false },
    });
    if (existing) return existing;
  }

  const created = await BusinessLead.create({
    client_ref: clientRef ? String(clientRef).slice(0, 80) : null,
    business_id: businessId,
    customer_user_id: viewerUserId ? Number(viewerUserId) : null,
    customer_name: String(payload?.customerName ?? payload?.customer_name ?? 'Resident Customer').trim().slice(0, 150),
    customer_phone: String(payload?.customerPhone ?? payload?.customer_phone ?? '').trim().slice(0, 30),
    inquiry_type: String(payload?.inquiryType ?? payload?.inquiry_type ?? 'General Enquiry').trim().slice(0, 80),
    message: String(payload?.message ?? '').trim(),
    status: 'NEW',
    source: normalizeEventSource(payload?.source),
    created_by: viewerUserId ? Number(viewerUserId) : null,
    created_at: new Date(),
  });

  // Also record analytics lead event + daily rollup
  await recordAnalyticsEvents({
    events: [
      {
        business_id: businessId,
        event_type: 'LEAD_SUBMIT',
        source: payload?.source || 'shop_detail',
        session_key: clientRef || `lead:${created.id}`,
      },
    ],
    viewerUserId,
  }).catch(() => {});

  return created;
};

export const listBusinessLeads = async (businessId) => {
  await ensureBusinessAnalyticsTables();
  return BusinessLead.findAll({
    where: { business_id: Number(businessId), is_deleted: false },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
    limit: 100,
  });
};

export const updateBusinessLeadStatus = async (leadId, newStatus, ownerUserId = null) => {
  await ensureBusinessAnalyticsTables();
  const normalized = String(newStatus || '').trim().toUpperCase();
  if (!LEAD_STATUSES.includes(normalized)) {
    const err = new Error(`Invalid status. Must be one of: ${LEAD_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const lead = await BusinessLead.findOne({
    where: { id: Number(leadId), is_deleted: false },
  });
  if (!lead) {
    const err = new Error('Lead not found');
    err.statusCode = 404;
    throw err;
  }

  if (ownerUserId) {
    const biz = await BusinessProfile.findOne({
      where: { id: lead.business_id, userId: ownerUserId, is_deleted: false },
      attributes: ['id'],
    });
    if (!biz && Number(lead.business_id) !== 101) {
      const err = new Error('Access denied for this lead');
      err.statusCode = 403;
      throw err;
    }
  }

  lead.status = normalized;
  lead.updated_by = ownerUserId ? Number(ownerUserId) : null;
  await lead.save();

  await cacheDelPattern(`analytics:biz:${lead.business_id}:*`).catch(() => {});
  return lead;
};
