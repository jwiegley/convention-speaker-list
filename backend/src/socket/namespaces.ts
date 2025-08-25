import { SocketServer, SocketClient } from './index';
import { namespaceConfig } from './config';
import logger from '../utils/logger';
import jwt from 'jsonwebtoken';
import { sendQueueSnapshot } from './queueIntegration';
import { setupTimerHandlers, sendTimerState } from './timerIntegration';
import { sendDemographicsState, handleDemographicsSubscription } from './demographicsIntegration';
import { joinSessionRoom, leaveSessionRoom } from './rooms';

/**
 * Setup admin and spectator namespaces
 */
export function setupNamespaces(io: SocketServer): void {
  // Admin namespace
  const adminNamespace = io.of('/admin');
  
  adminNamespace.use(async (socket: SocketClient, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required for admin namespace'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      
      if (decoded.role !== 'admin') {
        return next(new Error('Admin role required'));
      }
      
      socket.data.userId = decoded.userId;
      socket.data.role = 'admin';
      socket.data.isAdmin = true;
      
      logger.info(`Admin connected: ${socket.id}, userId: ${decoded.userId}`);
      next();
    } catch (error) {
      logger.error('Admin namespace auth error:', error);
      next(new Error('Invalid authentication'));
    }
  });
  
  adminNamespace.on('connection', (socket: SocketClient) => {
    logger.info(`Admin namespace connection: ${socket.id}`);
    
    // Setup timer control handlers for admin
    setupTimerHandlers(socket, io);
    
    // Admin-specific event handlers
    socket.on('speaker:next', async (sessionId: string) => {
      try {
        // Emit to all clients in the session room
        io.to(`session:${sessionId}`).emit('speaker:advanced', {
          sessionId,
          currentSpeaker: {} as any, // Will be implemented with queue service
          timestamp: new Date(),
        });
        
        logger.info(`Admin ${socket.id} advanced speaker in session ${sessionId}`);
      } catch (error) {
        logger.error('Error advancing speaker:', error);
        socket.emit('error', { code: 'ADVANCE_FAILED', message: 'Failed to advance speaker' });
      }
    });
    
    // Admin can join sessions to monitor
    socket.on('join:session', async (sessionId: string) => {
      try {
        // Use enhanced room management
        await joinSessionRoom(socket, sessionId, io);
        logger.info(`Admin ${socket.id} joined session ${sessionId}`);
        
        // Send current queue, timer, and demographics state
        await sendQueueSnapshot(io, socket.id, sessionId);
        await sendTimerState(io, socket.id, sessionId);
        await sendDemographicsState(io, socket.id, sessionId);
      } catch (error) {
        logger.error(`Failed to join session ${sessionId}:`, error);
        socket.emit('error', { code: 'JOIN_FAILED', message: 'Failed to join session' });
      }
    });
    
    socket.on('leave:session', async (sessionId: string) => {
      try {
        await leaveSessionRoom(socket, sessionId, io);
        logger.info(`Admin ${socket.id} left session ${sessionId}`);
      } catch (error) {
        logger.error(`Failed to leave session ${sessionId}:`, error);
      }
    });
    
    socket.on('disconnect', async () => {
      // Clean up room membership on disconnect
      if (socket.data.sessionId) {
        await leaveSessionRoom(socket, socket.data.sessionId, io);
      }
      logger.info(`Admin disconnected: ${socket.id}`);
    });
  });
  
  // Spectator namespace
  const spectatorNamespace = io.of('/spectator');
  
  spectatorNamespace.use(async (socket: SocketClient, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication required for spectator namespace'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as any;
      
      if (decoded.role !== 'spectator' && decoded.role !== 'admin') {
        return next(new Error('Spectator or admin role required'));
      }
      
      socket.data.userId = decoded.userId;
      socket.data.role = decoded.role;
      
      logger.info(`Spectator connected: ${socket.id}, userId: ${decoded.userId}`);
      next();
    } catch (error) {
      logger.error('Spectator namespace auth error:', error);
      next(new Error('Invalid authentication'));
    }
  });
  
  spectatorNamespace.on('connection', (socket: SocketClient) => {
    logger.info(`Spectator namespace connection: ${socket.id}`);
    
    // Spectator can only join sessions and receive updates
    socket.on('join:session', async (sessionId: string) => {
      try {
        // Use enhanced room management
        await joinSessionRoom(socket, sessionId, io);
        logger.info(`Spectator ${socket.id} joined session ${sessionId}`);
        
        // Send current queue, timer, and demographics state to newly joined spectator
        await sendQueueSnapshot(io, socket.id, sessionId);
        await sendTimerState(io, socket.id, sessionId);
        await sendDemographicsState(io, socket.id, sessionId);
      } catch (error) {
        logger.error(`Failed to join session ${sessionId}:`, error);
        socket.emit('error', { code: 'JOIN_FAILED', message: 'Failed to join session' });
      }
    });
    
    socket.on('leave:session', async (sessionId: string) => {
      try {
        await leaveSessionRoom(socket, sessionId, io);
        logger.info(`Spectator ${socket.id} left session ${sessionId}`);
      } catch (error) {
        logger.error(`Failed to leave session ${sessionId}:`, error);
      }
    });
    
    socket.on('disconnect', async () => {
      // Clean up room membership on disconnect
      if (socket.data.sessionId) {
        await leaveSessionRoom(socket, socket.data.sessionId, io);
      }
      logger.info(`Spectator disconnected: ${socket.id}`);
    });
  });
  
  logger.info('Namespaces initialized: /admin, /spectator');
}