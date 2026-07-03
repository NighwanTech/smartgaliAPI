import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { setupSwagger } from './swagger.js';

// Initialize express app
const app = express();

// Global Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false,
})); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON payloads
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded payloads
app.use(morgan('dev')); // HTTP request logger

// Setup Swagger UI Documentation
setupSwagger(app);

// Serve static files from uploads folder
app.use('/uploads', express.static('uploads'));

// API Routes
app.use('/api/v1', routes);

// 404 Route Handler
app.use(notFoundHandler);

// Global Error Handler (must be the last middleware)
app.use(errorHandler);

export default app;
