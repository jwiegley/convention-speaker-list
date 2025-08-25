import { SocketServer } from './index';
import { 
  demographicsService, 
  DemographicsEvent,
  DemographicsData,
  GardenState 
} from '../services/demographicsService';
import { emitDemographicsUpdate, emitGardenStateChange } from './events';
import { SocketEventNames } from '../../../shared/src/types/socket';
import logger from '../utils/logger';

/**
 * Setup demographics service integration with Socket.io
 */
export function setupDemographicsIntegration(io: SocketServer): void {
  // Subscribe to demographics service events
  demographicsService.onDemographicsEvent((event: DemographicsEvent) => {
    const { type, sessionId, data } = event;
    
    switch (type) {
      case 'demographics:updated':
        const demographics = data as DemographicsData;
        
        // Emit demographics update to all clients in session
        emitDemographicsUpdate(io, sessionId, {
          sessionId,
          totalDelegates: demographics.totalDelegates,
          demographics: {
            region: demographics.demographics.region as Record<string, number>,
            age: demographics.demographics.age as Record<string, number>,
            gender: demographics.demographics.gender as Record<string, number>,
            firstTime: demographics.demographics.firstTime.yes
          }
        });
        
        // Also emit balance metrics for dashboard displays
        io.to(`session:${sessionId}`).emit(SocketEventNames.BALANCE_UPDATE, {
          sessionId,
          balance: demographics.balance,
          deltas: demographics.deltas,
          timestamp: new Date()
        });
        
        logger.debug(`Demographics update broadcast for session ${sessionId}`);
        break;
        
      case 'garden:stateChanged':
        const gardenState = data as GardenState;
        
        // Emit garden state change
        emitGardenStateChange(io, sessionId, {
          sessionId,
          speakerPositions: [], // This would be populated with actual speaker positions
          gardenIndex: gardenState.imageIndex,
          performanceScore: gardenState.performanceScore
        } as any);
        
        logger.debug(`Garden state broadcast for session ${sessionId}, index: ${gardenState.imageIndex}`);
        break;
    }
  });
  
  logger.info('Demographics service integration with Socket.io initialized');
}

/**
 * Trigger demographics update when speaker changes occur
 */
export async function handleSpeakerChange(sessionId: string): Promise<void> {
  try {
    // Trigger demographics update with batching
    await demographicsService.triggerDemographicsUpdate(sessionId);
    
    // Also update garden state
    await demographicsService.triggerGardenUpdate(sessionId);
    
    logger.debug(`Triggered demographics update for speaker change in session ${sessionId}`);
  } catch (error) {
    logger.error(`Error handling speaker change for session ${sessionId}:`, error);
  }
}

/**
 * Send current demographics state to a newly connected client
 */
export async function sendDemographicsState(
  io: SocketServer,
  socketId: string,
  sessionId: string
): Promise<void> {
  try {
    // Get cached demographics
    const demographics = demographicsService.getCachedDemographics(sessionId);
    
    if (demographics) {
      // Send demographics snapshot
      io.to(socketId).emit(SocketEventNames.DEMOGRAPHICS_SNAPSHOT, {
        sessionId,
        totalDelegates: demographics.totalDelegates,
        demographics: demographics.demographics,
        balance: demographics.balance,
        timestamp: new Date()
      });
      
      logger.debug(`Sent demographics state to ${socketId} for session ${sessionId}`);
    }
    
    // Get cached garden state
    const gardenState = demographicsService.getCachedGardenState(sessionId);
    
    if (gardenState) {
      // Send garden state snapshot
      io.to(socketId).emit(SocketEventNames.GARDEN_SNAPSHOT, {
        sessionId,
        imageIndex: gardenState.imageIndex,
        performanceScore: gardenState.performanceScore,
        averageTime: gardenState.averageTime,
        onTimePercentage: gardenState.onTimePercentage,
        timestamp: new Date()
      });
      
      logger.debug(`Sent garden state to ${socketId} for session ${sessionId}`);
    }
  } catch (error) {
    logger.error(`Error sending demographics state to ${socketId}:`, error);
  }
}

/**
 * Handle demographic view subscription
 * Only send updates to clients actively viewing demographics
 */
export function handleDemographicsSubscription(
  socket: any,
  sessionId: string,
  subscribe: boolean
): void {
  const roomName = `demographics:${sessionId}`;
  
  if (subscribe) {
    socket.join(roomName);
    logger.debug(`Socket ${socket.id} subscribed to demographics for session ${sessionId}`);
  } else {
    socket.leave(roomName);
    logger.debug(`Socket ${socket.id} unsubscribed from demographics for session ${sessionId}`);
  }
}

/**
 * Cleanup demographics integration (for graceful shutdown)
 */
export function cleanupDemographicsIntegration(): void {
  demographicsService.cleanup();
  logger.info('Demographics integration cleaned up');
}