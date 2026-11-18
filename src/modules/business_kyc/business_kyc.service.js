import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessProfile from '../business_profile/business_profile.model.js';
import BusinessCategory from '../business_category/business_category.model.js';
import BusinessCategoryKycRule from './business_kyc_rule.model.js';
import BusinessDocument from './business_document.model.js';
import User from '../user/user.model.js';
import { isEphemeralMediaUrl } from '../business_product/business_product.service.js';

const DEFAULT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const toBool = (v, fallback = false) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = v.toString().trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

const BUSINESS_PROFILE_KYC_COLUMNS = [
  ['owner_name', 'VARCHAR(150) NULL'],
  ['legal_entity_type', "VARCHAR(50) NOT NULL DEFAULT 'proprietorship'"],
  ['pan_number', 'VARCHAR(20) NULL'],
  ['gstin', 'VARCHAR(20) NULL'],
  ['gst_exempt', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['sells_branded_goods', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['bank_account_name', 'VARCHAR(150) NULL'],
  ['bank_account_number', 'VARCHAR(40) NULL'],
  ['bank_ifsc', 'VARCHAR(20) NULL'],
  ['upi_id', 'VARCHAR(100) NULL'],
  ['verification_status', "VARCHAR(30) NOT NULL DEFAULT 'pending'"],
  ['rejection_reason', 'TEXT NULL'],
  ['submitted_at', 'DATETIME NULL'],
  ['reviewed_by', 'BIGINT NULL'],
  ['reviewed_at', 'DATETIME NULL'],
  ['terms_accepted', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['terms_accepted_at', 'DATETIME NULL'],
];

const DEFAULT_COMMON_RULES = [
  {
    doc_code: 'OWNER_PAN',
    title: 'Owner PAN Card',
    description: 'PAN card of business owner / proprietor for identity & tax KYC.',
    help_text: 'Owner ke naam wala 10-character PAN card photo ya PDF upload karein',
    layer: 'common',
    category_id: null,
    is_mandatory: true,
    needs_number: true,
    number_label: 'PAN Number',
    number_placeholder: 'ABCDE1234F',
    number_regex: '^[A-Z]{5}[0-9]{4}[A-Z]$',
    requires_expiry: false,
    needs_file: true,
    display_order: 1,
  },
  {
    doc_code: 'SHOP_FRONT_PHOTO',
    title: 'Shop Front Photo (With Nameboard)',
    description: 'Clear exterior photo of shop showing nameboard and entrance.',
    help_text: 'Dukaan ke bahar board aur gate saaf dikhta hua photo upload karein',
    layer: 'common',
    category_id: null,
    is_mandatory: true,
    needs_number: false,
    requires_expiry: false,
    needs_file: true,
    display_order: 2,
  },
  {
    doc_code: 'GST_CERTIFICATE',
    title: 'GST Registration Certificate',
    description: 'GST registration document for taxable turnover businesses.',
    help_text: 'Agar turnover ₹40L se kam hai toh Step 1 me GST Exempt ON karein',
    layer: 'common',
    category_id: null,
    is_mandatory: true,
    needs_number: true,
    number_label: '15-Digit GSTIN',
    number_placeholder: '10ABCDE1234F1Z5',
    number_regex: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
    requires_expiry: false,
    needs_file: true,
    condition_key: 'gst_exempt',
    condition_value: 'false',
    display_order: 3,
  },
  {
    doc_code: 'CANCELLED_CHEQUE',
    title: 'Cancelled Cheque / Bank Passbook',
    description: 'Bank account proof for order settlement & payouts.',
    help_text: 'Cancelled cheque ya passbook front page upload karein',
    layer: 'common',
    category_id: null,
    is_mandatory: true,
    needs_number: false,
    requires_expiry: false,
    needs_file: true,
    display_order: 4,
  },
];

const PATTERN_CATEGORY_RULES = [
  {
    pattern: 'grocery|food|bakery|sweet|dairy|milk|restaurant|cafe|kirana|meat|fruit|vegetable',
    rules: [
      {
        doc_code: 'FSSAI_LICENSE',
        title: 'FSSAI Food Licence',
        description: 'Mandatory 14-digit FSSAI registration/license for food & grocery sellers.',
        help_text: 'Khane-peene aur grocery ke saaman ke liye 14-digit FSSAI zaroori hai',
        is_mandatory: true,
        needs_number: true,
        number_label: '14-Digit FSSAI Number',
        number_placeholder: '12345678901234',
        number_regex: '^[0-9]{14}$',
        requires_expiry: true,
        needs_file: true,
        display_order: 10,
      },
    ],
  },
  {
    pattern: 'medical|pharmacy|chemist|pharma|clinic|health',
    rules: [
      {
        doc_code: 'DRUG_LICENSE',
        title: 'Drug Licence (Form 20 / 21)',
        description: 'Retail/Wholesale Drug License issued by State Drug Control Authority.',
        help_text: 'Medical store / pharmacy ke liye Drug Licence mandatory hai',
        is_mandatory: true,
        needs_number: true,
        number_label: 'Drug Licence Number',
        number_placeholder: 'DL-BR-PAT-2025-001',
        number_regex: '^[A-Za-z0-9\\-/]{5,35}$',
        requires_expiry: true,
        needs_file: true,
        display_order: 10,
      },
      {
        doc_code: 'PHARMACIST_CERT',
        title: 'Registered Pharmacist Certificate',
        description: 'State Pharmacy Council registration certificate.',
        help_text: 'Registered Pharmacist ka certificate + expiry date upload karein',
        is_mandatory: true,
        needs_number: true,
        number_label: 'Pharmacist Reg No',
        number_placeholder: 'PHARM-12345',
        number_regex: '^[A-Za-z0-9\\-/]{4,30}$',
        requires_expiry: true,
        needs_file: true,
        display_order: 11,
      },
    ],
  },
  {
    pattern: 'fashion|footwear|apparel|clothing|garment|shoe|sportswear',
    rules: [
      {
        doc_code: 'BRAND_AUTH_LETTER',
        title: 'Brand Authorization Letter / GST Purchase Invoice',
        description: 'Proof of authentic branded inventory (e.g. Nike, Adidas, Zara).',
        help_text: 'Branded kapde/shoes bechne par Brand NOC ya GST wholesale bill upload karein',
        is_mandatory: true,
        needs_number: true,
        number_label: 'Brand Name / Invoice No',
        number_placeholder: 'NIKE-INV-2026',
        number_regex: '^.{3,60}$',
        requires_expiry: true,
        needs_file: true,
        condition_key: 'sells_branded_goods',
        condition_value: 'true',
        display_order: 10,
      },
      {
        doc_code: 'SHOP_ACT_LICENSE',
        title: 'Shop & Establishment / Gumasta Licence',
        description: 'Local municipal Shop Act or Udyam certificate.',
        help_text: 'Local dukaan licence ho toh trust badge ke liye upload karein (Optional)',
        is_mandatory: false,
        needs_number: true,
        number_label: 'Licence / Udyam No',
        number_placeholder: 'UDYAM-BR-00-0001234',
        requires_expiry: false,
        needs_file: true,
        display_order: 11,
      },
    ],
  },
  {
    pattern: 'electronic|mobile|computer|laptop|appliance',
    rules: [
      {
        doc_code: 'BRAND_AUTH_LETTER',
        title: 'Authorized Dealer / Brand GST Invoice',
        description: 'Brand dealer certificate or distributor GST invoice for electronics.',
        help_text: 'Branded electronics bechne ke liye authorized dealer proof zaroori hai',
        is_mandatory: true,
        needs_number: true,
        number_label: 'Dealer / Invoice Code',
        number_placeholder: 'SONY-AUTH-2026',
        number_regex: '^.{3,60}$',
        requires_expiry: true,
        needs_file: true,
        condition_key: 'sells_branded_goods',
        condition_value: 'true',
        display_order: 10,
      },
      {
        doc_code: 'UDYAM_OR_SHOP_ACT',
        title: 'Udyam MSME / Trade Registration',
        description: 'Business registration proof for warranty trust badge.',
        help_text: 'Optional local MSME / Shop Act registration',
        is_mandatory: false,
        needs_number: true,
        number_label: 'Udyam / Trade No',
        number_placeholder: 'UDYAM-BR-00-0001234',
        requires_expiry: false,
        needs_file: true,
        display_order: 11,
      },
    ],
  },
  {
    pattern: 'beauty|cosmetic|salon|parlour|spa',
    rules: [
      {
        doc_code: 'COSMETIC_HYGIENE_PERMIT',
        title: 'Municipal Hygiene / Trade Permit',
        description: 'Local municipal health or cosmetic trade permit.',
        help_text: 'Beauty & salon trade hygiene permit upload karein (Optional)',
        is_mandatory: false,
        needs_number: true,
        number_label: 'Permit Number',
        number_placeholder: 'MCD-HYG-2026',
        requires_expiry: true,
        needs_file: true,
        display_order: 10,
      },
    ],
  },
  {
    pattern: 'hardware|furniture|general|book|stationery|service',
    rules: [
      {
        doc_code: 'UDYAM_OR_SHOP_ACT',
        title: 'Udyam / Shop Act Certificate',
        description: 'Udyam MSME or Municipal Shop & Establishment certificate.',
        help_text: 'Local dukaan ka Udyam ya Gumasta licence upload karein (Optional)',
        is_mandatory: false,
        needs_number: true,
        number_label: 'Udyam / Gumasta No',
        number_placeholder: 'UDYAM-BR-00-0001234',
        requires_expiry: false,
        needs_file: true,
        display_order: 10,
      },
    ],
  },
];

let readyPromise = null;

export const ensureBusinessKycReady = async () => {
  if (!readyPromise) {
    readyPromise = (async () => {
      // 1. Add missing enterprise KYC columns to business_profiles idempotently
      const [cols] = await sequelize.query('SHOW COLUMNS FROM business_profiles');
      const existingSet = new Set(cols.map((c) => String(c.Field).toLowerCase()));
      for (const [colName, colDef] of BUSINESS_PROFILE_KYC_COLUMNS) {
        if (!existingSet.has(colName.toLowerCase())) {
          await sequelize.query(`ALTER TABLE business_profiles ADD COLUMN ${colName} ${colDef}`);
        }
      }

      // 2. Ensure rule & document tables exist
      await BusinessCategoryKycRule.sync();
      await BusinessDocument.sync();

      // 3. Seed default 2-Layer KYC rules if table is currently empty
      const ruleCount = await BusinessCategoryKycRule.count({ where: { is_deleted: false } });
      if (ruleCount === 0) {
        const now = new Date();
        for (const r of DEFAULT_COMMON_RULES) {
          await BusinessCategoryKycRule.create({
            ...r,
            allowed_mime_types: DEFAULT_MIME_TYPES,
            max_file_size_bytes: 10 * 1024 * 1024,
            is_active: true,
            created_at: now,
            updatedAt: now,
          });
        }

        // Seed pattern-based templates mapped to existing DB categories + fallback patterns
        const categories = await BusinessCategory.findAll({
          where: { is_deleted: false },
        });
        for (const cat of categories) {
          const catName = String(cat.name || '').toLowerCase();
          for (const group of PATTERN_CATEGORY_RULES) {
            const rx = new RegExp(group.pattern, 'i');
            if (rx.test(catName)) {
              for (const ruleDef of group.rules) {
                await BusinessCategoryKycRule.create({
                  ...ruleDef,
                  layer: 'category',
                  category_id: cat.id,
                  category_name_pattern: group.pattern,
                  allowed_mime_types: DEFAULT_MIME_TYPES,
                  max_file_size_bytes: 10 * 1024 * 1024,
                  is_active: true,
                  created_at: now,
                  updatedAt: now,
                });
              }
            }
          }
        }

        // Also seed pattern rules for categories that may be added later (like Medical / Pharmacy / Bakery)
        for (const group of PATTERN_CATEGORY_RULES) {
          const hasAnyExplicit = categories.some((c) =>
            new RegExp(group.pattern, 'i').test(String(c.name || ''))
          );
          if (!hasAnyExplicit) {
            for (const ruleDef of group.rules) {
              await BusinessCategoryKycRule.create({
                ...ruleDef,
                layer: 'category',
                category_id: null,
                category_name_pattern: group.pattern,
                allowed_mime_types: DEFAULT_MIME_TYPES,
                max_file_size_bytes: 10 * 1024 * 1024,
                is_active: true,
                created_at: now,
                updatedAt: now,
              });
            }
          }
        }
      }
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
};

const evaluateRuleCondition = (rule, context = {}) => {
  if (!rule.condition_key) return true;
  const key = String(rule.condition_key).trim();
  const expected = String(rule.condition_value ?? 'true').trim().toLowerCase();
  const rawActual = context[key];
  if (rawActual === undefined || rawActual === null) {
    // By default gst_exempt = false, sells_branded_goods = false
    return expected === 'false';
  }
  const actualBool = toBool(rawActual, false);
  return String(actualBool) === expected;
};

export const serializeKycRule = (rule, context = {}) => {
  const plain = rule.toJSON ? rule.toJSON() : { ...rule };
  const isApplicable = evaluateRuleCondition(plain, context);
  return {
    id: plain.id ?? null,
    doc_code: plain.doc_code,
    title: plain.title,
    description: plain.description || null,
    help_text: plain.help_text || null,
    layer: plain.layer || 'category',
    category_id: plain.category_id ?? null,
    category_name_pattern: plain.category_name_pattern || null,
    is_mandatory: Boolean(plain.is_mandatory) && isApplicable,
    is_applicable: isApplicable,
    needs_number: Boolean(plain.needs_number),
    number_label: plain.number_label || null,
    number_placeholder: plain.number_placeholder || null,
    number_regex: plain.number_regex || null,
    requires_expiry: Boolean(plain.requires_expiry),
    needs_file: plain.needs_file !== undefined ? Boolean(plain.needs_file) : true,
    allowed_mime_types: Array.isArray(plain.allowed_mime_types)
      ? plain.allowed_mime_types
      : DEFAULT_MIME_TYPES,
    max_file_size_bytes: Number(plain.max_file_size_bytes || 10 * 1024 * 1024),
    condition_key: plain.condition_key || null,
    condition_value: plain.condition_value || null,
    display_order: Number(plain.display_order || 0),
    is_active: plain.is_active !== undefined ? Boolean(plain.is_active) : true,
  };
};

export const getRequirementsForCategory = async ({
  category_id,
  category_name,
  sells_branded_goods = false,
  gst_exempt = false,
  includeInapplicable = false,
} = {}) => {
  await ensureBusinessKycReady();

  let resolvedCategory = null;
  const parsedId = category_id ? Number(category_id) : null;
  if (parsedId && Number.isInteger(parsedId) && parsedId > 0) {
    resolvedCategory = await BusinessCategory.findOne({
      where: { id: parsedId, is_deleted: false },
    });
  } else if (category_name && String(category_name).trim()) {
    const trimmed = String(category_name).trim();
    resolvedCategory = await BusinessCategory.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('name')),
        trimmed.toLowerCase()
      ),
    });
  }

  const resolvedCatId = resolvedCategory?.id || parsedId || null;
  const resolvedCatName = resolvedCategory?.name || (category_name ? String(category_name).trim() : null);

  // Layer 1: Common rules
  const commonRules = await BusinessCategoryKycRule.findAll({
    where: {
      layer: 'common',
      is_active: true,
      is_deleted: false,
    },
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });

  // Layer 2: Category rules (prefer explicit category_id match, plus pattern match)
  const categoryRulesAll = await BusinessCategoryKycRule.findAll({
    where: {
      layer: 'category',
      is_active: true,
      is_deleted: false,
    },
    order: [['display_order', 'ASC'], ['id', 'ASC']],
  });

  const explicitMatches = [];
  const patternMatches = [];
  for (const rule of categoryRulesAll) {
    if (resolvedCatId && rule.category_id && Number(rule.category_id) === Number(resolvedCatId)) {
      explicitMatches.push(rule);
    } else if (!rule.category_id && resolvedCatName && rule.category_name_pattern) {
      try {
        if (new RegExp(rule.category_name_pattern, 'i').test(resolvedCatName)) {
          patternMatches.push(rule);
        }
      } catch (_) {}
    }
  }

  // Fallback pattern rules when a brand-new category name matches e.g. Pharmacy or Grocery
  const combinedLayer2 = [...explicitMatches];
  const seenLayer2Codes = new Set(combinedLayer2.map((r) => r.doc_code));
  for (const rule of patternMatches) {
    if (!seenLayer2Codes.has(rule.doc_code)) {
      combinedLayer2.push(rule);
      seenLayer2Codes.add(rule.doc_code);
    }
  }

  if (combinedLayer2.length === 0 && resolvedCatName) {
    for (const group of PATTERN_CATEGORY_RULES) {
      if (new RegExp(group.pattern, 'i').test(resolvedCatName)) {
        for (const r of group.rules) {
          if (!seenLayer2Codes.has(r.doc_code)) {
            combinedLayer2.push({ ...r, layer: 'category', category_id: resolvedCatId });
            seenLayer2Codes.add(r.doc_code);
          }
        }
      }
    }
  }

  const context = {
    sells_branded_goods: toBool(sells_branded_goods, false),
    gst_exempt: toBool(gst_exempt, false),
  };

  const formattedCommon = commonRules
    .map((r) => serializeKycRule(r, context))
    .filter((d) => includeInapplicable || d.is_applicable);

  const formattedCategory = combinedLayer2
    .map((r) => serializeKycRule(r, context))
    .filter((d) => includeInapplicable || d.is_applicable);

  const allDocs = [...formattedCommon, ...formattedCategory];

  return {
    category: {
      id: resolvedCatId,
      name: resolvedCatName || 'General',
    },
    context,
    layer1_common_count: formattedCommon.length,
    layer2_category_count: formattedCategory.length,
    documents: allDocs,
  };
};

export const validateSubmittedKycDocuments = async ({
  category_id,
  category_name,
  sells_branded_goods = false,
  gst_exempt = false,
  documents = [],
}) => {
  const { documents: rules } = await getRequirementsForCategory({
    category_id,
    category_name,
    sells_branded_goods,
    gst_exempt,
    includeInapplicable: false,
  });

  const docsArray = Array.isArray(documents) ? documents : [];
  const byCode = new Map();
  for (const item of docsArray) {
    if (item && item.doc_code) {
      byCode.set(String(item.doc_code).trim().toUpperCase(), item);
    }
  }

  const errors = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const rule of rules) {
    const code = String(rule.doc_code).toUpperCase();
    const submitted = byCode.get(code);

    if (rule.is_mandatory && !submitted) {
      errors.push(`${rule.title} is required for this category.`);
      continue;
    }
    if (!submitted) continue;

    const fileUrl = submitted.file_url ? String(submitted.file_url).trim() : '';
    if (fileUrl && isEphemeralMediaUrl(fileUrl)) {
      errors.push(`${rule.title} cannot use a temporary local/blob path (${fileUrl}). Upload the file first.`);
    }
    if (rule.needs_file && rule.is_mandatory && !fileUrl) {
      errors.push(`${rule.title} file upload is missing.`);
    }

    const docNumber = submitted.doc_number ? String(submitted.doc_number).trim() : '';
    if (rule.needs_number) {
      if (rule.is_mandatory && !docNumber) {
        errors.push(`${rule.number_label || rule.title} number is required.`);
      } else if (docNumber && rule.number_regex) {
        try {
          const rx = new RegExp(rule.number_regex);
          if (!rx.test(docNumber.toUpperCase()) && !rx.test(docNumber)) {
            errors.push(`Invalid ${rule.number_label || rule.title} format.`);
          }
        } catch (_) {}
      }
    }

    const expiryDate = submitted.expiry_date ? String(submitted.expiry_date).trim() : '';
    if (rule.requires_expiry) {
      if (rule.is_mandatory && !expiryDate) {
        errors.push(`${rule.title} expiry date is required.`);
      } else if (expiryDate) {
        if (!/^\d{4}-\d{2}-\d{2}/.test(expiryDate)) {
          errors.push(`${rule.title} expiry date must be YYYY-MM-DD.`);
        } else if (expiryDate.slice(0, 10) < todayStr) {
          errors.push(`${rule.title} is expired (${expiryDate.slice(0, 10)}). Please upload a valid licence.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    const err = new Error(errors[0]);
    err.statusCode = 400;
    err.details = errors;
    throw err;
  }

  // Filter & normalize validated docs against active rules (preserving rule metadata)
  const ruleMap = new Map(rules.map((r) => [String(r.doc_code).toUpperCase(), r]));
  return docsArray
    .filter((d) => d && d.doc_code && d.file_url && !isEphemeralMediaUrl(String(d.file_url)))
    .map((d) => {
      const code = String(d.doc_code).trim().toUpperCase();
      const matchedRule = ruleMap.get(code);
      return {
        rule_id: matchedRule?.id || d.rule_id || null,
        doc_code: code,
        layer: matchedRule?.layer || d.layer || 'common',
        title: d.title || matchedRule?.title || code,
        doc_number: d.doc_number ? String(d.doc_number).trim() : null,
        file_url: String(d.file_url).trim(),
        file_name: d.file_name ? String(d.file_name).trim() : null,
        mime_type: d.mime_type ? String(d.mime_type).trim() : null,
        file_size: d.file_size ? Number(d.file_size) : null,
        expiry_date: d.expiry_date ? String(d.expiry_date).trim().slice(0, 10) : null,
      };
    });
};

export const saveBusinessDocuments = async (
  businessId,
  userId,
  documents = [],
  { transaction } = {}
) => {
  await ensureBusinessKycReady();
  if (!Array.isArray(documents) || documents.length === 0) return [];

  const now = new Date();
  const saved = [];
  for (const doc of documents) {
    const code = String(doc.doc_code || '').trim().toUpperCase();
    if (!code || !doc.file_url) continue;

    // Soft-delete previous active doc with same doc_code so re-upload cleanly replaces
    await BusinessDocument.update(
      { is_deleted: true, updatedAt: now, updated_by: userId || null },
      {
        where: { business_id: businessId, doc_code: code, is_deleted: false },
        transaction,
      }
    );

    const created = await BusinessDocument.create(
      {
        business_id: businessId,
        user_id: userId || null,
        rule_id: doc.rule_id || null,
        doc_code: code,
        layer: doc.layer || 'common',
        title: doc.title || code,
        doc_number: doc.doc_number || null,
        file_url: doc.file_url,
        file_name: doc.file_name || null,
        mime_type: doc.mime_type || null,
        file_size: doc.file_size || null,
        expiry_date: doc.expiry_date || null,
        status: 'under_review',
        created_by: userId || null,
        created_at: now,
        updatedAt: now,
      },
      { transaction }
    );
    saved.push(created.toJSON());
  }
  return saved;
};

export const getDocumentsForBusiness = async (businessId) => {
  await ensureBusinessKycReady();
  const docs = await BusinessDocument.findAll({
    where: { business_id: businessId, is_deleted: false },
    order: [['layer', 'ASC'], ['id', 'ASC']],
  });
  return docs.map((d) => d.toJSON());
};

export const verifyBusinessDocument = async (
  documentId,
  { status, admin_remark, verifierId } = {}
) => {
  await ensureBusinessKycReady();
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (!['verified', 'rejected', 'under_review', 'pending'].includes(normalizedStatus)) {
    const err = new Error('Invalid document verification status.');
    err.statusCode = 400;
    throw err;
  }

  const doc = await BusinessDocument.findOne({
    where: { id: documentId, is_deleted: false },
  });
  if (!doc) return null;

  await doc.update({
    status: normalizedStatus,
    admin_remark: admin_remark ?? doc.admin_remark,
    verified_by: verifierId || null,
    verified_at: new Date(),
    updated_by: verifierId || null,
    updatedAt: new Date(),
  });

  return doc.toJSON();
};

export const listAllKycRules = async ({ category_id } = {}) => {
  await ensureBusinessKycReady();
  const where = { is_deleted: false };
  if (category_id !== undefined && category_id !== null && category_id !== '') {
    where.category_id = Number(category_id);
  }
  const rules = await BusinessCategoryKycRule.findAll({
    where,
    include: [{ model: BusinessCategory, as: 'category', attributes: ['id', 'name'], required: false }],
    order: [['layer', 'ASC'], ['display_order', 'ASC'], ['id', 'ASC']],
  });
  return rules.map((r) => ({
    ...serializeKycRule(r, {}),
    category_name: r.category?.name || null,
  }));
};

export const createKycRule = async (data = {}, adminUserId = null) => {
  await ensureBusinessKycReady();
  const docCode = String(data.doc_code || data.code || data.title || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/(^_|_$)/g, '');
  if (!docCode || !data.title) {
    const err = new Error('doc_code and title are required');
    err.statusCode = 400;
    throw err;
  }
  const layer = data.layer === 'common' ? 'common' : 'category';
  const categoryId = layer === 'common' ? null : (data.category_id ? Number(data.category_id) : null);

  const created = await BusinessCategoryKycRule.create({
    doc_code: docCode,
    title: String(data.title).trim(),
    description: data.description || null,
    help_text: data.help_text || null,
    layer,
    category_id: categoryId,
    category_name_pattern: data.category_name_pattern || null,
    is_mandatory: data.is_mandatory !== undefined ? toBool(data.is_mandatory, true) : true,
    needs_number: toBool(data.needs_number, false),
    number_label: data.number_label || null,
    number_placeholder: data.number_placeholder || null,
    number_regex: data.number_regex || null,
    requires_expiry: toBool(data.requires_expiry, false),
    needs_file: data.needs_file !== undefined ? toBool(data.needs_file, true) : true,
    allowed_mime_types: Array.isArray(data.allowed_mime_types) ? data.allowed_mime_types : DEFAULT_MIME_TYPES,
    max_file_size_bytes: Number(data.max_file_size_bytes || 10 * 1024 * 1024),
    condition_key: data.condition_key || null,
    condition_value: data.condition_value || null,
    display_order: Number(data.display_order || 20),
    is_active: data.is_active !== undefined ? toBool(data.is_active, true) : true,
    created_by: adminUserId,
    created_at: new Date(),
    updatedAt: new Date(),
  });

  return serializeKycRule(created, {});
};

export const updateKycRule = async (ruleId, data = {}, adminUserId = null) => {
  await ensureBusinessKycReady();
  const rule = await BusinessCategoryKycRule.findOne({
    where: { id: ruleId, is_deleted: false },
  });
  if (!rule) return null;

  const updates = { updated_by: adminUserId, updatedAt: new Date() };
  const fields = [
    'title',
    'description',
    'help_text',
    'layer',
    'category_id',
    'category_name_pattern',
    'number_label',
    'number_placeholder',
    'number_regex',
    'condition_key',
    'condition_value',
  ];
  for (const f of fields) {
    if (data[f] !== undefined) updates[f] = data[f];
  }
  if (data.is_mandatory !== undefined) updates.is_mandatory = toBool(data.is_mandatory, true);
  if (data.needs_number !== undefined) updates.needs_number = toBool(data.needs_number, false);
  if (data.requires_expiry !== undefined) updates.requires_expiry = toBool(data.requires_expiry, false);
  if (data.needs_file !== undefined) updates.needs_file = toBool(data.needs_file, true);
  if (data.is_active !== undefined) updates.is_active = toBool(data.is_active, true);
  if (data.display_order !== undefined) updates.display_order = Number(data.display_order);

  await rule.update(updates);
  return serializeKycRule(rule, {});
};

export const deleteKycRule = async (ruleId, adminUserId = null) => {
  await ensureBusinessKycReady();
  const rule = await BusinessCategoryKycRule.findOne({
    where: { id: ruleId, is_deleted: false },
  });
  if (!rule) return null;
  await rule.update({
    is_deleted: true,
    is_active: false,
    updated_by: adminUserId,
    updatedAt: new Date(),
  });
  return true;
};

export const listApplicationsForAdmin = async ({ status, category_id, search } = {}) => {
  await ensureBusinessKycReady();
  const where = { is_deleted: false };
  if (status && status !== 'all') {
    where.verification_status = String(status).toLowerCase();
  }
  if (category_id) {
    where.category_id = Number(category_id);
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    where[Op.or] = [
      { businessName: { [Op.like]: q } },
      { owner_name: { [Op.like]: q } },
      { phone: { [Op.like]: q } },
      { city_name: { [Op.like]: q } },
      { locality_name: { [Op.like]: q } },
    ];
  }

  const profiles = await BusinessProfile.findAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['userId', 'userName', 'email', 'phone'], required: false },
      { model: BusinessCategory, as: 'category', attributes: ['id', 'name'], required: false },
      {
        model: BusinessDocument,
        as: 'documents',
        where: { is_deleted: false },
        required: false,
      },
    ],
    order: [['id', 'DESC']],
    limit: 100,
  });

  return profiles.map((p) => {
    const j = p.toJSON();
    const sortedDocs = (Array.isArray(j.documents) ? [...j.documents] : []).sort((a, b) => {
      const layerRank = (val) => (String(val || '').toLowerCase() === 'common' ? 0 : 1);
      const diff = layerRank(a.layer) - layerRank(b.layer);
      return diff !== 0 ? diff : Number(a.id || 0) - Number(b.id || 0);
    });
    return {
      id: j.id,
      business_name: j.businessName,
      category_id: j.category_id,
      category: j.category?.name || j.serviceCategory || 'General',
      owner_name: j.owner_name || j.user?.userName || 'Business Owner',
      phone: j.phone || j.user?.phone || '',
      email: j.email || j.user?.email || '',
      address: j.address || '',
      locality_name: j.locality_name || '',
      city_name: j.city_name || '',
      pincode: j.pincode || '',
      latitude: j.latitude ? Number(j.latitude) : 25.5941,
      longitude: j.longitude ? Number(j.longitude) : 85.1376,
      logo_url: j.logo_url || null,
      legal_entity_type: j.legal_entity_type || 'proprietorship',
      pan_number: j.pan_number || null,
      gstin: j.gstin || null,
      gst_exempt: Boolean(j.gst_exempt),
      sells_branded_goods: Boolean(j.sells_branded_goods),
      bank_account_name: j.bank_account_name || null,
      bank_account_number: j.bank_account_number || null,
      bank_ifsc: j.bank_ifsc || null,
      upi_id: j.upi_id || null,
      verification_status: j.verification_status || (j.is_verified ? 'approved' : 'pending'),
      is_verified: Boolean(j.is_verified),
      rejection_reason: j.rejection_reason || j.remark || null,
      submitted_at: j.submitted_at || j.created_at || null,
      reviewed_at: j.reviewed_at || null,
      documents: sortedDocs,
    };
  });
};

