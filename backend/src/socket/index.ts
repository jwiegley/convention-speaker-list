import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  InterServerEvents, 
  SocketData 
} from '../../../shared/src/types/socket';
import logger from '../utils/logger';
import { socketConfig } from './config';
import { setupNamespaces } from './namespaces';
import { setupMiddleware } from './middleware';
import { setupQueueIntegration, cleanupQueueIntegration } from './queueIntegration';
import { setupTimerIntegration, cleanupTimerIntegration } from './timerIntegration';
import { setupDemographicsIntegration, cleanupDemographicsIntegration } from './demographicsIntegration';
import { joinSessionRoom, leaveSessionRoom, cleanupEmptyRooms } from './rooms';
import { 
  connectionPool, 
  setupRedisAdapter, 
  gracefulShutdown as scalingGracefulShutdown,
  connectionRateLimiter 
} from './scaling';
import { redisService } from '../services/redisService';

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type SocketClient = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

let io: SocketServer | null = null;

/**
 * Initialize Socket.io server with Express HTTP server
 */
export async function initializeSocketServer(httpServer: HttpServer): Promise<SocketServer> {
  if (io) {
    logger.warn('Socket.io server already initialized');
    return io;
  }

  logger.info('Initializing Socket.io server...');
  
  // Create Socket.io server with configuration
  io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, socketConfig);

  // Setup Redis adapter for scaling if Redis is available
  if (redisService.isReady()) {
    try {
      const pubClient = redisService.getClient()!;
      const subClient = pubClient.duplicate();
      await setupRedisAdapter(io, pubClient, subClient);
      logger.info('Redis adapter enabled for Socket.io scaling');
    } catch (error) {
      logger.warn('Failed to setup Redis adapter, continuing without scaling support:', error);
    }
  }

  // Setup middleware pipeline
  setupMiddleware(io);

  // Setup namespaces (admin, spectator)
  setupNamespaces(io);
  
  // Setup queue service integration for real-time updates
  setupQueueIntegration(io);
  
  // Setup timer service integration for synchronized timers
  setupTimerIntegration(io);
  
  // Setup demographics service integration for real-time updates
  setupDemographicsIntegration(io);

  // Handle main namespace connections
  io.on('connection', (socket: SocketClient) => {
    const clientIP = socket.handshake.address || 'unknown';
    
    // Check connection pool limits
    if (!connectionPool.addConnection(socket.id, clientIP)) {
      logger.warn(`Connection rejected for ${clientIP}: pool limit reached`);
      socket.emit('error', { 
        code: 'CONNECTION_LIMIT', 
        message: 'Too many connections. Please try again later.' 
      });
      socket.disconnect(true);
      return;
    }
    
    logger.info(`New client connected: ${socket.id} from ${clientIP}`);
    
    // Set initial socket data
    socket.data.connectedAt = new Date();
    socket.data.role = socket.data.role || 'delegate'; // Default role
    
    // Wrap emit to add rate limiting
    const originalEmit = socket.emit.bind(socket);
    (socket as any).emit = function(event: string, ...args: any[]) {
      if (!connectionRateLimiter.checkLimit(socket.id)) {
        originalEmit('error', { 
          code: 'RATE_LIMIT_EXCEEDED', 
          message: 'Too many requests. Please slow down.' 
        });
        return false;
      }
      return originalEmit(event as any, ...args);
    };
    
    // Handle session joining
    socket.on('join:session', async (sessionId: string) => {
      try {
        await joinSessionRoom(socket, sessionId, io);
        logger.info(`Client ${socket.id} joined session ${sessionId}`);
        
        // Client successfully joined the session
        logger.debug(`Client ${socket.id} successfully joined session ${sessionId}`);
      } catch (error) {
        logger.error(`Failed to join session ${sessionId}:`, error);
        socket.emit('error', { 
          code: 'JOIN_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to join session' 
        });
      }
    });
    
    // Handle session leaving
    socket.on('leave:session', async (sessionId: string) => {
      try {
        await leaveSessionRoom(socket, sessionId, io);
        logger.info(`Client ${socket.id} left session ${sessionId}`);
      } catch (error) {
        logger.error(`Failed to leave session ${sessionId}:`, error);
      }
    });
    
    socket.on('disconnect', async (reason) => {
      // Remove from connection pool
      connectionPool.removeConnection(socket.id, clientIP);
      connectionRateLimiter.resetLimit(socket.id);
      
      // Clean up room membership on disconnect
      if (socket.data.sessionId) {
        await leaveSessionRoom(socket, socket.data.sessionId, io);
      }
      logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      logger.error(`Socket error for client ${socket.id}:`, error);
    });
  });
  
  // Set up periodic room cleanup (every 5 minutes)
  setInterval(async () => {
    const cleaned = await cleanupEmptyRooms(io);
    if (cleaned > 0) {
      logger.info(`Cleaned ${cleaned} empty rooms`);
    }
  }, 5 * 60 * 1000);

  // Socket.io server is ready

  logger.info('Socket.io server initialized successfully');
  return io;
}

/**
 * Get the Socket.io server instance
 */
export function getSocketServer(): SocketServer | null {
  if (!io) {
    logger.warn('Socket.io server not initialized');
  }
  return io;
}

/**
 * Shutdown Socket.io server gracefully
 */
export async function shutdownSocketServer(): Promise<void> {
  if (!io) {
    return;
  }

  // Cleanup integrations
  cleanupQueueIntegration();
  cleanupTimerIntegration();
  cleanupDemographicsIntegration();
  
  // Use the graceful shutdown from scaling module
  await scalingGracefulShutdown(io);
  
  io = null;
}

export * from './events';
export * from './rooms';