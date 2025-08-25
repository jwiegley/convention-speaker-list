import { Router } from 'express';
import { getSocketServer } from '../socket';
import { getActiveSessions, getRoomStats } from '../socket/rooms';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/monitoring/sessions
 * Get information about all active sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const io = getSocketServer();
    
    if (!io) {
      return res.status(503).json({ 
        error: 'WebSocket server not initialized' 
      });
    }
    
    const activeSessions = getActiveSessions();
    const sessionsData = [];
    
    for (const [sessionId, sessionInfo] of activeSessions) {
      const roomStats = await getRoomStats(io, sessionId);
      
      sessionsData.push({
        sessionId,
        name: sessionInfo.name || `Session ${sessionId}`,
        createdAt: sessionInfo.createdAt,
        duration: Math.floor((Date.now() - sessionInfo.createdAt.getTime()) / 1000), // in seconds
        participants: {
          total: sessionInfo.participantCount,
          admins: sessionInfo.adminCount,
          spectators: sessionInfo.spectatorCount,
          delegates: sessionInfo.delegateCount,
        },
        roomStats, // Additional stats from getRoomStats
      });
    }
    
    res.json({
      totalSessions: sessionsData.length,
      sessions: sessionsData,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Error fetching session monitoring data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch session data' 
    });
  }
});

/**
 * GET /api/monitoring/sessions/:sessionId
 * Get detailed information about a specific session
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const io = getSocketServer();
    
    if (!io) {
      return res.status(503).json({ 
        error: 'WebSocket server not initialized' 
      });
    }
    
    const activeSessions = getActiveSessions();
    const sessionInfo = activeSessions.get(sessionId);
    
    if (!sessionInfo) {
      return res.status(404).json({ 
        error: 'Session not found' 
      });
    }
    
    const roomStats = await getRoomStats(io, sessionId);
    const roomName = `session:${sessionId}`;
    const sockets = await io.in(roomName).fetchSockets();
    
    // Get detailed participant information
    const participants = sockets.map(socket => ({
      socketId: socket.id,
      role: socket.data.role || 'delegate',
      connectedAt: socket.data.connectedAt,
      userId: socket.data.userId,
    }));
    
    res.json({
      sessionId,
      name: sessionInfo.name || `Session ${sessionId}`,
      createdAt: sessionInfo.createdAt,
      duration: Math.floor((Date.now() - sessionInfo.createdAt.getTime()) / 1000),
      participants: {
        total: sessionInfo.participantCount,
        admins: sessionInfo.adminCount,
        spectators: sessionInfo.spectatorCount,
        delegates: sessionInfo.delegateCount,
        details: participants,
      },
      roomStats,
      timestamp: new Date(),
    });
  } catch (error) {
    logger.error('Error fetching session details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch session details' 
    });
  }
});

/**
 * GET /api/monitoring/health
 * Health check for WebSocket server
 */
router.get('/health', (req, res) => {
  const io = getSocketServer();
  
  if (!io) {
    return res.status(503).json({ 
      status: 'unhealthy',
      message: 'WebSocket server not initialized' 
    });
  }
  
  res.json({
    status: 'healthy',
    message: 'WebSocket server is running',
    timestamp: new Date(),
  });
});

export default router;