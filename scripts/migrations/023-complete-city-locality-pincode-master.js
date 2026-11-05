import { DataTypes } from 'sequelize';
import sequelize from '../../src/config/db.js';

const tableNames = async (queryInterface) => {
  if (typeof queryInterface.showAllTables === 'function') {
    const raw = await queryInterface.showAllTables();
    return raw.map((item) => (typeof item === 'string' ? item : item.tableName || item.name));
  }
  return [];
};

const ensureColumn = async (queryInterface, table, column, definition) => {
  try {
    const description = await queryInterface.describeTable(table);
    if (!description[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`  Added column ${column} to ${table}`);
    } else {
      console.log(`  Column ${column} already exists on ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureColumn ${column} on ${table}:`, err.message);
  }
};

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
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[023-complete-city-locality-pincode-master] UP...');

  // 1. Extend cities table
  if (has('cities')) {
    await ensureColumn(queryInterface, 'cities', 'city_name_local', {
      type: DataTypes.STRING(150),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'cities', 'lgd_local_body_code', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'cities', 'city_type', {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'MUNICIPAL_CORPORATION',
    });
    await ensureColumn(queryInterface, 'cities', 'source_system', {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'MANUAL',
    });
    await ensureColumn(queryInterface, 'cities', 'source_last_updated', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await ensureIndex(queryInterface, 'cities', ['district_id'], 'idx_cities_district_id');
    await ensureIndex(queryInterface, 'cities', ['state_id', 'normalized_name'], 'idx_cities_state_norm');
    await ensureIndex(queryInterface, 'cities', ['is_active', 'is_deleted'], 'idx_cities_status');

    // Safe backfill: Map existing Patna city (id: 1) to Patna District (id: 41) if null
    try {
      const [patnaDistrict] = await sequelize.query(
        "SELECT id FROM districts WHERE district_name_english = 'Patna' AND is_deleted = false LIMIT 1"
      );
      if (patnaDistrict && patnaDistrict.length > 0) {
        const pDistId = patnaDistrict[0].id;
        await sequelize.query(
          `UPDATE cities SET district_id = ${pDistId} WHERE name = 'Patna' AND district_id IS NULL`
        );
        console.log(`  Backfilled Patna city -> district_id ${pDistId}`);
      }
    } catch (e) {
      console.warn('  [WARN] Patna backfill error:', e.message);
    }
  }

  // 2. Extend localities table
  if (has('localities')) {
    await ensureColumn(queryInterface, 'localities', 'locality_name_local', {
      type: DataTypes.STRING(150),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'localities', 'locality_type', {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'URBAN_AREA',
    });
    await ensureColumn(queryInterface, 'localities', 'source_system', {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'MANUAL',
    });
    await ensureColumn(queryInterface, 'localities', 'source_reference_code', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });

    await ensureIndex(queryInterface, 'localities', ['city_id', 'normalized_name'], 'idx_localities_city_norm');
    await ensureIndex(queryInterface, 'localities', ['is_active', 'is_deleted'], 'idx_localities_status');
  }

  // 3. Extend pincodes table
  if (has('pincodes')) {
    await ensureColumn(queryInterface, 'pincodes', 'state_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'states', key: 'id' },
    });
    await ensureColumn(queryInterface, 'pincodes', 'district_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'districts', key: 'id' },
    });
    await ensureColumn(queryInterface, 'pincodes', 'source_system', {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'MANUAL',
    });
    await ensureColumn(queryInterface, 'pincodes', 'source_last_updated', {
      type: DataTypes.DATE,
      allowNull: true,
    });

    await ensureIndex(queryInterface, 'pincodes', ['pincode'], 'idx_pincodes_code');
    await ensureIndex(queryInterface, 'pincodes', ['city_id', 'pincode'], 'idx_pincodes_city_code');
    await ensureIndex(queryInterface, 'pincodes', ['is_active', 'is_deleted'], 'idx_pincodes_status');

    // Safe backfill: Set state_id = 1 and district_id = 41 for Patna pincodes
    try {
      await sequelize.query(
        "UPDATE pincodes SET state_id = 1, district_id = 41 WHERE city_id = 1 AND (state_id IS NULL OR district_id IS NULL)"
      );
      console.log('  Backfilled Patna pincodes -> state_id: 1, district_id: 41');
    } catch (e) {
      console.warn('  [WARN] Pincode backfill error:', e.message);
    }
  }

  // 4. Create locality_pincodes junction table for many-to-many relationship
  if (!has('locality_pincodes')) {
    console.log('  Creating locality_pincodes table...');
    await queryInterface.createTable('locality_pincodes', {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      locality_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'localities', key: 'id' },
        onDelete: 'CASCADE',
      },
      pincode_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'pincodes', key: 'id' },
        onDelete: 'CASCADE',
      },
      is_primary: { type: DataTypes.BOOLEAN, defaultValue: true },
      source_system: { type: DataTypes.STRING(50), defaultValue: 'MANUAL' },
      created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    });

    await ensureIndex(queryInterface, 'locality_pincodes', ['locality_id', 'pincode_id'], 'uniq_loc_pin', { unique: true });
    await ensureIndex(queryInterface, 'locality_pincodes', ['pincode_id'], 'idx_loc_pin_pincode');
    console.log('  Created locality_pincodes table with indexes.');

    // Safe backfill from existing pincodes.locality_id
    try {
      await sequelize.query(`
        INSERT IGNORE INTO locality_pincodes (locality_id, pincode_id, is_primary, source_system, created_at, updatedAt)
        SELECT locality_id, id, 1, 'MANUAL', NOW(), NOW()
        FROM pincodes
        WHERE locality_id IS NOT NULL AND is_deleted = false
      `);
      console.log('  Backfilled locality_pincodes mappings from legacy pincodes table.');
    } catch (e) {
      console.warn('  [WARN] locality_pincodes backfill note:', e.message);
    }
  }

  // 5. Alter dataset_type ENUM in location_import_batches & location_staged_records
  try {
    console.log('  Extending dataset_type ENUM in import tables...');
    await sequelize.query(`
      ALTER TABLE location_import_batches 
      MODIFY COLUMN dataset_type ENUM('STATE', 'DISTRICT', 'CITY', 'LOCALITY', 'PINCODE', 'POST_OFFICE') NOT NULL
    `);
    await sequelize.query(`
      ALTER TABLE location_staged_records 
      MODIFY COLUMN dataset_type ENUM('STATE', 'DISTRICT', 'CITY', 'LOCALITY', 'PINCODE', 'POST_OFFICE') NOT NULL
    `);
    console.log('  Successfully altered dataset_type ENUMs.');
  } catch (e) {
    console.warn('  [WARN] Alter ENUM note:', e.message);
  }

  // 6. Extend user_addresses table with optional ID references
  if (has('user_addresses')) {
    await ensureColumn(queryInterface, 'user_addresses', 'state_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'states', key: 'id' },
    });
    await ensureColumn(queryInterface, 'user_addresses', 'district_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'districts', key: 'id' },
    });
    await ensureColumn(queryInterface, 'user_addresses', 'city_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'cities', key: 'id' },
    });
    await ensureColumn(queryInterface, 'user_addresses', 'locality_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'localities', key: 'id' },
    });
    await ensureColumn(queryInterface, 'user_addresses', 'pincode_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: { model: 'pincodes', key: 'id' },
    });
  }

  console.log('[023-complete-city-locality-pincode-master] UP Completed.');
};

export const down = async () => {
  console.log('[023-complete-city-locality-pincode-master] DOWN no-op for data preservation.');
};

export default { up, down };

