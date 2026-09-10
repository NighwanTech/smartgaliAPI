import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { setupSwagger } from './swagger.js';

// Initialize express app
const app = express();

// Disable ETag generation to prevent 304 Not Modified responses on JSON API routes
app.set('etag', false);

// Global Middlewares
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
})); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON payloads
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded payloads
app.use(morgan('dev')); // HTTP request logger

// Setup Swagger UI Documentation
setupSwagger(app);

// Serve static files from uploads folder
app.use('/uploads', express.static('uploads'));
app.use('/uploads/avatars', (req, res) => {
  const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.send(transparentPng);
});
app.use('/uploads', (req, res) => {
  res.status(404).end();
});

// API Routes
app.use('/api/v1', routes);

// 404 Route Handler
app.use(notFoundHandler);

// Global Error Handler (must be the last middleware)
app.use(errorHandler);

export default app;
