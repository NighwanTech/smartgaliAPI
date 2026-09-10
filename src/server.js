import http from 'http';
import app from './app.js';
import env from './config/env.js';
import { connectDB } from './config/db.js';
import { initSocket } from './socket/socket.handler.js';

const startServer = async () => {
  try {
    // 1. Connect to Database
    await connectDB();

    // 2. Create HTTP Server & Initialize Socket.IO
    const server = http.createServer(app);
    initSocket(server);

    // 3. Start Listening
    server.listen(env.port, () => {
      console.log(`🚀 Server is running in ${env.nodeEnv} mode on port ${env.port}`);
    });

  } catch (error) {
    console.error('❌ Failed to start the server:', error);
    process.exit(1);
  }
};

startServer();

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
  // In production, you might want to gracefully shutdown the server here
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`Uncaught Exception: ${err.message}`);
  // In production, you might want to gracefully shutdown the server here
});
