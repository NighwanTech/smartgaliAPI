import sequelize from '../../src/config/db.js';

const ensureIndex = async (queryInterface, table, fields, name, options = {}) => {
  try {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((idx) => idx.name === name);
    if (!exists) {
      await queryInterface.addIndex(table, fields, { name, ...options });
      console.log(`  Added index ${name} on ${table}`);
    } else {
      console.log(`  Index ${name} already exists on ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureIndex ${name} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[024-coverage-and-discovery-performance-indexes] UP...');

  await ensureIndex(
    queryInterface,
    'service_coverage_areas',
    ['service_id', 'is_active', 'is_deleted'],
    'idx_sca_service_active'
  );

  await ensureIndex(
    queryInterface,
    'service_coverage_areas',
    ['city_id', 'is_active', 'is_deleted'],
    'idx_sca_city_active'
  );

  await ensureIndex(
    queryInterface,
    'service_coverage_areas',
    ['locality_id', 'is_active', 'is_deleted'],
    'idx_sca_locality_active'
  );

  await ensureIndex(
    queryInterface,
    'service_coverage_areas',
    ['pincode_id', 'is_active', 'is_deleted'],
    'idx_sca_pincode_active'
  );

  await ensureIndex(
    queryInterface,
    'service_coverage_areas',
    ['coverage_method', 'coverage_scope'],
    'idx_sca_method_scope'
  );

  console.log('[024-coverage-and-discovery-performance-indexes] UP completed successfully.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log('[024-coverage-and-discovery-performance-indexes] DOWN...');
  try {
    await queryInterface.removeIndex('service_coverage_areas', 'idx_sca_service_active');
    await queryInterface.removeIndex('service_coverage_areas', 'idx_sca_city_active');
    await queryInterface.removeIndex('service_coverage_areas', 'idx_sca_locality_active');
    await queryInterface.removeIndex('service_coverage_areas', 'idx_sca_pincode_active');
    await queryInterface.removeIndex('service_coverage_areas', 'idx_sca_method_scope');
  } catch (err) {
    console.warn('[024-coverage-and-discovery-performance-indexes] DOWN error:', err.message);
  }
};

