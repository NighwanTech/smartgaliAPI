import sequelize from '../../src/config/db.js';
import { DataTypes } from 'sequelize';

export const version = '028-service-bookings-razorpay-payment';

const ensureColumn = async (queryInterface, table, column, definition) => {
  try {
    const desc = await queryInterface.describeTable(table);
    if (!desc[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.log(`  Added column ${column} to ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureColumn ${column} on ${table}:`, err.message);
  }
};

const ensureIndex = async (queryInterface, table, fields, indexName) => {
  try {
    const indexes = await queryInterface.showIndex(table);
    const exists = indexes.some((idx) => idx.name === indexName);
    if (!exists) {
      await queryInterface.addIndex(table, fields, { name: indexName });
      console.log(`  Added index ${indexName} on ${table}`);
    }
  } catch (err) {
    console.warn(`  [WARN] ensureIndex ${indexName} on ${table}:`, err.message);
  }
};

export const up = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log(`[${version}] UP: Adding Razorpay payment & refund columns to service_bookings...`);

  await ensureColumn(queryInterface, 'service_bookings', 'payment_mode', {
    type: DataTypes.STRING(30),
    allowNull: true,
    defaultValue: 'cod',
  });

  await ensureColumn(queryInterface, 'service_bookings', 'payment_status', {
    type: DataTypes.STRING(30),
    allowNull: true,
    defaultValue: 'pending',
  });

  await ensureColumn(queryInterface, 'service_bookings', 'razorpay_order_id', {
    type: DataTypes.STRING(100),
    allowNull: true,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'razorpay_payment_id', {
    type: DataTypes.STRING(100),
    allowNull: true,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'razorpay_signature', {
    type: DataTypes.STRING(255),
    allowNull: true,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'paid_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'refund_id', {
    type: DataTypes.STRING(100),
    allowNull: true,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'refund_amount', {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0.00,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'refund_status', {
    type: DataTypes.STRING(50),
    allowNull: true,
  });

  await ensureColumn(queryInterface, 'service_bookings', 'refund_reason', {
    type: DataTypes.TEXT,
    allowNull: true,
  });

  await ensureIndex(queryInterface, 'service_bookings', ['razorpay_order_id'], 'service_bookings_rzp_order_idx');
  await ensureIndex(queryInterface, 'service_bookings', ['razorpay_payment_id'], 'service_bookings_rzp_payment_idx');
  await ensureIndex(queryInterface, 'service_bookings', ['payment_status'], 'service_bookings_payment_status_idx');

  console.log(`[${version}] UP complete.`);
};

export const down = async ({ queryInterface = sequelize.getQueryInterface() } = {}) => {
  console.log(`[${version}] DOWN...`);
};

if (process.argv[1]?.endsWith('028-service-bookings-razorpay-payment.js')) {
  up()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
