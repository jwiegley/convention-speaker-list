import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

// Add correlation ID to requests
export const correlationId = (req: Request, res: Response, next: NextFunction) => {
  const id = req.headers['x-correlation-id'] as string || uuidv4();
  req.headers['x-correlation-id'] = id;
  res.setHeader('X-Correlation-Id', id);
  next();
};

// Log HTTP requests
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request
  logger.http(`Incoming ${req.method} ${req.path}`, {
    correlationId: req.headers['x-correlation-id'],
    query: req.query,
    body: req.body,
    ip: req.ip,
  });
  
  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.http(`Response ${req.method} ${req.path} - ${res.statusCode}`, {
      correlationId: req.headers['x-correlation-id'],
      duration: `${duration}ms`,
      statusCode: res.statusCode,
    });
    return originalSend.call(this, data);
  };
  
  next();
};