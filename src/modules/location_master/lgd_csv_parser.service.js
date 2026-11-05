/**
 * LGD CSV Parser & Serializer Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Zero-dependency RFC 4180 compliant CSV parser and serializer.
 * - Handles UTF-8 BOM, multiline quoted fields, escaped quotes, Windows/Unix linebreaks.
 * - Enforces string preservation for LGD and Census codes (prevents leading zero loss).
 * - Header normalization tolerant of government portal variations.
 * - CSV Formula Injection (CWE-1236) sanitization for exported reports.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Strips UTF-8 BOM and normalizes line breaks.
 */
export const cleanRawCsvText = (rawContent) => {
  if (Buffer.isBuffer(rawContent)) {
    rawContent = rawContent.toString('utf8');
  }
  let text = String(rawContent || '');
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

/**
 * Parses CSV text into an array of string arrays (rows).
 */
export const parseCsvToGrid = (csvText) => {
  const cleanText = cleanRawCsvText(csvText);
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];

    if (insideQuotes) {
      if (char === '"') {
        if (i + 1 < len && cleanText[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        // Skip empty trailing row
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push last field/row if text didn't end with newline
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
};

/**
 * Normalizes header string to canonical snake_case.
 * Gracefully converts camelCase (e.g. localBodyNameEnglish -> local_body_name_english).
 */
export const normalizeHeaderKey = (header) => {
  return String(header || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

/**
 * Canonical column alias mappings for LGD State and District datasets.
 */
const STATE_HEADER_ALIASES = {
  state_code: ['state_code', 'statecode', 'lgd_state_code', 'state_lgd_code', 'code'],
  state_name_english: ['state_name_english', 'statenameenglish', 'state_name_in_english', 'state_name', 'state', 'name_english', 'name'],
  state_name_local: ['state_name_local', 'statenamelocal', 'state_name_in_local', 'state_name_in_regional_language', 'name_local'],
  state_census2011_code: ['state_census2011_code', 'statecensus2011code', 'state_census_2011_code', 'census2011_code', 'census_2011_code', 'census_code'],
  state_or_ut: ['state_or_ut', 'state_ut', 'stateorut', 'type'],
  last_updated: ['last_updated', 'source_last_updated', 'updated_at', 'last_update_date', 'date_updated'],
};

const DISTRICT_HEADER_ALIASES = {
  state_code: ['state_code', 'statecode', 'lgd_state_code', 'state_lgd_code'],
  state_name_english: ['state_name_english', 'statenameenglish', 'state_name_in_english', 'state_name', 'state'],
  district_code: ['district_code', 'districtcode', 'lgd_district_code', 'district_lgd_code', 'code'],
  district_name_english: ['district_name_english', 'districtnameenglish', 'district_name_in_english', 'district_name', 'district', 'name_english', 'name'],
  district_name_local: ['district_name_local', 'districtnamelocal', 'district_name_in_local', 'district_name_in_regional_language', 'name_local'],
  district_census2011_code: ['district_census2011_code', 'districtcensus2011code', 'district_census_2011_code', 'census2011_code', 'census_2011_code', 'census_code'],
  last_updated: ['last_updated', 'source_last_updated', 'updated_at', 'last_update_date', 'date_updated'],
};

const CITY_HEADER_ALIASES = {
  state_code: ['state_code', 'statecode', 'lgd_state_code', 'state_id'],
  state_name_english: ['state_name_english', 'statenameenglish', 'state_name_in_english', 'state_name', 'state'],
  district_code: ['district_code', 'districtcode', 'lgd_district_code', 'district_id', 'entity_code', 'entitycode'],
  district_name_english: ['district_name_english', 'districtnameenglish', 'district_name_in_english', 'district_name', 'district', 'entity_name', 'entityname'],
  city_code: ['city_code', 'citycode', 'code'],
  city_name_english: [
    'city_name_english',
    'citynameenglish',
    'city_name_in_english',
    'city_name',
    'city',
    'name',
    'name_english',
    'local_body_name_english',
    'localbodynameenglish',
    'local_body_name',
    'localbodyname',
    'urban_local_body_name',
    'ulb_name',
    'ulbname',
    'municipality_name',
  ],
  city_name_local: [
    'city_name_local',
    'citynamelocal',
    'city_name_in_local',
    'name_local',
    'local_body_name_local',
    'localbodynamelocal',
  ],
  lgd_local_body_code: [
    'lgd_local_body_code',
    'lgdlocalbodycode',
    'local_body_code',
    'localbodycode',
    'ulb_code',
    'ulbcode',
    'lgd_code',
    'lgdcode',
  ],
  city_type: [
    'city_type',
    'citytype',
    'type',
    'category',
    'local_body_type_name',
    'localbodytypename',
    'local_body_type',
    'localbodytype',
  ],
  local_body_type_code: [
    'local_body_type_code',
    'localbodytypecode',
  ],
  entity_code: [
    'entity_code',
    'entitycode',
  ],
  entity_name: [
    'entity_name',
    'entityname',
  ],
  entity_type: [
    'entity_type',
    'entitytype',
  ],
  coverage_type: [
    'coverage_type',
    'coveragetype',
  ],
  last_updated: [
    'last_updated',
    'source_last_updated',
    'updated_at',
    'last_update_date',
    'date_updated',
  ],
};

const LOCALITY_HEADER_ALIASES = {
  state_code: ['state_code', 'statecode', 'lgd_state_code', 'state_id'],
  state_name_english: ['state_name_english', 'statenameenglish', 'state_name', 'state'],
  district_code: ['district_code', 'districtcode', 'lgd_district_code', 'district_id'],
  district_name_english: ['district_name_english', 'districtnameenglish', 'district_name', 'district'],
  city_code: ['city_code', 'citycode', 'city_id'],
  city_name_english: ['city_name_english', 'citynameenglish', 'city_name', 'city'],
  locality_code: ['locality_code', 'localitycode', 'code'],
  locality_name_english: ['locality_name_english', 'localitynameenglish', 'locality_name', 'locality', 'name', 'name_english'],
  locality_name_local: ['locality_name_local', 'localitynamelocal', 'locality_name_in_local', 'name_local'],
  locality_type: ['locality_type', 'localitytype', 'type'],
  source_reference_code: ['source_reference_code', 'reference_code', 'ref_code'],
  pincode: ['pincode', 'pin_code', 'postal_code', 'pin'],
};

const PINCODE_HEADER_ALIASES = {
  pincode: ['pincode', 'pin_code', 'postal_code', 'pin', 'code'],
  area_name: ['area_name', 'areaname', 'area', 'office_name', 'officename', 'post_office_name', 'postoffice_name', 'name'],
  city_code: ['city_code', 'citycode', 'city_id'],
  city_name_english: ['city_name_english', 'citynameenglish', 'city_name', 'city'],
  district_code: ['district_code', 'districtcode', 'lgd_district_code', 'district_id'],
  district_name_english: ['district_name_english', 'districtnameenglish', 'district_name', 'district'],
  state_code: ['state_code', 'statecode', 'lgd_state_code', 'state_id'],
  state_name_english: ['state_name_english', 'statenameenglish', 'state_name', 'state'],
  locality_name_english: ['locality_name_english', 'localitynameenglish', 'locality_name', 'locality'],
};

/**
 * Resolves canonical key given raw normalized header.
 */
export const resolveCanonicalHeader = (rawHeader, datasetType = 'STATE') => {
  const norm = normalizeHeaderKey(rawHeader);
  const type = String(datasetType || 'STATE').toUpperCase();
  let aliasMap = STATE_HEADER_ALIASES;
  if (type === 'DISTRICT') aliasMap = DISTRICT_HEADER_ALIASES;
  else if (type === 'CITY') aliasMap = CITY_HEADER_ALIASES;
  else if (type === 'LOCALITY') aliasMap = LOCALITY_HEADER_ALIASES;
  else if (type === 'PINCODE' || type === 'POST_OFFICE') aliasMap = PINCODE_HEADER_ALIASES;

  for (const [canonical, aliases] of Object.entries(aliasMap)) {
    if (aliases.includes(norm)) {
      return canonical;
    }
  }
  return norm;
};

/**
 * Parses CSV text into typed records preserving strings for all codes.
 */
export const parseLgdCsv = (csvText, datasetType = 'STATE') => {
  const grid = parseCsvToGrid(csvText);
  if (grid.length < 1) {
    throw new Error('CSV file is empty or contains no readable rows.');
  }

  const rawHeaders = grid[0];
  const canonicalHeaders = rawHeaders.map((h) => resolveCanonicalHeader(h, datasetType));

  // Validate required headers
  const type = String(datasetType || 'STATE').toUpperCase();
  let required = ['state_code', 'state_name_english'];
  if (type === 'DISTRICT') {
    required = ['state_code', 'district_code', 'district_name_english'];
  } else if (type === 'CITY') {
    required = ['city_name_english'];
  } else if (type === 'LOCALITY') {
    required = ['locality_name_english'];
  } else if (type === 'PINCODE' || type === 'POST_OFFICE') {
    required = ['pincode'];
  }

  const missing = required.filter((req) => !canonicalHeaders.includes(req));
  if (missing.length > 0) {
    const err = new Error(`CSV is missing required header(s): ${missing.join(', ')}`);
    err.code = 'MISSING_HEADERS';
    err.missingHeaders = missing;
    err.detectedHeaders = canonicalHeaders;
    throw err;
  }

  // Specialized context check:
  if (type === 'CITY' && !canonicalHeaders.includes('state_code') && !canonicalHeaders.includes('state_name_english')) {
    const err = new Error('City CSV must include either state_code or state_name_english header.');
    err.code = 'MISSING_HEADERS';
    throw err;
  }
  if (type === 'LOCALITY' && !canonicalHeaders.includes('city_name_english') && !canonicalHeaders.includes('city_code')) {
    const err = new Error('Locality CSV must include either city_name_english or city_code header.');
    err.code = 'MISSING_HEADERS';
    throw err;
  }
  if ((type === 'PINCODE' || type === 'POST_OFFICE') &&
      !canonicalHeaders.includes('city_name_english') &&
      !canonicalHeaders.includes('city_code') &&
      !canonicalHeaders.includes('district_code') &&
      !canonicalHeaders.includes('district_name_english')) {
    const err = new Error('PIN code CSV must include either city_name_english, city_code, or district information.');
    err.code = 'MISSING_HEADERS';
    throw err;
  }

  const parsedRecords = [];

  for (let rowIdx = 1; rowIdx < grid.length; rowIdx++) {
    const rowValues = grid[rowIdx];
    // Skip empty rows
    if (rowValues.length === 0 || (rowValues.length === 1 && rowValues[0].trim() === '')) {
      continue;
    }

    const rawRecord = {};
    const canonicalRecord = {};

    for (let colIdx = 0; colIdx < canonicalHeaders.length; colIdx++) {
      const canonicalKey = canonicalHeaders[colIdx];
      const rawHeader = rawHeaders[colIdx] || `col_${colIdx}`;
      const rawVal = rowValues[colIdx] !== undefined ? String(rowValues[colIdx]).trim() : '';

      rawRecord[rawHeader] = rawVal;
      // Preserve leading zeros and raw strings
      canonicalRecord[canonicalKey] = rawVal;
    }

    parsedRecords.push({
      rowNumber: rowIdx + 1, // 1-based index including header
      rawRecord,
      record: canonicalRecord,
    });
  }

  return {
    headers: canonicalHeaders,
    rawHeaders,
    totalRows: parsedRecords.length,
    rows: parsedRecords,
  };
};

/**
 * Sanitizes field to prevent CSV Formula Injection (CWE-1236).
 * Prepends a single quote if the field begins with =, +, -, @, \t, or \r.
 */
export const sanitizeCsvCell = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[\=\+\-\@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Serializes an array of objects to a safe CSV string.
 */
export const serializeToCsv = (items, columns) => {
  if (!items || items.length === 0) return '';
  const cols = columns || Object.keys(items[0]);
  const headerRow = cols.map(sanitizeCsvCell).join(',');

  const rows = items.map((item) => {
    return cols.map((col) => sanitizeCsvCell(item[col])).join(',');
  });

  return [headerRow, ...rows].join('\r\n');
};

