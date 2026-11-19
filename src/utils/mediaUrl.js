import env from '../config/env.js';

export const CANONICAL_LIVE_ORIGIN = 'https://api.smartgali.com';

/**
 * Checks whether a given hostname is a local dev host, loopback, or private LAN IP.
 */
export const isLocalHost = (host) => {
  if (!host) return false;
  const cleanHost = host.toLowerCase().split(':')[0];
  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === '::1') return true;
  const parts = cleanHost.split('.');
  if (parts.length === 4) {
    const a = parseInt(parts[0], 10);
    const b = parseInt(parts[1], 10);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
};

/**
 * Returns the effective media origin:
 * If env.publicMediaOrigin is configured with a public, non-local domain, uses it.
 * Otherwise, falls back to canonical live https://api.smartgali.com to ensure end-to-end live fetching.
 */
export const getTargetMediaOrigin = () => {
  const origin = env.publicMediaOrigin || env.publicApiOrigin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (!isLocalHost(parsed.hostname)) {
        return origin.replace(/\/+$/, '');
      }
    } catch {
      // ignore
    }
  }
  return CANONICAL_LIVE_ORIGIN;
};

const MEDIA_KEYS = new Set([
  'avatar_url', 'avatarUrl',
  'profile_image', 'profileImage', 'profile_image_url', 'profileImageUrl',
  'banner_url', 'bannerUrl',
  'cover_image', 'coverImage', 'cover_image_url', 'coverImageUrl',
  'thumbnail_url', 'thumbnailUrl',
  'image_url', 'imageUrl',
  'media_url', 'mediaUrl',
  'file_url', 'fileUrl',
  'attachment_url', 'attachmentUrl',
  'url',
  'icon_url', 'iconUrl',
  'document_url', 'documentUrl',
  'video_url', 'videoUrl',
  'audio_url', 'audioUrl',
]);

const MEDIA_ARRAY_KEYS = new Set([
  'mediaUrls', 'media_urls', 'media_files', 'mediaFiles',
  'images', 'videos', 'photos', 'attachments',
]);

/**
 * Normalizes any relative or local media URL into the canonical live URL.
 */
export const normalizeMediaUrl = (value) => {
  if (typeof value !== 'string' || !value.trim()) return value;
  const raw = value.trim().replace(/\\/g, '/');
  const targetOrigin = getTargetMediaOrigin();

  // Root-relative path e.g. /uploads/image.jpg
  if (raw.startsWith('/')) {
    return `${targetOrigin}${raw}`;
  }

  // Path without leading slash e.g. "uploads/image.jpg"
  if (raw.startsWith('uploads/')) {
    return `${targetOrigin}/${raw}`;
  }

  try {
    const parsed = new URL(raw);
    // If it points to a local or LAN address, rewrite host to target origin
    if (isLocalHost(parsed.hostname)) {
      return `${targetOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    // Upgrade http to https for canonical smartgali domains
    if (parsed.hostname === 'api.smartgali.com' && parsed.protocol === 'http:') {
      return `https://${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return raw;
  } catch {
    return value;
  }
};

/**
 * Recursively inspects payloads and normalizes all media URLs across objects and arrays.
 */
export const normalizeMediaPayload = (value, key = '') => {
  if (value == null) return value;
  if (MEDIA_KEYS.has(key) && typeof value === 'string') {
    return normalizeMediaUrl(value);
  }
  if (Array.isArray(value)) {
    const isMediaArr = MEDIA_ARRAY_KEYS.has(key);
    return value.map((item) => {
      if (typeof item === 'string' && isMediaArr) {
        return normalizeMediaUrl(item);
      }
      return normalizeMediaPayload(item, isMediaArr ? 'url' : '');
    });
  }
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const plain = typeof value.toJSON === 'function' ? value.toJSON() : value;
    return Object.fromEntries(
      Object.entries(plain).map(([childKey, childValue]) => [
        childKey,
        normalizeMediaPayload(childValue, childKey),
      ])
    );
  }
  return value;
};
