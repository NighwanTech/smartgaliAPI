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

  console.log('[022-location-lgd-bulk-import-engine] UP...');

  // 1. Add LGD fields to states table (nullable for safe backward compatibility)
  if (has('states')) {
    await ensureColumn(queryInterface, 'states', 'lgd_state_code', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'states', 'state_name_local', {
      type: DataTypes.STRING(150),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'states', 'state_census2011_code', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'states', 'state_or_ut', {
      type: DataTypes.STRING(50),
      allowNull: true,
    });
    await ensureColumn(queryInterface, 'states', 'source_system', {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: 'MANUAL',
    });
    await ensureColumn(queryInterface, 'states', 'source_last_updated', {
      type: DataTypes.DATE,
      allowNull: true,
    });
    await ensureIndex(queryInterface, 'states', ['lgd_state_code'], 'uniq_states_lgd_code', { unique: true });
  }

  // 2. Create location_import_batches table
  if (!has('location_import_batches')) {
    console.log('  Creating table location_import_batches...');
    await queryInterface.createTable('location_import_batches', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      batch_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      dataset_type: {
        type: DataTypes.ENUM('STATE', 'DISTRICT'),
        allowNull: false,
      },
      file_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      file_size_bytes: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
      },
      file_hash: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('STAGED', 'VALIDATED', 'CONFIRMED', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'STAGED',
      },
      total_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      valid_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      invalid_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      new_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      existing_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      updated_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      skipped_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      failed_rows: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      uploaded_by: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'userId' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      confirmed_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
        references: { model: 'users', key: 'userId' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      error_summary: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      error_report: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('  Created table location_import_batches successfully.');
  }

  await ensureIndex(queryInterface, 'location_import_batches', ['batch_id'], 'uniq_lib_batch_id', { unique: true });
  await ensureIndex(queryInterface, 'location_import_batches', ['dataset_type', 'status'], 'idx_lib_dataset_status');
  await ensureIndex(queryInterface, 'location_import_batches', ['uploaded_by'], 'idx_lib_uploaded_by');

  // 3. Create location_staged_records table
  if (!has('location_staged_records')) {
    console.log('  Creating table location_staged_records...');
    await queryInterface.createTable('location_staged_records', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      batch_id: {
        type: DataTypes.STRING(100),
        allowNull: false,
        references: { model: 'location_import_batches', key: 'batch_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      dataset_type: {
        type: DataTypes.ENUM('STATE', 'DISTRICT'),
        allowNull: false,
      },
      row_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      raw_data: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      parsed_data: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      action: {
        type: DataTypes.ENUM('INSERT', 'UPDATE', 'SKIP', 'ERROR'),
        allowNull: false,
        defaultValue: 'INSERT',
      },
      validation_status: {
        type: DataTypes.ENUM('VALID', 'INVALID'),
        allowNull: false,
        defaultValue: 'VALID',
      },
      validation_errors: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      import_status: {
        type: DataTypes.ENUM('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      matched_entity_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
    console.log('  Created table location_staged_records successfully.');
  }

  await ensureIndex(queryInterface, 'location_staged_records', ['batch_id', 'row_number'], 'idx_lsr_batch_row');
  await ensureIndex(queryInterface, 'location_staged_records', ['batch_id', 'validation_status'], 'idx_lsr_batch_val');
  await ensureIndex(queryInterface, 'location_staged_records', ['batch_id', 'import_status'], 'idx_lsr_batch_imp');

  console.log('[022-location-lgd-bulk-import-engine] UP COMPLETE.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[022-location-lgd-bulk-import-engine] DOWN...');

  if (has('location_staged_records')) {
    await queryInterface.dropTable('location_staged_records');
    console.log('  Dropped table location_staged_records');
  }

  if (has('location_import_batches')) {
    await queryInterface.dropTable('location_import_batches');
    console.log('  Dropped table location_import_batches');
  }

  console.log('[022-location-lgd-bulk-import-engine] DOWN COMPLETE.');
};

if (process.argv[1]?.endsWith('022-location-lgd-bulk-import-engine.js')) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

