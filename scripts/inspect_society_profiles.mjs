import sequelize, { connectDB } from '../src/config/db.js';

async function check() {
  await connectDB();
  const [cols] = await sequelize.query('DESCRIBE society_profiles');
  console.log(cols.map(c => ({ Field: c.Field, Type: c.Type, Key: c.Key })));
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});

