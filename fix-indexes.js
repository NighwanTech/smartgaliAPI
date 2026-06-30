import sequelize from './src/config/db.js';

async function fixIndexes() {
  try {
    const [results] = await sequelize.query('SHOW INDEX FROM roles WHERE Key_name LIKE "roleName%"');
    console.log(`Found ${results.length} indexes on roleName.`);
    
    // Drop all duplicate indexes (keeping the original one 'roleName' if needed, or just dropping the numbered ones)
    for (let i = 0; i < results.length; i++) {
      const indexName = results[i].Key_name;
      // Usually Sequelize creates them as roleName_2, roleName_3 etc.
      if (indexName !== 'roleName' && indexName !== 'PRIMARY') {
        console.log(`Dropping extra index: ${indexName}`);
        await sequelize.query(`ALTER TABLE roles DROP INDEX ${indexName}`);
      }
    }
    console.log('✅ Sabhi extra indexes delete ho gaye!');
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

fixIndexes();
