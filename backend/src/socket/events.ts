import { SocketServer } from './index';
import {
  QueueUpdatePayload,
  SpeakerAdvancedPayload,
  TimerTickPayload,
  DemographicsUpdatePayload,
  GardenStatePayload,
  SocketEventNames,
} from '../../../shared/src/types/socket';
import { IQueueItem } from '../../../shared/src/types/queue';
import logger from '../utils/logger';

// Debounce map for queue updates
const queueUpdateDebounce = new Map<string, NodeJS.Timeout>();
const DEBOUNCE_DELAY = 500; // 500ms debounce for rapid queue changes

/**
 * Emit queue update to all clients in a session with debouncing
 */
export function emitQueueUpdate(
  io: SocketServer,
  sessionId: string,
  payload: Omit<QueueUpdatePayload, 'timestamp'>,
  immediate: boolean = false
): void {
  const emit = () => {
    const fullPayload: QueueUpdatePayload = {
      ...payload,
      timestamp: new Date(),
    };

    io.to(`session:${sessionId}`).emit(SocketEventNames.QUEUE_UPDATED, fullPayload);
    logger.debug(`Emitted queue update for session ${sessionId}, action: ${payload.action}`);
  };

  if (immediate) {
    // Clear any pending debounced update
    const existing = queueUpdateDebounce.get(sessionId);
    if (existing) {
      clearTimeout(existing);
      queueUpdateDebounce.delete(sessionId);
    }
    emit();
  } else {
    // Debounce rapid queue changes
    const existing = queueUpdateDebounce.get(sessionId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      emit();
      queueUpdateDebounce.delete(sessionId);
    }, DEBOUNCE_DELAY);

    queueUpdateDebounce.set(sessionId, timeout);
  }
}

/**
 * Emit speaker advanced event
 */
export function emitSpeakerAdvanced(
  io: SocketServer,
  sessionId: string,
  payload: Omit<SpeakerAdvancedPayload, 'timestamp'>
): void {
  const fullPayload: SpeakerAdvancedPayload = {
    ...payload,
    timestamp: new Date(),
  };

  io.to(`session:${sessionId}`).emit(SocketEventNames.SPEAKER_ADVANCED, fullPayload);
  logger.info(`Emitted speaker advanced for session ${sessionId}`);
}

/**
 * Emit timer tick to all clients
 */
export function emitTimerTick(
  io: SocketServer,
  sessionId: string,
  remainingTime: number,
  totalTime: number,
  delegateId?: string
): void {
  const isWarning = remainingTime <= 30 && remainingTime > 0;

  const payload: TimerTickPayload = {
    sessionId,
    delegateId,
    remainingTime,
    totalTime,
    isWarning,
    timestamp: new Date(),
  };

  io.to(`session:${sessionId}`).emit(SocketEventNames.TIMER_TICK, payload);

  if (isWarning) {
    io.to(`session:${sessionId}`).emit(SocketEventNames.TIMER_WARNING, remainingTime);
  }

  if (remainingTime === 0) {
    io.to(`session:${sessionId}`).emit(SocketEventNames.TIMER_EXPIRED);
    logger.info(
      `Timer expired for session ${sessionId}${delegateId ? ` (delegate: ${delegateId})` : ''}`
    );
  }
}

/**
 * Emit demographics update
 */
export function emitDemographicsUpdate(
  io: SocketServer,
  sessionId: string,
  payload: Omit<DemographicsUpdatePayload, 'timestamp'>
): void {
  const fullPayload: DemographicsUpdatePayload = {
    ...payload,
    timestamp: new Date(),
  };

  io.to(`session:${sessionId}`).emit(SocketEventNames.DEMOGRAPHICS_UPDATED, fullPayload);
  logger.debug(`Emitted demographics update for session ${sessionId}`);
}

/**
 * Emit garden state change
 */
export function emitGardenStateChange(
  io: SocketServer,
  sessionId: string,
  payload: Omit<GardenStatePayload, 'timestamp'>
): void {
  const fullPayload: GardenStatePayload = {
    ...payload,
    timestamp: new Date(),
  };

  io.to(`session:${sessionId}`).emit(SocketEventNames.GARDEN_STATE_CHANGED, fullPayload);
  logger.debug(`Emitted garden state change for session ${sessionId}`);
}

/**
 * Emit queue joined event when a speaker joins the queue
 */
export function emitQueueJoined(
  io: SocketServer,
  sessionId: string,
  queueItem: IQueueItem,
  position: number
): void {
  const payload = {
    sessionId,
    queueItem,
    position,
    timestamp: new Date(),
  };

  io.to(`session:${sessionId}`).emit(SocketEventNames.QUEUE_JOINED, payload);
  logger.info(`Emitted queue joined for delegate ${queueItem.delegateId} at position ${position}`);
}

/**
 * Emit queue left event when a speaker leaves the queue
 */
export function emitQueueLeft(
  io: SocketServer,
  sessionId: string,
  queueItemId: string,
  delegateId: string,
  reason: 'completed' | 'removed' | 'timeout'
): void {
  const payload = {
    sessionId,
    queueItemId,
    delegateId,
    reason,
    timestamp: new Date(),
  };

  io.to(`session:${sessionId}`).emit(SocketEventNames.QUEUE_LEFT, payload);
  logger.info(`Emitted queue left for delegate ${delegateId}, reason: ${reason}`);
}

/**
 * Emit queue snapshot for initial connection state sync
 */
export function emitQueueSnapshot(
  io: SocketServer,
  socketId: string,
  sessionId: string,
  queue: IQueueItem[],
  currentSpeaker: IQueueItem | null,
  onDeck: IQueueItem[]
): void {
  const payload = {
    sessionId,
    queue,
    currentSpeaker,
    onDeck,
    totalInQueue: queue.length,
    timestamp: new Date(),
  };

  io.to(socketId).emit(SocketEventNames.QUEUE_SNAPSHOT, payload);
  logger.debug(`Emitted queue snapshot to ${socketId} for session ${sessionId}`);
}

/**
 * Broadcast an error to specific clients
 */
export function emitError(
  io: SocketServer,
  target: string | string[],
  code: string,
  message: string
): void {
  const errorPayload = { code, message };

  if (Array.isArray(target)) {
    target.forEach((socketId) => {
      io.to(socketId).emit(SocketEventNames.ERROR, errorPayload);
    });
  } else {
    io.to(target).emit(SocketEventNames.ERROR, errorPayload);
  }

  logger.error(`Emitted error ${code} to ${target}: ${message}`);
}
