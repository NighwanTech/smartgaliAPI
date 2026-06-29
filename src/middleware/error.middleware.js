import { errorResponse } from '../utils/response.js';
import env from '../config/env.js';

/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error for debugging in development
  if (env.nodeEnv === 'development') {
    console.error(`[Error] ${err.message}`, err.stack);
  }

  // Handle specific known errors (e.g., Sequelize, JWT)
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    const errors = err.errors.map(e => e.message);
    return errorResponse(res, 400, 'Validation Error', errors);
  }

  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 401, 'Invalid token.');
  }

  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 401, 'Token expired.');
  }

  return errorResponse(res, statusCode, message, env.nodeEnv === 'development' ? err.stack : null);
};

/**
 * Catch 404 Not Found errors
 */
export const notFoundHandler = (req, res, next) => {
  const err = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
};
