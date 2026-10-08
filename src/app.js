import express from 'express';
import logger from '#config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { db } from '#config/database.js';
import authRoutes from '#routes/auth.routes.js';
import companyRoutes from '#routes/company.routes.js';
import dealStageRoutes from '#routes/deal-stage.routes.js';
import acquisitionRoutes from '#routes/acquisition.routes.js';
import securityMiddleware from '#middleware/security.middleware.js';
import requestIdMiddleware from '#middleware/request-id.middleware.js';
import errorHandler from '#middleware/error.middleware.js';

const app = express();

// Trust first proxy hop (Docker bridge, ALB, Nginx, Cloudflare)
app.set('trust proxy', 1);

// Establish request correlation for every inbound request
app.use(requestIdMiddleware);

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

// Structured HTTP request logging
if (process.env.NODE_ENV === 'production') {
  app.use(
    morgan(
      (tokens, req, res) => {
        return JSON.stringify({
          method: tokens.method(req, res),
          path: tokens.url(req, res),
          status: Number(tokens.status(req, res)),
          durationMs: Number(tokens['response-time'](req, res)),
          requestId: req.id || res.locals?.requestId,
          ip: tokens['remote-addr'](req, res),
          userAgent: tokens['user-agent'](req, res),
        });
      },
      {
        stream: {
          write: message => {
            try {
              const data = JSON.parse(message);
              logger.info(
                `HTTP ${data.method} ${data.path} ${data.status}`,
                data
              );
            } catch {
              logger.info(message.trim());
            }
          },
        },
      }
    )
  );
} else {
  app.use(
    morgan('combined', {
      stream: { write: message => logger.info(message.trim()) },
    })
  );
}

// -------------------------------------------------------------
// Health Probes (Defined before securityMiddleware to avoid bot/rate-limit blocking)
// -------------------------------------------------------------

// Lightweight liveness probe: process is running and responding
app.get('/health/live', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Deep readiness probe: verifies database connectivity
app.get('/health/ready', async (req, res) => {
  try {
    await db.execute('SELECT 1');
    res.status(200).json({
      status: 'READY',
      database: 'connected',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('Readiness probe database connection failed', {
      error: err.message,
    });
    res.status(503).json({
      status: 'NOT_READY',
      database: 'disconnected',
      error: err.message,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }
});

// Backward-compatible alias for existing /health checks
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// -------------------------------------------------------------
// Protected Application Routes
// -------------------------------------------------------------
app.use(securityMiddleware);

app.get('/', (req, res) => {
  logger.info('Hello from Acquisitions!');
  res.status(200).send('Hello from Acquisitions!');
});

app.get('/api', (req, res) => {
  res.status(200).json({ message: 'Acquisitions API is Running!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/deal-stages', dealStageRoutes);
app.use('/api/acquisitions', acquisitionRoutes);

// Centralized error handler
app.use(errorHandler);

export default app;
