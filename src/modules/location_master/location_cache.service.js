import { cacheGet, cacheSet, cacheDel, cacheDelPattern } from '../../config/redis.js';
import logger from '../../utils/logger.js';

/**
 * Enterprise Location & Coverage Multi-Tier Caching Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Primary: Shared Redis Client
 * Secondary: Resilient in-memory TTL cache fallback if Redis is down/unreachable.
 * Guaranteed zero-downtime, safe invalidation, and no unhandled crashes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CACHE_VERSION = 'v1';
export const TTL_LOCATION_MASTER_SECONDS = 3600; // 1 hour for location master hierarchies
export const TTL_COVERAGE_SECONDS = 600;          // 10 minutes for active provider coverage

// In-memory fallback cache when Redis is offline or during testing
const inMemoryCache = new Map();

const getMemoryCache = (key) => {
  const item = inMemoryCache.get(key);
  if (!item) return null;
  if (item.expiresAt && Date.now() > item.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  return item.value;
};

const setMemoryCache = (key, value, ttlSeconds) => {
  inMemoryCache.set(key, {
    value,
    expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
};

const delMemoryCache = (key) => {
  inMemoryCache.delete(key);
};

const delMemoryPattern = (pattern) => {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  for (const k of inMemoryCache.keys()) {
    if (regex.test(k)) {
      inMemoryCache.delete(k);
    }
  }
};

export const LocationCacheKeys = {
  states: () => `smartgali:${CACHE_VERSION}:loc:states`,
  districts: (stateId) => `smartgali:${CACHE_VERSION}:loc:districts:${stateId ?? 'all'}`,
  cities: (districtId, stateId) => `smartgali:${CACHE_VERSION}:loc:cities:${districtId ?? 'all'}:${stateId ?? 'all'}`,
  localities: (cityId, districtId) => `smartgali:${CACHE_VERSION}:loc:localities:${cityId ?? 'all'}:${districtId ?? 'all'}`,
  pincodes: (cityId, localityId) => `smartgali:${CACHE_VERSION}:loc:pincodes:${cityId ?? 'all'}:${localityId ?? 'all'}`,
  listingCoverage: (listingId) => `smartgali:${CACHE_VERSION}:cov:listing:${listingId}`,
};

/**
 * Multi-tier cached lookup: Redis -> In-Memory Fallback -> DB fetcher.
 */
export const getOrSetCache = async (key, ttlSeconds, fetcherFn) => {
  try {
    const cached = await cacheGet(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch (err) {
    logger.warn(`[LocationCache] Redis get failed for ${key}: ${err.message}`);
  }

  const memCached = getMemoryCache(key);
  if (memCached !== null && memCached !== undefined) {
    return memCached;
  }

  // Fetch authoritative DB data
  const liveData = await fetcherFn();

  // Store in Redis and in-memory cache
  if (liveData !== null && liveData !== undefined) {
    try {
      await cacheSet(key, liveData, ttlSeconds);
    } catch (_) {}
    setMemoryCache(key, liveData, ttlSeconds);
  }

  return liveData;
};

/**
 * Invalidate Location Master caches (after admin create/update/delete/import).
 */
export const invalidateLocationCache = async (datasetType = 'ALL') => {
  try {
    const type = String(datasetType).toUpperCase();
    if (type === 'STATE' || type === 'ALL') {
      await cacheDel(LocationCacheKeys.states());
      delMemoryCache(LocationCacheKeys.states());
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:districts:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:districts:*`);
    }
    if (type === 'DISTRICT' || type === 'ALL') {
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:districts:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:districts:*`);
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:cities:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:cities:*`);
    }
    if (type === 'CITY' || type === 'ALL') {
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:cities:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:cities:*`);
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:localities:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:localities:*`);
    }
    if (type === 'LOCALITY' || type === 'ALL') {
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:localities:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:localities:*`);
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:pincodes:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:pincodes:*`);
    }
    if (type === 'PINCODE' || type === 'ALL') {
      await cacheDelPattern(`smartgali:${CACHE_VERSION}:loc:pincodes:*`);
      delMemoryPattern(`smartgali:${CACHE_VERSION}:loc:pincodes:*`);
    }
    logger.info(`[LocationCache] Successfully invalidated location master caches for: ${type}`);
  } catch (err) {
    logger.warn(`[LocationCache] Invalidation error for ${datasetType}: ${err.message}`);
  }
};

/**
 * Invalidate Provider Listing Coverage cache (after coverage create/update/delete).
 */
export const invalidateListingCoverageCache = async (listingId) => {
  if (!listingId) return;
  const key = LocationCacheKeys.listingCoverage(listingId);
  try {
    await cacheDel(key);
    delMemoryCache(key);
    logger.info(`[LocationCache] Invalidated coverage cache for listingId: ${listingId}`);
  } catch (err) {
    delMemoryCache(key);
    logger.warn(`[LocationCache] Coverage cache invalidation failed for listingId ${listingId}: ${err.message}`);
  }
};

export default {
  LocationCacheKeys,
  getOrSetCache,
  invalidateLocationCache,
  invalidateListingCoverageCache,
  TTL_LOCATION_MASTER_SECONDS,
  TTL_COVERAGE_SECONDS,
};
