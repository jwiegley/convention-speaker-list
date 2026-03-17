import { SocketServer, SocketClient } from './index';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { rateLimits } from './config';

// Rate limiting storage
const rateLimitMap = new Map<string, { points: number; resetAt: number }>();

/**
 * Setup middleware pipeline for Socket.io
 */
export function setupMiddleware(io: SocketServer): void {
  // Authentication middleware
  io.use(async (socket: SocketClient, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (token) {
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        socket.data.userId = (decoded as any).userId;
        socket.data.role = (decoded as any).role;
        logger.info(`Authenticated socket ${socket.id} with role: ${socket.data.role}`);
      } else {
        // Allow connection without token (for public access)
        socket.data.role = 'delegate';
        logger.info(`Anonymous connection ${socket.id}`);
      }

      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Session validation middleware
  io.use(async (socket: SocketClient, next) => {
    const sessionId = socket.handshake.query.sessionId as string;

    if (sessionId) {
      socket.data.sessionId = sessionId;
      // Join session room automatically
      socket.join(`session:${sessionId}`);
      logger.info(`Socket ${socket.id} joined session: ${sessionId}`);
    }

    next();
  });

  // Rate limiting middleware
  io.use((socket: SocketClient, next) => {
    const clientId = socket.data.userId || socket.handshake.address;

    // Wrap original emit to add rate limiting
    const originalEmit = socket.emit.bind(socket);
    (socket as any).emit = function (event: string, ...args: any[]) {
      if (!checkRateLimit(clientId, event)) {
        originalEmit('error', {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please slow down',
        });
        return false;
      }
      return originalEmit(event as any, ...args);
    };

    next();
  });

  // Error handling middleware
  io.use((socket: SocketClient, next) => {
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
      socket.emit('error', {
        code: 'SOCKET_ERROR',
        message: 'An error occurred processing your request',
      });
    });

    next();
  });

  // Logging middleware
  io.use((socket: SocketClient, next) => {
    // Log all incoming events
    const originalOnevent = (socket as any).onevent;
    (socket as any).onevent = function (packet: any) {
      logger.debug(`Socket ${socket.id} event:`, packet.data[0]);
      originalOnevent.call(this, packet);
    };

    next();
  });
}

/**
 * Check rate limit for a client and event
 */
function checkRateLimit(clientId: string, event: string): boolean {
  const now = Date.now();
  const limits = (rateLimits as any)[event] || rateLimits.default;
  const key = `${clientId}:${event}`;

  const current = rateLimitMap.get(key);

  if (!current || current.resetAt < now) {
    // Reset or initialize
    rateLimitMap.set(key, {
      points: limits.points - 1,
      resetAt: now + limits.duration * 1000,
    });
    return true;
  }

  if (current.points <= 0) {
    return false;
  }

  current.points--;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 60000); // Clean every minute
