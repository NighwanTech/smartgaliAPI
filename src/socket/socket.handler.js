import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';

let io = null;
const onlineUsers = new Map(); // userId -> socketId

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Socket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      // Allow connection in dev mode with fallback, or verify token
      return next();
    }
    try {
      const decoded = jwt.verify(token, env.jwt.secret);
      socket.user = decoded;
      return next();
    } catch (err) {
      // Allow graceful connection in dev
      return next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`⚡ Socket client connected: ${socket.id}`);

    // Announce user presence online
    socket.on('user:online', (data) => {
      const userId = data?.userId || socket.user?.userId;
      if (userId) {
        onlineUsers.set(userId.toString(), socket.id);
        socket.userId = userId.toString();
        io.emit('presence:online', { userId });
        console.log(`👤 User online: ${userId}`);
      }
    });

    // Join a chat room
    socket.on('user:join:chat', (data) => {
      const chatId = data?.chatId;
      if (chatId) {
        socket.join(`chat_${chatId}`);
        console.log(`💬 Socket ${socket.id} joined room chat_${chatId}`);
      }
    });

    // Leave a chat room
    socket.on('user:leave:chat', (data) => {
      const chatId = data?.chatId;
      if (chatId) {
        socket.leave(`chat_${chatId}`);
      }
    });

    // Typing status
    socket.on('chat:typing', (data) => {
      const { chatId, isTyping } = data || {};
      if (chatId) {
        socket.to(`chat_${chatId}`).emit('chat:typing', {
          chatId,
          userId: socket.userId || data.userId,
          isTyping: isTyping === true,
        });
      }
    });

    // Message delivered status
    socket.on('message:delivered', (data) => {
      const { messageId, chatId } = data || {};
      if (chatId) {
        socket.to(`chat_${chatId}`).emit('message:delivered', { messageId, chatId });
      }
    });

    // Message read status
    socket.on('message:read', (data) => {
      const { messageId, chatId } = data || {};
      if (chatId) {
        socket.to(`chat_${chatId}`).emit('message:read', { messageId, chatId });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('presence:offline', { userId: socket.userId });
        console.log(`👤 User offline: ${socket.userId}`);
      }
      console.log(`⚡ Socket client disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Socket.IO Server initialized.');
  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO is not initialized');
  }
  return io;
};
