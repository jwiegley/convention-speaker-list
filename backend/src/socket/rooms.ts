import { SocketServer, SocketClient } from './index';
import { roomConfig } from './config';
import logger from '../utils/logger';
import { SocketEventNames } from '../../../shared/src/types/socket';

// Track active sessions and their participants
const activeSessions = new Map<string, {
  createdAt: Date;
  participantCount: number;
  adminCount: number;
  spectatorCount: number;
  delegateCount: number;
  name?: string;
}>();

/**
 * Join a client to a session room
 */
export async function joinSessionRoom(
  socket: SocketClient,
  sessionId: string,
  io?: SocketServer
): Promise<void> {
  const roomName = `${roomConfig.roomPrefix}${sessionId}`;
  
  // Check current rooms
  const currentRooms = Array.from(socket.rooms).filter(room => 
    room.startsWith(roomConfig.roomPrefix) && room !== socket.id
  );
  
  if (currentRooms.length >= roomConfig.maxRoomsPerClient) {
    throw new Error(`Maximum rooms limit (${roomConfig.maxRoomsPerClient}) reached`);
  }
  
  await socket.join(roomName);
  socket.data.sessionId = sessionId;
  
  // Track session participants
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      createdAt: new Date(),
      participantCount: 0,
      adminCount: 0,
      spectatorCount: 0,
      delegateCount: 0,
    });
    
    // Emit session created event
    if (io) {
      io.to(roomName).emit(SocketEventNames.SESSION_CREATED, {
        sessionId,
        name: `Session ${sessionId}`,
        participantCount: 1,
        timestamp: new Date(),
      });
    }
  }
  
  const session = activeSessions.get(sessionId)!;
  session.participantCount++;
  
  // Update role counts
  switch (socket.data.role) {
    case 'admin':
      session.adminCount++;
      break;
    case 'spectator':
      session.spectatorCount++;
      break;
    case 'delegate':
    default:
      session.delegateCount++;
      break;
  }
  
  // Emit participant joined event
  if (io) {
    io.to(roomName).emit(SocketEventNames.SESSION_PARTICIPANT_JOINED, {
      sessionId,
      participantId: socket.id,
      role: socket.data.role || 'delegate',
      timestamp: new Date(),
    });
  }
  
  logger.info(`Socket ${socket.id} joined room ${roomName}, total participants: ${session.participantCount}`);
}

/**
 * Leave a session room
 */
export async function leaveSessionRoom(
  socket: SocketClient,
  sessionId: string,
  io?: SocketServer
): Promise<void> {
  const roomName = `${roomConfig.roomPrefix}${sessionId}`;
  
  await socket.leave(roomName);
  
  if (socket.data.sessionId === sessionId) {
    socket.data.sessionId = undefined;
  }
  
  // Update session participant tracking
  const session = activeSessions.get(sessionId);
  if (session) {
    session.participantCount--;
    
    // Update role counts
    switch (socket.data.role) {
      case 'admin':
        session.adminCount--;
        break;
      case 'spectator':
        session.spectatorCount--;
        break;
      case 'delegate':
      default:
        session.delegateCount--;
        break;
    }
    
    // Emit participant left event
    if (io) {
      io.to(roomName).emit(SocketEventNames.SESSION_PARTICIPANT_LEFT, {
        sessionId,
        participantId: socket.id,
        role: socket.data.role || 'delegate',
        timestamp: new Date(),
      });
    }
    
    // Clean up session if empty
    if (session.participantCount <= 0) {
      const duration = Date.now() - session.createdAt.getTime();
      
      // Emit session ended event before cleanup
      if (io) {
        io.to(roomName).emit(SocketEventNames.SESSION_ENDED, {
          sessionId,
          totalSpeakers: 0, // This would come from queue service
          totalDuration: Math.floor(duration / 1000), // in seconds
          timestamp: new Date(),
        });
      }
      
      activeSessions.delete(sessionId);
      logger.info(`Session ${sessionId} ended after ${duration}ms`);
    }
  }
  
  logger.info(`Socket ${socket.id} left room ${roomName}`);
}

/**
 * Get all clients in a session room
 */
export async function getSessionClients(
  io: SocketServer,
  sessionId: string
): Promise<string[]> {
  const roomName = `${roomConfig.roomPrefix}${sessionId}`;
  const sockets = await io.in(roomName).fetchSockets();
  
  return sockets.map(socket => socket.id);
}

/**
 * Get room statistics
 */
export async function getRoomStats(
  io: SocketServer,
  sessionId: string
): Promise<{
  clientCount: number;
  adminCount: number;
  spectatorCount: number;
  delegateCount: number;
}> {
  const roomName = `${roomConfig.roomPrefix}${sessionId}`;
  const sockets = await io.in(roomName).fetchSockets();
  
  const stats = {
    clientCount: sockets.length,
    adminCount: 0,
    spectatorCount: 0,
    delegateCount: 0,
  };
  
  for (const socket of sockets) {
    switch (socket.data.role) {
      case 'admin':
        stats.adminCount++;
        break;
      case 'spectator':
        stats.spectatorCount++;
        break;
      case 'delegate':
      default:
        stats.delegateCount++;
        break;
    }
  }
  
  return stats;
}

/**
 * Broadcast to all clients in a room except sender
 */
export function broadcastToRoom(
  socket: SocketClient,
  sessionId: string,
  event: string,
  data: any
): void {
  const roomName = `${roomConfig.roomPrefix}${sessionId}`;
  socket.to(roomName).emit(event as any, data);
}

/**
 * Clean up empty rooms (called periodically)
 */
export async function cleanupEmptyRooms(io: SocketServer): Promise<number> {
  const rooms = io.of('/').adapter.rooms;
  let cleanedCount = 0;
  
  for (const [roomName, socketIds] of rooms) {
    // Skip socket ID rooms (each socket has its own room)
    if (!roomName.startsWith(roomConfig.roomPrefix)) {
      continue;
    }
    
    if (socketIds.size === 0) {
      // Extract sessionId from room name
      const sessionId = roomName.replace(roomConfig.roomPrefix, '');
      
      // Clean up session tracking if still exists
      if (activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId)!;
        const duration = Date.now() - session.createdAt.getTime();
        
        // Emit session ended event
        io.emit(SocketEventNames.SESSION_ENDED, {
          sessionId,
          totalSpeakers: 0,
          totalDuration: Math.floor(duration / 1000),
          timestamp: new Date(),
        });
        
        activeSessions.delete(sessionId);
        logger.info(`Cleaned up abandoned session ${sessionId}`);
      }
      
      logger.debug(`Empty room found and cleaned: ${roomName}`);
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}

/**
 * Get active sessions information
 */
export function getActiveSessions(): Map<string, any> {
  return new Map(activeSessions);
}

/**
 * Check if a session is active
 */
export function isSessionActive(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

/**
 * Update session name
 */
export function updateSessionName(sessionId: string, name: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.name = name;
  }
}