/**
 * Canonical ISO Date Normalizer (Enterprise Timezone Hardening)
 * ─────────────────────────────────────────────────────────────
 * Ensures all timestamps sent to clients are ISO 8601 UTC strings ending in 'Z'.
 * When MySQL returns a datetime string formatted in IST (+05:30) due to
 * sequelize timezone: '+05:30' and dialectOptions: { dateStrings: true },
 * this utility correctly interprets it as IST and converts to true UTC ISO string.
 * This guarantees consistent behavior across local (IST) and live production (UTC) environments.
 */

export const toNormalizedIsoString = (val) => {
  if (val == null || val === 'null' || val === '') return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val.toISOString();
  }
  let str = String(val).trim();
  if (!str || str === 'null') return null;

  // If already standard ISO with Z or explicit timezone offset (+HH:mm or -HH:mm)
  if (str.endsWith('Z') || /[+-]\d{2}(?::?\d{2})?$/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  // Format MySQL 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DDTHH:mm:ss' without timezone
  str = str.replace(' ', 'T');
  // MySQL is configured with timezone: '+05:30' (IST)
  const d = new Date(`${str}+05:30`);
  return isNaN(d.getTime()) ? new Date(val).toISOString() : d.toISOString();
};

export default {
  toNormalizedIsoString,
};
