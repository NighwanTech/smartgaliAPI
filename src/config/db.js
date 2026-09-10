import { Sequelize } from 'sequelize';
import env from './env.js';

// Initialize Sequelize instance with environment configurations
const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  dialect: 'mysql',
  port: env.db.port,
  logging: env.nodeEnv === 'development' ? console.log : false,
  timezone: '+05:30',
  dialectOptions: {
    dateStrings: true,
    typeCast: true,
    connectTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  },
  pool: {
    max: 20,
    min: 2,
    acquire: 60000,
    idle: 30000,
    evict: 10000,
  },
});

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully.');
    
    // Sync models (in production, use migrations instead of sync)
    // Temporarily disabled alter: true to fix "Too many keys specified" error
    await sequelize.sync({ alter: false });
    console.log('✅ Models synchronized.');
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    process.exit(1);
  }
};

export default sequelize;
