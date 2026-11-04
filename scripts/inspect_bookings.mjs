import sequelize, { connectDB } from '../src/config/db.js';

async function check() {
  await connectDB();
  const [cols] = await sequelize.query('DESCRIBE service_bookings');
  console.log(cols.map(c => c.Field));
  process.exit(0);
}

check().catch(e => { console.error(e); process.exit(1); });

