import { createAdapter } from '@socket.io/redis-adapter';
import { RedisClientType } from 'redis';
import logger from '../utils/logger';
import { SocketServer } from './index';

// Connection pool configuration
export interface ConnectionPoolConfig {
  maxConnectionsPerIP: number;
  maxTotalConnections: number;
  connectionTimeout: number;
  cleanupInterval: number;
}

// Default pool configuration
export const defaultPoolConfig: ConnectionPoolConfig = {
  maxConnectionsPerIP: 10,
  maxTotalConnections: 1000,
  connectionTimeout: 60000, // 60 seconds
  cleanupInterval: 30000, // 30 seconds
};

// Connection tracking
class ConnectionPool {
  private connectionsByIP: Map<string, Set<string>> = new Map();
  private totalConnections: number = 0;
  private config: ConnectionPoolConfig;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = { ...defaultPoolConfig, ...config };
    this.startCleanupTimer();
  }

  /**
   * Check if a new connection can be accepted
   */
  canAcceptConnection(ip: string): boolean {
    // Check total connections limit
    if (this.totalConnections >= this.config.maxTotalConnections) {
      logger.warn(`Connection pool full: ${this.totalConnections}/${this.config.maxTotalConnections}`);
      return false;
    }

    // Check per-IP limit
    const ipConnections = this.connectionsByIP.get(ip);
    if (ipConnections && ipConnections.size >= this.config.maxConnectionsPerIP) {
      logger.warn(`Too many connections from IP ${ip}: ${ipConnections.size}/${this.config.maxConnectionsPerIP}`);
      return false;
    }

    return true;
  }

  /**
   * Register a new connection
   */
  addConnection(socketId: string, ip: string): boolean {
    if (!this.canAcceptConnection(ip)) {
      return false;
    }

    if (!this.connectionsByIP.has(ip)) {
      this.connectionsByIP.set(ip, new Set());
    }

    this.connectionsByIP.get(ip)!.add(socketId);
    this.totalConnections++;
    
    logger.debug(`Connection added: ${socketId} from ${ip}. Total: ${this.totalConnections}`);
    return true;
  }

  /**
   * Remove a connection
   */
  removeConnection(socketId: string, ip: string): void {
    const ipConnections = this.connectionsByIP.get(ip);
    if (ipConnections) {
      ipConnections.delete(socketId);
      if (ipConnections.size === 0) {
        this.connectionsByIP.delete(ip);
      }
      this.totalConnections--;
      logger.debug(`Connection removed: ${socketId}. Total: ${this.totalConnections}`);
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      totalConnections: this.totalConnections,
      uniqueIPs: this.connectionsByIP.size,
      maxConnections: this.config.maxTotalConnections,
      maxPerIP: this.config.maxConnectionsPerIP,
      connectionsByIP: Array.from(this.connectionsByIP.entries()).map(([ip, sockets]) => ({
        ip,
        count: sockets.size,
      })),
    };
  }

  /**
   * Clean up stale connections periodically
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      // This would typically check for stale connections
      // For now, just log stats
      logger.debug('Connection pool stats:', this.getStats());
    }, this.config.cleanupInterval);
  }
}

// Global connection pool instance
export const connectionPool = new ConnectionPool();

/**
 * Setup Redis adapter for Socket.io scaling
 */
export async function setupRedisAdapter(
  io: SocketServer,
  pubClient: RedisClientType,
  subClient: RedisClientType
): Promise<void> {
  try {
    // Ensure Redis clients are connected
    if (!pubClient.isOpen) {
      await pubClient.connect();
    }
    if (!subClient.isOpen) {
      await subClient.connect();
    }

    // Create and attach the adapter
    const adapter = createAdapter(pubClient, subClient);
    io.adapter(adapter);

    logger.info('Redis adapter configured for Socket.io scaling');

    // Handle adapter errors
    io.of('/').adapter.on('error', (error: Error) => {
      logger.error('Redis adapter error:', error);
    });

  } catch (error) {
    logger.error('Failed to setup Redis adapter:', error);
    throw error;
  }
}

/**
 * Monitoring endpoints data provider
 */
export async function getMonitoringData(io: SocketServer) {
  const sockets = await io.fetchSockets();
  const rooms = io.of('/').adapter.rooms;
  
  return {
    connections: {
      total: sockets.length,
      pool: connectionPool.getStats(),
    },
    rooms: {
      total: rooms.size,
      list: Array.from(rooms.entries()).map(([room, sockets]) => ({
        room,
        members: sockets.size,
      })),
    },
    namespaces: {
      main: {
        sockets: (await io.of('/').fetchSockets()).length,
      },
      admin: {
        sockets: (await io.of('/admin').fetchSockets()).length,
      },
      spectator: {
        sockets: (await io.of('/spectator').fetchSockets()).length,
      },
    },
    adapters: {
      type: io.of('/').adapter.constructor.name,
      rooms: rooms.size,
    },
  };
}

/**
 * Graceful shutdown handler
 */
export async function gracefulShutdown(io: SocketServer, timeout: number = 10000): Promise<void> {
  logger.info('Starting graceful Socket.io shutdown...');
  
  // Notify all clients about shutdown
  io.emit('server:shutdown', { 
    message: 'Server is shutting down for maintenance',
    reconnectIn: 30000, // Suggest reconnect after 30 seconds
  });

  // Give clients time to receive the message
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Disconnect all sockets
  const sockets = await io.fetchSockets();
  for (const socket of sockets) {
    socket.disconnect(true);
  }

  // Wait for connections to close or timeout
  const shutdownPromise = new Promise<void>((resolve) => {
    io.close(() => {
      logger.info('Socket.io server closed gracefully');
      resolve();
    });
  });

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      logger.warn('Socket.io shutdown timeout reached');
      resolve();
    }, timeout);
  });

  await Promise.race([shutdownPromise, timeoutPromise]);
}

/**
 * Load balancing utilities for sticky sessions
 */
export function generateSessionId(socketId: string): string {
  // Generate a stable session ID for sticky session routing
  // This would typically be used with a load balancer
  return `${process.env.NODE_APP_INSTANCE || '0'}-${socketId}`;
}

/**
 * Rate limiting per connection
 */
export class ConnectionRateLimiter {
  private limits: Map<string, { count: number; resetAt: number }> = new Map();
  private maxEventsPerMinute: number;

  constructor(maxEventsPerMinute: number = 100) {
    this.maxEventsPerMinute = maxEventsPerMinute;
    
    // Cleanup old entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [socketId, limit] of this.limits.entries()) {
        if (limit.resetAt < now) {
          this.limits.delete(socketId);
        }
      }
    }, 60000);
  }

  checkLimit(socketId: string): boolean {
    const now = Date.now();
    const limit = this.limits.get(socketId);

    if (!limit || limit.resetAt < now) {
      this.limits.set(socketId, {
        count: 1,
        resetAt: now + 60000,
      });
      return true;
    }

    if (limit.count >= this.maxEventsPerMinute) {
      return false;
    }

    limit.count++;
    return true;
  }

  resetLimit(socketId: string): void {
    this.limits.delete(socketId);
  }
}

export const connectionRateLimiter = new ConnectionRateLimiter();