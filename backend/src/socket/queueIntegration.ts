import { SocketServer } from './index';
import { queueService } from '../services/queueService';
import { 
  emitQueueUpdate, 
  emitQueueJoined, 
  emitQueueLeft, 
  emitSpeakerAdvanced,
  emitQueueSnapshot 
} from './events';
import { QueueEvent } from '../types/queue';
import { handleSpeakerChange } from './demographicsIntegration';
import { timerService } from '../services/timerService';
import { speakingInstanceService } from '../services/speakingInstanceService';
import logger from '../utils/logger';

/**
 * Setup queue service integration with Socket.io
 * This connects the queue service events to WebSocket broadcasts
 */
export function setupQueueIntegration(io: SocketServer): void {
  // Subscribe to queue service events
  queueService.onQueueUpdate(async (event: QueueEvent) => {
    try {
      const { sessionId, type, data } = event;
      
      // Get current queue state for broadcast
      const queueState = await queueService.getQueueState(sessionId);
      
      switch (type) {
        case 'added':
          // Emit queue joined event for new speaker
          if (data && data.id) {
            const queueItem = queueState.items.find(item => item.id === data.id);
            if (queueItem) {
              emitQueueJoined(io, sessionId, queueItem, data.position);
              
              // Auto-start timer if delegate is added directly to speaking position
              if (queueItem.status === 'speaking' && !timerService.hasActiveTimer(sessionId, queueItem.delegateId)) {
                timerService.startTimer(sessionId, 180, queueItem.delegateId); // 3 minutes
                logger.info(`Auto-started timer for delegate ${queueItem.delegateId} added to speaking position in session ${sessionId}`);
                
                // Create speaking instance record
                await speakingInstanceService.createSpeakingInstance({
                  delegate_id: queueItem.delegateId,
                  session_id: sessionId,
                  queue_item_id: queueItem.id,
                  position_in_queue: queueItem.position
                });
              }
            }
          }
          // Also emit general queue update
          emitQueueUpdate(io, sessionId, {
            sessionId,
            queue: queueState.items,
            action: 'added',
            affectedItems: data ? [data.id] : []
          });
          break;
          
        case 'removed':
          // Emit queue left event
          if (data && data.itemId) {
            emitQueueLeft(io, sessionId, data.itemId, data.delegateId || '', 'removed');
          }
          // Emit updated queue state
          emitQueueUpdate(io, sessionId, {
            sessionId,
            queue: queueState.items,
            action: 'removed',
            affectedItems: data ? [data.itemId] : []
          });
          break;
          
        case 'advanced':
          // Emit speaker advanced event with current queue state
          if (data) {
            const currentSpeaker = queueState.items.find(item => item.status === 'speaking');
            const nextSpeaker = queueState.items.find(item => item.position === 1 && item.status === 'waiting');
            
            if (currentSpeaker) {
              emitSpeakerAdvanced(io, sessionId, {
                sessionId,
                previousSpeaker: data.previousSpeaker,
                currentSpeaker,
                nextSpeaker
              });
              
              // Auto-start timer for new speaker if not already running
              if (!timerService.hasActiveTimer(sessionId, currentSpeaker.delegateId)) {
                timerService.startTimer(sessionId, 180, currentSpeaker.delegateId); // 3 minutes
                logger.info(`Auto-started timer for delegate ${currentSpeaker.delegateId} in session ${sessionId}`);
                
                // Create speaking instance record
                await speakingInstanceService.createSpeakingInstance({
                  delegate_id: currentSpeaker.delegateId,
                  session_id: sessionId,
                  queue_item_id: currentSpeaker.id,
                  position_in_queue: currentSpeaker.position
                });
              }
              
              // Stop timer and complete speaking instance for previous speaker
              if (data.previousSpeaker && data.previousSpeaker.delegateId) {
                if (timerService.hasActiveTimer(sessionId, data.previousSpeaker.delegateId)) {
                  timerService.stopTimer(sessionId, data.previousSpeaker.delegateId);
                  logger.info(`Auto-stopped timer for previous speaker ${data.previousSpeaker.delegateId} in session ${sessionId}`);
                }
                
                // Complete the speaking instance record
                await speakingInstanceService.completeSpeakingInstance(
                  data.previousSpeaker.delegateId,
                  sessionId,
                  'completed'
                );
              }
            }
          }
          // Emit queue update
          emitQueueUpdate(io, sessionId, {
            sessionId,
            queue: queueState.items,
            action: 'advanced',
            affectedItems: data ? [data.currentSpeakerId, data.previousSpeakerId].filter(Boolean) : []
          }, true); // Immediate emit for speaker advancement
          
          // Trigger demographics update when speaker changes
          await handleSpeakerChange(sessionId);
          break;
          
        case 'reordered':
          // Emit queue update for reordering
          emitQueueUpdate(io, sessionId, {
            sessionId,
            queue: queueState.items,
            action: 'reordered',
            affectedItems: data && data.newOrder ? data.newOrder : []
          });
          break;
          
        case 'reset':
          // Emit queue reset
          emitQueueUpdate(io, sessionId, {
            sessionId,
            queue: queueState.items,
            action: 'reset',
            affectedItems: []
          }, true); // Immediate emit for reset
          break;
          
        default:
          // Generic queue update
          emitQueueUpdate(io, sessionId, {
            sessionId,
            queue: queueState.items,
            action: 'reordered',
            affectedItems: []
          });
      }
      
      logger.info(`Queue integration: Broadcasted ${type} event for session ${sessionId}`);
    } catch (error) {
      logger.error('Error in queue integration:', error);
    }
  });
  
  logger.info('Queue service integration with Socket.io initialized');
}

/**
 * Send queue snapshot to a newly connected client
 */
export async function sendQueueSnapshot(
  io: SocketServer,
  socketId: string,
  sessionId: string
): Promise<void> {
  try {
    const queueState = await queueService.getQueueState(sessionId);
    
    const currentSpeaker = queueState.items.find(item => item.status === 'speaking') || null;
    const onDeck = queueState.items
      .filter(item => item.status === 'waiting')
      .slice(0, 3);
    
    emitQueueSnapshot(
      io,
      socketId,
      sessionId,
      queueState.items,
      currentSpeaker,
      onDeck
    );
    
    logger.debug(`Sent queue snapshot to ${socketId} for session ${sessionId}`);
  } catch (error) {
    logger.error(`Error sending queue snapshot to ${socketId}:`, error);
  }
}

/**
 * Cleanup queue integration (for graceful shutdown)
 */
export function cleanupQueueIntegration(): void {
  // Remove all listeners from queue service
  queueService.offQueueUpdate(() => {});
  logger.info('Queue integration cleaned up');
}