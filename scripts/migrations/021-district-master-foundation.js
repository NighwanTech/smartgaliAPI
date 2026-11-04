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

  console.log('[021-district-master-foundation] UP...');

  // 1. Create districts master table
  if (!has('districts')) {
    console.log('  Creating table districts...');
    await queryInterface.createTable('districts', {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      state_id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: {
          model: 'states',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      district_name_english: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      district_name_local: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      normalized_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      lgd_district_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      district_census2011_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      source_system: {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: 'MANUAL',
      },
      source_last_updated: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      display_order: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      remark: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: DataTypes.NOW,
      },
      deletedRemarks: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    });
    console.log('  Created table districts successfully.');
  } else {
    console.log('  Table districts already exists.');
  }

  // 2. Add indexes on districts
  await ensureIndex(queryInterface, 'districts', ['state_id'], 'idx_districts_state_id');
  await ensureIndex(queryInterface, 'districts', ['lgd_district_code'], 'uniq_districts_lgd_code', { unique: true });
  await ensureIndex(queryInterface, 'districts', ['state_id', 'normalized_name'], 'idx_districts_state_normalized');
  await ensureIndex(queryInterface, 'districts', ['is_active', 'is_deleted'], 'idx_districts_status');

  // 3. Add district_id to cities (nullable for backward compatibility)
  if (has('cities')) {
    await ensureColumn(queryInterface, 'cities', 'district_id', {
      type: DataTypes.BIGINT,
      allowNull: true,
      references: {
        model: 'districts',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
    await ensureIndex(queryInterface, 'cities', ['district_id'], 'idx_cities_district_id');
  }

  console.log('[021-district-master-foundation] UP COMPLETE.');
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  const tables = await tableNames(queryInterface);
  const has = (t) => tables.includes(t);

  console.log('[021-district-master-foundation] DOWN...');

  if (has('cities')) {
    try {
      await queryInterface.removeIndex('cities', 'idx_cities_district_id');
      console.log('  Removed index idx_cities_district_id');
    } catch (_) {}
    try {
      await queryInterface.removeColumn('cities', 'district_id');
      console.log('  Removed column district_id from cities');
    } catch (_) {}
  }

  if (has('districts')) {
    await queryInterface.dropTable('districts');
    console.log('  Dropped table districts');
  }

  console.log('[021-district-master-foundation] DOWN COMPLETE.');
};

// Direct script execution support
if (process.argv[1]?.endsWith('021-district-master-foundation.js')) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

