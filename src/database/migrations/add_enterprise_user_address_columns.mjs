import sequelize, { connectDB } from '../../config/db.js';

export async function up() {
  await connectDB();
  const queryInterface = sequelize.getQueryInterface();

  console.log('>>> Auditing user_addresses columns...');
  const [cols] = await sequelize.query('DESCRIBE user_addresses');
  const existingCols = new Set(cols.map(c => c.Field));

  // 1. Add missing columns safely
  const columnsToAdd = [
    {
      name: 'address_type',
      sql: "ALTER TABLE `user_addresses` ADD COLUMN `address_type` ENUM('HOME', 'OFFICE', 'OTHER') NOT NULL DEFAULT 'HOME' AFTER `user_id`",
    },
    {
      name: 'flat_unit',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `flat_unit` VARCHAR(100) NULL AFTER `address_type`',
    },
    {
      name: 'building_name',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `building_name` VARCHAR(200) NULL AFTER `flat_unit`',
    },
    {
      name: 'street_address',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `street_address` TEXT NULL AFTER `building_name`',
    },
    {
      name: 'locality',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `locality` VARCHAR(150) NULL AFTER `street_address`',
    },
    {
      name: 'district',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `district` VARCHAR(100) NULL AFTER `city`',
    },
    {
      name: 'state',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `state` VARCHAR(100) NULL AFTER `district`',
    },
    {
      name: 'pincode',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `pincode` VARCHAR(20) NULL AFTER `state`',
    },
    {
      name: 'society_id',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `society_id` BIGINT NULL AFTER `pincode`',
    },
    {
      name: 'updated_at',
      sql: 'ALTER TABLE `user_addresses` ADD COLUMN `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`',
    },
  ];

  for (const col of columnsToAdd) {
    if (!existingCols.has(col.name)) {
      console.log(`Adding column: ${col.name}`);
      await sequelize.query(col.sql);
    } else {
      console.log(`Column ${col.name} already exists. Skipping.`);
    }
  }

  // 2. Safe Backfill for existing records
  console.log('>>> Backfilling existing address records...');
  await sequelize.query(`
    UPDATE user_addresses
    SET 
      address_type = CASE 
        WHEN UPPER(IFNULL(label, '')) LIKE '%OFFICE%' THEN 'OFFICE'
        WHEN UPPER(IFNULL(label, '')) LIKE '%OTHER%' THEN 'OTHER'
        ELSE 'HOME'
      END,
      flat_unit = IFNULL(flat_unit, house_no),
      street_address = IFNULL(street_address, street),
      building_name = IFNULL(building_name, landmark),
      updated_at = IFNULL(updated_at, updatedAt)
    WHERE is_deleted = 0 OR is_deleted = 1
  `);

  // 3. Add Indexes safely
  console.log('>>> Auditing indexes...');
  const [indexes] = await sequelize.query('SHOW INDEX FROM user_addresses');
  const existingIndexes = new Set(indexes.map(i => i.Key_name));

  if (!existingIndexes.has('idx_user_addresses_society_id')) {
    console.log('Adding index: idx_user_addresses_society_id');
    await sequelize.query('ALTER TABLE `user_addresses` ADD INDEX `idx_user_addresses_society_id` (`society_id`)');
  }

  if (!existingIndexes.has('idx_user_addresses_user_active_default')) {
    console.log('Adding index: idx_user_addresses_user_active_default');
    await sequelize.query('ALTER TABLE `user_addresses` ADD INDEX `idx_user_addresses_user_active_default` (`user_id`, `is_deleted`, `is_active`, `is_default`)');
  }

  if (!existingIndexes.has('idx_user_addresses_user_lookup')) {
    console.log('Adding index: idx_user_addresses_user_lookup');
    await sequelize.query('ALTER TABLE `user_addresses` ADD INDEX `idx_user_addresses_user_lookup` (`user_id`, `is_deleted`, `is_active`)');
  }

  console.log('>>> Migration completed successfully.');
}

if (process.argv[1].endsWith('add_enterprise_user_address_columns.mjs')) {
  up()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

