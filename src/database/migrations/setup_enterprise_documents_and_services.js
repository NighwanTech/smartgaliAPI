import sequelize from '../../config/db.js';

export const runEnterpriseMigration = async () => {
  console.log('🔄 Starting Enterprise Documents & Services migration...');

  try {
    // 1. service_bookings columns
    const [bookingCols] = await sequelize.query(`DESCRIBE service_bookings`);
    const existingBookingCols = new Set(bookingCols.map((c) => c.Field));

    if (!existingBookingCols.has('booking_reference')) {
      console.log('➕ Adding booking_reference to service_bookings...');
      await sequelize.query(`ALTER TABLE service_bookings ADD COLUMN booking_reference VARCHAR(100) NULL AFTER user_id`);
    }

    if (!existingBookingCols.has('time_slot')) {
      console.log('➕ Adding time_slot to service_bookings...');
      await sequelize.query(`ALTER TABLE service_bookings ADD COLUMN time_slot VARCHAR(100) NULL AFTER scheduled_at`);
    }

    if (!existingBookingCols.has('service_address')) {
      console.log('➕ Adding service_address to service_bookings...');
      await sequelize.query(`ALTER TABLE service_bookings ADD COLUMN service_address TEXT NULL AFTER time_slot`);
    }

    if (!existingBookingCols.has('notes')) {
      console.log('➕ Adding notes to service_bookings...');
      await sequelize.query(`ALTER TABLE service_bookings ADD COLUMN notes TEXT NULL AFTER service_address`);
    }

    if (!existingBookingCols.has('cancellation_reason')) {
      console.log('➕ Adding cancellation_reason to service_bookings...');
      await sequelize.query(`ALTER TABLE service_bookings ADD COLUMN cancellation_reason TEXT NULL AFTER notes`);
    }

    // Relax status enum/type to varchar(50)
    await sequelize.query(`ALTER TABLE service_bookings MODIFY COLUMN status VARCHAR(50) DEFAULT 'pending'`);

    // 2. society_documents columns
    const [docCols] = await sequelize.query(`DESCRIBE society_documents`);
    const existingDocCols = new Set(docCols.map((c) => c.Field));

    if (!existingDocCols.has('document_number')) {
      console.log('➕ Adding document_number to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN document_number VARCHAR(100) NULL AFTER title`);
    }

    if (!existingDocCols.has('version')) {
      console.log('➕ Adding version to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN version VARCHAR(50) DEFAULT '1.0' AFTER document_number`);
    }

    if (!existingDocCols.has('priority')) {
      console.log('➕ Adding priority to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN priority VARCHAR(50) DEFAULT 'normal' AFTER category`);
    }

    if (!existingDocCols.has('visibility')) {
      console.log('➕ Adding visibility to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN visibility VARCHAR(50) DEFAULT 'all' AFTER priority`);
    }

    if (!existingDocCols.has('allowed_roles')) {
      console.log('➕ Adding allowed_roles to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN allowed_roles TEXT NULL AFTER visibility`);
    }

    if (!existingDocCols.has('tags')) {
      console.log('➕ Adding tags to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN tags TEXT NULL AFTER allowed_roles`);
    }

    if (!existingDocCols.has('requires_approval')) {
      console.log('➕ Adding requires_approval to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN requires_approval TINYINT(1) DEFAULT 0 AFTER tags`);
    }

    if (!existingDocCols.has('acknowledgement_required')) {
      console.log('➕ Adding acknowledgement_required to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN acknowledgement_required TINYINT(1) DEFAULT 0 AFTER requires_approval`);
    }

    if (!existingDocCols.has('effective_from')) {
      console.log('➕ Adding effective_from to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN effective_from DATETIME NULL AFTER acknowledgement_required`);
    }

    if (!existingDocCols.has('expiry_date')) {
      console.log('➕ Adding expiry_date to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN expiry_date DATETIME NULL AFTER effective_from`);
    }

    if (!existingDocCols.has('scheduled_publish_at')) {
      console.log('➕ Adding scheduled_publish_at to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN scheduled_publish_at DATETIME NULL AFTER expiry_date`);
    }

    if (!existingDocCols.has('status')) {
      console.log('➕ Adding status to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN status VARCHAR(50) DEFAULT 'published' AFTER scheduled_publish_at`);
    }

    if (!existingDocCols.has('is_official')) {
      console.log('➕ Adding is_official to society_documents...');
      await sequelize.query(`ALTER TABLE society_documents ADD COLUMN is_official TINYINT(1) DEFAULT 1 AFTER status`);
    }

    // 3. Create society_document_versions table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS society_document_versions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        document_id BIGINT NOT NULL,
        society_id BIGINT NOT NULL,
        version VARCHAR(50) NOT NULL DEFAULT '1.0',
        title VARCHAR(255) NOT NULL,
        file_url VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NULL,
        file_size BIGINT NULL,
        change_summary TEXT NULL,
        created_by BIGINT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_doc_version (document_id, version),
        INDEX idx_society_version (society_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create society_document_acknowledgements table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS society_document_acknowledgements (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        document_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        version VARCHAR(50) NOT NULL DEFAULT '1.0',
        acknowledged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_doc_user (document_id, user_id),
        INDEX idx_user_ack (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Create resident_documents table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS resident_documents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        society_id BIGINT NOT NULL,
        owner_id BIGINT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        document_type VARCHAR(100) NOT NULL DEFAULT 'other',
        flat_number VARCHAR(50) NULL,
        file_url VARCHAR(500) NOT NULL,
        file_type VARCHAR(50) NULL,
        file_size BIGINT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'private',
        rejection_reason TEXT NULL,
        verified_by BIGINT NULL,
        verified_at DATETIME NULL,
        is_deleted TINYINT(1) DEFAULT 0,
        deleted_remarks TEXT NULL,
        created_by BIGINT NULL,
        updated_by BIGINT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_res_soc (society_id),
        INDEX idx_res_owner (owner_id),
        INDEX idx_res_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ Enterprise Documents & Services migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  }
};

if (process.argv[1]?.endsWith('setup_enterprise_documents_and_services.js')) {
  runEnterpriseMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
