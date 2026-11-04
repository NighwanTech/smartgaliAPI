import sequelize, { connectDB } from '../src/config/db.js';

async function check() {
  await connectDB();
  const [rows] = await sequelize.query('SELECT id, user_id, label, address_type, flat_unit, building_name, street_address, locality, city, district, state, pincode, latitude, longitude, is_default, is_active, is_deleted FROM user_addresses');
  console.table(rows);
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });
