import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
import { createServer as createHTTPServer } from 'http';
import { createServer as createHTTPSServer } from 'https';
import compression from 'compression';

// Load environment variables
dotenv.config();

// Import middleware
import { corsMiddleware } from './middleware/cors';
import { helmetMiddleware, apiLimiter } from './middleware/security';
import { errorHandler, notFoundHandler, handleUncaughtException, handleUnhandledRejection } from './middleware/errorHandler';
import { correlationId, requestLogger } from './middleware/requestLogger';
import { httpsRedirect, securityHeaders, expectCT } from './middleware/httpsRedirect';
import logger from './utils/logger';

// Import routes
import authRoutes from './routes/auth';
import delegateRoutes from './routes/delegates';
import sessionRoutes from './routes/sessions';
import queueRoutes from './routes/queue';
import monitoringRoutes from './routes/monitoring';
import websocketMonitoringRoutes from './routes/websocket-monitoring';

// Import Socket.io initialization
import { initializeSocketServer, shutdownSocketServer } from './socket';

// Import HTTPS configuration
import { getHTTPSConfig, setupCertificateRenewalReminder, generateSelfSignedCert } from './config/https';

// Handle uncaught exceptions and rejections
handleUncaughtException();
handleUnhandledRejection();

// Create Express app
const app: Application = express();

// HTTPS Configuration
const httpsConfig = getHTTPSConfig();

// Create appropriate server based on HTTPS configuration
const httpServer = createHTTPServer(app);
let httpsServer: any = null;

if (httpsConfig.enabled && httpsConfig.options) {
  httpsServer = createHTTPSServer(httpsConfig.options, app);
  logger.info('HTTPS server configured');
  
  // Set up certificate renewal reminder
  setupCertificateRenewalReminder();
}

// Apply HTTPS redirect if configured
if (httpsConfig.redirectHTTP) {
  app.use(httpsRedirect);
}

// Security headers middleware
app.use(securityHeaders);
app.use(expectCT);

// Middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(correlationId);
app.use(requestLogger);
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    https: httpsConfig.enabled
  });
});

// API version endpoint
app.get('/api/v1', (_req: Request, res: Response) => {
  res.json({
    name: 'Convention Speaker List API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      sessions: '/api/v1/sessions',
      queue: '/api/v1/queue',
      delegates: '/api/v1/delegates',
      analytics: '/api/v1/analytics',
      monitoring: '/api/v1/monitoring'
    },
    secure: httpsConfig.enabled
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/delegates', delegateRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/queue', queueRoutes);
app.use('/api/v1/monitoring', monitoringRoutes);
app.use('/api/v1/monitoring/websocket', websocketMonitoringRoutes);

// Error handling middleware (must be after routes)
app.use(errorHandler);

// 404 handler (must be last)
app.use(notFoundHandler);

// Start server with async initialization
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = httpsConfig.port;

async function startServer() {
  try {
    // Generate self-signed certificates for development if needed
    if (process.env.NODE_ENV === 'development' && process.env.GENERATE_SELF_SIGNED === 'true') {
      await generateSelfSignedCert();
    }
    
    // Initialize Socket.io server with the appropriate server
    const primaryServer = httpsServer || httpServer;
    await initializeSocketServer(primaryServer);
    
    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`HTTP server running on port ${PORT}`);
      if (httpsConfig.redirectHTTP) {
        logger.info('HTTP requests will be redirected to HTTPS');
      }
    });
    
    // Start HTTPS server if configured
    if (httpsServer) {
      httpsServer.listen(HTTPS_PORT, () => {
        logger.info(`HTTPS server running on port ${HTTPS_PORT}`);
        logger.info('SSL/TLS enabled for secure connections');
      });
    }
    
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info('Socket.io server initialized and ready with scaling support');
    
    // Log security configuration
    if (httpsConfig.enabled) {
      logger.info('Security features enabled:');
      logger.info('  - HTTPS/SSL encryption');
      logger.info('  - HSTS (HTTP Strict Transport Security)');
      logger.info('  - CSP (Content Security Policy)');
      logger.info('  - Security headers (X-Frame-Options, X-Content-Type-Options, etc.)');
    }
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing servers');
  await shutdownSocketServer();
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  
  if (httpsServer) {
    httpsServer.close(() => {
      logger.info('HTTPS server closed');
    });
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing servers');
  await shutdownSocketServer();
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });
  
  if (httpsServer) {
    httpsServer.close(() => {
      logger.info('HTTPS server closed');
    });
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});