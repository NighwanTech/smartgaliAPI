import sequelize, { connectDB } from '../src/config/db.js';

async function inspectTable() {
  await connectDB();
  const [cols] = await sequelize.query('DESCRIBE user_addresses');
  console.log('=== COLUMNS IN user_addresses ===');
  console.table(cols.map(c => ({
    Field: c.Field,
    Type: c.Type,
    Null: c.Null,
    Default: c.Default,
    Key: c.Key,
  })));

  const [indexes] = await sequelize.query('SHOW INDEX FROM user_addresses');
  console.log('\n=== INDEXES IN user_addresses ===');
  console.table(indexes.map(i => ({
    Key_name: i.Key_name,
    Column_name: i.Column_name,
    Non_unique: i.Non_unique,
  })));

  const [records] = await sequelize.query('SELECT * FROM user_addresses LIMIT 10');
  console.log('\n=== SAMPLE ROWS ===');
  console.log(records);

  process.exit(0);
}

inspectTable().catch(err => {
  console.error(err);
  process.exit(1);
});

