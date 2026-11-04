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
 */
export const normalizeHeaderKey = (header) => {
  return String(header || '')
    .trim()
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
  state_name_english: ['state_name_english', 'state_name_in_english', 'state_name', 'state', 'name_english'],
  state_name_local: ['state_name_local', 'state_name_in_local', 'state_name_in_regional_language', 'name_local'],
  state_census2011_code: ['state_census2011_code', 'state_census_2011_code', 'census2011_code', 'census_2011_code', 'census_code'],
  state_or_ut: ['state_or_ut', 'state_ut', 'stateorut', 'type'],
  last_updated: ['last_updated', 'source_last_updated', 'updated_at', 'last_update_date'],
};

const DISTRICT_HEADER_ALIASES = {
  state_code: ['state_code', 'statecode', 'lgd_state_code', 'state_lgd_code'],
  state_name_english: ['state_name_english', 'state_name_in_english', 'state_name', 'state'],
  district_code: ['district_code', 'districtcode', 'lgd_district_code', 'district_lgd_code', 'code'],
  district_name_english: ['district_name_english', 'district_name_in_english', 'district_name', 'district', 'name_english'],
  district_name_local: ['district_name_local', 'district_name_in_local', 'district_name_in_regional_language', 'name_local'],
  district_census2011_code: ['district_census2011_code', 'district_census_2011_code', 'census2011_code', 'census_2011_code', 'census_code'],
};

/**
 * Resolves canonical key given raw normalized header.
 */
export const resolveCanonicalHeader = (rawHeader, datasetType = 'STATE') => {
  const norm = normalizeHeaderKey(rawHeader);
  const aliasMap = datasetType.toUpperCase() === 'DISTRICT' ? DISTRICT_HEADER_ALIASES : STATE_HEADER_ALIASES;

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
  const required = datasetType.toUpperCase() === 'DISTRICT'
    ? ['state_code', 'district_code', 'district_name_english']
    : ['state_code', 'state_name_english'];

  const missing = required.filter((req) => !canonicalHeaders.includes(req));
  if (missing.length > 0) {
    const err = new Error(`CSV is missing required header(s): ${missing.join(', ')}`);
    err.code = 'MISSING_HEADERS';
    err.missingHeaders = missing;
    err.detectedHeaders = canonicalHeaders;
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

