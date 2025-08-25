import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import logger from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    // Operational errors
    logger.error(`Operational Error: ${err.message}`, {
      statusCode: err.statusCode,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }
  
  // Programming or unknown errors
  logger.error(`Unexpected Error: ${err.message}`, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack,
  });
  
  // Don't leak error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Something went wrong!' 
    : err.message;
  
  res.status(500).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Not found handler
export const notFoundHandler = (req: Request, res: Response) => {
  logger.warn(`404 - Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`,
  });
};

// Uncaught exception handler
export const handleUncaughtException = () => {
  process.on('uncaughtException', (error: Error) => {
    logger.error('UNCAUGHT EXCEPTION! Shutting down...', error);
    process.exit(1);
  });
};

// Unhandled rejection handler
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason: any) => {
    logger.error('UNHANDLED REJECTION! Shutting down...', reason);
    process.exit(1);
  });
};