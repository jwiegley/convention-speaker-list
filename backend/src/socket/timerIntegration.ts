import { SocketServer, SocketClient } from './index';
import { timerService, TimerEvent } from '../services/timerService';
import { emitTimerTick } from './events';
import { SocketEventNames } from '../../../shared/src/types/socket';
import logger from '../utils/logger';

/**
 * Setup timer service integration with Socket.io
 */
export function setupTimerIntegration(io: SocketServer): void {
  // Subscribe to timer service events
  timerService.onTimerEvent((event: TimerEvent) => {
    const { type, sessionId, delegateId, remainingTime, totalTime } = event;

    switch (type) {
      case 'start':
        // Broadcast timer start to all clients in session
        emitTimerTick(io, sessionId, remainingTime, totalTime, delegateId);
        logger.info(
          `Timer started broadcast for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}`
        );
        break;

      case 'tick':
        // Broadcast timer tick
        emitTimerTick(io, sessionId, remainingTime, totalTime, delegateId);
        break;

      case 'pause':
        // Broadcast timer pause
        io.to(`session:${sessionId}`).emit(SocketEventNames.TIMER_PAUSE, {
          sessionId,
          delegateId,
          remainingTime,
          timestamp: new Date(),
        });
        logger.info(
          `Timer paused broadcast for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}`
        );
        break;

      case 'resume':
        // Broadcast timer resume
        io.to(`session:${sessionId}`).emit(SocketEventNames.TIMER_RESUME, {
          sessionId,
          delegateId,
          remainingTime,
          timestamp: new Date(),
        });
        logger.info(
          `Timer resumed broadcast for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}`
        );
        break;

      case 'stop':
        // Broadcast timer stop
        io.to(`session:${sessionId}`).emit(SocketEventNames.TIMER_STOP, {
          sessionId,
          delegateId,
          remainingTime,
          timestamp: new Date(),
        });
        logger.info(
          `Timer stopped broadcast for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}`
        );
        break;

      case 'warning':
        // Warning is handled in emitTimerTick
        break;

      case 'expired':
        // Expiration is handled in emitTimerTick
        break;
    }
  });

  logger.info('Timer service integration with Socket.io initialized');
}

/**
 * Setup timer control handlers for admin namespace
 */
export function setupTimerHandlers(socket: SocketClient, _io: SocketServer): void {
  // Handle timer start
  socket.on('timer:start', async (data: { sessionId: string; duration: number }) => {
    try {
      if (!socket.data.isAdmin) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Only admins can control timers',
        });
        return;
      }

      timerService.startTimer(data.sessionId, data.duration);
      logger.info(`Admin ${socket.id} started timer for session ${data.sessionId}`);
    } catch (error) {
      logger.error('Error starting timer:', error);
      socket.emit('error', {
        code: 'TIMER_START_FAILED',
        message: 'Failed to start timer',
      });
    }
  });

  // Handle timer pause
  socket.on('timer:pause', async (sessionId: string) => {
    try {
      if (!socket.data.isAdmin) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Only admins can control timers',
        });
        return;
      }

      timerService.pauseTimer(sessionId);
      logger.info(`Admin ${socket.id} paused timer for session ${sessionId}`);
    } catch (error) {
      logger.error('Error pausing timer:', error);
      socket.emit('error', {
        code: 'TIMER_PAUSE_FAILED',
        message: 'Failed to pause timer',
      });
    }
  });

  // Handle timer resume
  socket.on('timer:resume', async (sessionId: string) => {
    try {
      if (!socket.data.isAdmin) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Only admins can control timers',
        });
        return;
      }

      timerService.resumeTimer(sessionId);
      logger.info(`Admin ${socket.id} resumed timer for session ${sessionId}`);
    } catch (error) {
      logger.error('Error resuming timer:', error);
      socket.emit('error', {
        code: 'TIMER_RESUME_FAILED',
        message: 'Failed to resume timer',
      });
    }
  });

  // Handle timer reset
  socket.on('timer:reset', async (sessionId: string) => {
    try {
      if (!socket.data.isAdmin) {
        socket.emit('error', {
          code: 'UNAUTHORIZED',
          message: 'Only admins can control timers',
        });
        return;
      }

      timerService.resetTimer(sessionId);
      logger.info(`Admin ${socket.id} reset timer for session ${sessionId}`);
    } catch (error) {
      logger.error('Error resetting timer:', error);
      socket.emit('error', {
        code: 'TIMER_RESET_FAILED',
        message: 'Failed to reset timer',
      });
    }
  });
}

/**
 * Send timer state to a newly connected client
 */
export async function sendTimerState(
  io: SocketServer,
  socketId: string,
  sessionId: string
): Promise<void> {
  try {
    const timerState = timerService.getTimerState(sessionId);

    if (timerState && timerState.isRunning) {
      // Send current timer state
      io.to(socketId).emit(SocketEventNames.TIMER_STATE, {
        sessionId,
        remainingTime: timerState.remainingTime,
        totalTime: timerState.duration,
        isRunning: timerState.isRunning,
        isPaused: timerState.isPaused,
        serverTimestamp: timerState.serverTimestamp,
      });

      logger.debug(`Sent timer state to ${socketId} for session ${sessionId}`);
    }
  } catch (error) {
    logger.error(`Error sending timer state to ${socketId}:`, error);
  }
}

/**
 * Cleanup timer integration (for graceful shutdown)
 */
export function cleanupTimerIntegration(): void {
  timerService.cleanup();
  logger.info('Timer integration cleaned up');
}
