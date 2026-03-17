import { Router, Request, Response } from 'express';
import { getSocketServer } from '../socket';
import { connectionPool, getMonitoringData } from '../socket/scaling';
import logger from '../utils/logger';

const router = Router();

/**
 * GET /api/monitoring/websocket/stats
 * Get WebSocket server statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const io = getSocketServer();

    if (!io) {
      return res.status(503).json({
        error: 'WebSocket server not initialized',
        available: false,
      });
    }

    const monitoringData = await getMonitoringData(io);

    res.json({
      available: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...monitoringData,
    });
  } catch (error) {
    logger.error('Error fetching WebSocket stats:', error);
    res.status(500).json({
      error: 'Failed to fetch WebSocket statistics',
    });
  }
});

/**
 * GET /api/monitoring/websocket/connections
 * Get detailed connection pool information
 */
router.get('/connections', async (req: Request, res: Response) => {
  try {
    const poolStats = connectionPool.getStats();

    res.json({
      timestamp: new Date().toISOString(),
      pool: poolStats,
      health: {
        isHealthy: poolStats.totalConnections < poolStats.maxConnections * 0.9,
        utilizationPercent: (poolStats.totalConnections / poolStats.maxConnections) * 100,
      },
    });
  } catch (error) {
    logger.error('Error fetching connection pool stats:', error);
    res.status(500).json({
      error: 'Failed to fetch connection pool statistics',
    });
  }
});

/**
 * GET /api/monitoring/websocket/rooms/:namespace?
 * Get room information for a specific namespace
 */
router.get('/rooms/:namespace?', async (req: Request, res: Response) => {
  try {
    const io = getSocketServer();

    if (!io) {
      return res.status(503).json({
        error: 'WebSocket server not initialized',
      });
    }

    const namespace = req.params.namespace || '/';
    const nsp = io.of(namespace);
    const rooms = nsp.adapter.rooms;

    const roomData = Array.from(rooms.entries()).map(([room, sockets]) => ({
      room,
      members: sockets.size,
      socketIds: Array.from(sockets),
    }));

    res.json({
      namespace,
      totalRooms: rooms.size,
      rooms: roomData,
    });
  } catch (error) {
    logger.error('Error fetching room data:', error);
    res.status(500).json({
      error: 'Failed to fetch room information',
    });
  }
});

/**
 * GET /api/monitoring/websocket/health
 * Health check endpoint for load balancers
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const io = getSocketServer();

    if (!io) {
      return res.status(503).json({
        status: 'unhealthy',
        reason: 'WebSocket server not initialized',
      });
    }

    const poolStats = connectionPool.getStats();
    const isHealthy = poolStats.totalConnections < poolStats.maxConnections * 0.95;

    if (!isHealthy) {
      return res.status(503).json({
        status: 'unhealthy',
        reason: 'Connection pool near capacity',
        connections: poolStats.totalConnections,
        maxConnections: poolStats.maxConnections,
      });
    }

    res.json({
      status: 'healthy',
      connections: poolStats.totalConnections,
      maxConnections: poolStats.maxConnections,
      uptime: process.uptime(),
    });
  } catch (error) {
    logger.error('Error in health check:', error);
    res.status(503).json({
      status: 'unhealthy',
      reason: 'Internal error',
    });
  }
});

export default router;
