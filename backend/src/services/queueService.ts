import { getClient } from '../database';
import {
  IQueueService,
  IQueueAdvanceResult,
  IQueuePosition,
  IQueueState,
} from './interfaces/IQueueService';
import { QueueOperationOptions, QueueEvent } from '../types/queue';
import {
  QueueError,
  DuplicateEntryError,
  DelegateNotFoundError,
  QueueItemNotFoundError,
  PositionLockedError,
  InvalidPositionError,
  ConcurrentModificationError,
} from '../errors/QueueErrors';
import logger from '../utils/logger';
import { EventEmitter } from 'events';
import { IQueueItem } from '@shared/types';
import { QueueStatus } from '@shared/enums';
import { redisService } from './redisService';

export class QueueService implements IQueueService {
  private eventEmitter: EventEmitter;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly ON_DECK_POSITIONS = 3;
  private lockedPositions: Map<string, Set<number>> = new Map();

  constructor() {
    this.eventEmitter = new EventEmitter();
    logger.info('QueueService initialized');
  }
  /**
   * Validate that a delegate exists and can join the queue
   */
  async validateDelegate(delegateId: string): Promise<boolean> {
    const client = await getClient();
    try {
      const result = await client.query('SELECT id, is_active FROM delegates WHERE id = $1', [
        delegateId,
      ]);

      if (result.rows.length === 0) {
        throw new DelegateNotFoundError(delegateId);
      }

      return result.rows[0].is_active !== false;
    } finally {
      client.release();
    }
  }

  /**
   * Check if delegate is already in the queue
   */
  async checkDuplicateEntry(delegateId: string, sessionId: string): Promise<boolean> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT id FROM queue 
         WHERE delegate_id = $1 AND session_id = $2 
         AND status IN ('waiting', 'speaking')`,
        [delegateId, sessionId]
      );

      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate queue position for a delegate based on priority rules
   * Delegates who haven't spoken get priority, up to 4th position maximum
   */
  async calculateQueuePosition(delegateId: string, sessionId: string): Promise<number> {
    const client = await getClient();
    try {
      // Check if delegate has spoken before
      const speakHistory = await client.query(
        'SELECT has_spoken, has_spoken_count FROM delegates WHERE id = $1',
        [delegateId]
      );

      if (speakHistory.rows.length === 0) {
        throw new Error('Delegate not found');
      }

      const hasSpoken = speakHistory.rows[0].has_spoken || false;
      const hasSpokenCount = speakHistory.rows[0].has_spoken_count || 0;

      // Get current queue state
      const queueState = await client.query(
        `SELECT q.*, d.has_spoken, d.has_spoken_count 
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.session_id = $1 AND q.status = 'waiting'
         ORDER BY q.position ASC`,
        [sessionId]
      );

      // If queue is empty, position is 1
      if (queueState.rows.length === 0) {
        return 1;
      }

      // Delegates who haven't spoken get priority
      if (!hasSpoken || hasSpokenCount === 0) {
        // Find the last delegate who hasn't spoken, up to position 3 (0-indexed)
        let targetPosition = 0;
        const maxPriorityPosition = Math.min(3, queueState.rows.length); // Max position 4 (1-indexed)

        for (let i = 0; i < maxPriorityPosition; i++) {
          const row = queueState.rows[i];
          if (!row.has_spoken || row.has_spoken_count === 0) {
            targetPosition = i + 1; // Convert to 1-indexed position
          } else {
            // Found a delegate who has spoken, insert before them
            break;
          }
        }

        // If we haven't found a position yet, check if we should insert at position 4
        if (targetPosition === 0 && queueState.rows.length >= 3) {
          // Check if delegate at position 3 (index 2) has spoken
          if (queueState.rows[2].has_spoken && queueState.rows[2].has_spoken_count > 0) {
            // Insert at position 4
            return 4;
          }
        }

        // Insert after the last non-speaker we found, or at position 1 if none found
        return targetPosition + 1;
      } else {
        // Delegates who have spoken go to the end
        const lastPosition = queueState.rows[queueState.rows.length - 1].position;
        return lastPosition + 1;
      }
    } finally {
      client.release();
    }
  }

  /**
   * Add a delegate to the queue with validation and priority handling
   */
  async addToQueue(
    delegateId: string,
    sessionId: string,
    options: QueueOperationOptions = {}
  ): Promise<IQueueItem> {
    logger.info(`Adding delegate ${delegateId} to queue for session ${sessionId}`);

    // Acquire lock if requested
    let lockId: string | null = null;
    if (options.useLock) {
      lockId = await redisService.acquireLock(`queue:${sessionId}`, options.lockTimeout || 5000);
      if (!lockId) {
        throw new ConcurrentModificationError('Could not acquire queue lock');
      }
    }

    try {
      // Validation
      if (!options.skipValidation) {
        const isValid = await this.validateDelegate(delegateId);
        if (!isValid) {
          throw new QueueError('Delegate is not active', 'DELEGATE_INACTIVE');
        }
      }

      // Check for duplicates
      if (!options.skipDuplicateCheck) {
        const isDuplicate = await this.checkDuplicateEntry(delegateId, sessionId);
        if (isDuplicate) {
          throw new DuplicateEntryError(delegateId);
        }
      }

      const client = await getClient();
      try {
        await client.query('BEGIN');

        // Calculate position
        const position =
          options.forcePriority ?? (await this.calculateQueuePosition(delegateId, sessionId));

        // Check if position is locked
        if (await this.isPositionLocked(position, sessionId)) {
          // Shift to next available position
          const newPosition = await this.findNextAvailablePosition(sessionId, position);
          logger.info(`Position ${position} is locked, using position ${newPosition}`);
        }

        // Shift existing queue items if needed
        await client.query(
          `UPDATE queue 
         SET position = position + 1 
         WHERE session_id = $1 AND position >= $2 AND status = 'waiting'`,
          [sessionId, position]
        );

        // Insert new queue entry
        const result = await client.query(
          `INSERT INTO queue (session_id, delegate_id, position, status, joined_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING *`,
          [sessionId, delegateId, position, QueueStatus.WAITING]
        );

        await client.query('COMMIT');

        const queueItem = this.mapToQueueItem(result.rows[0]);

        // Invalidate cache
        await redisService.invalidateQueueCache(sessionId);

        // Emit event
        if (options.emitEvents !== false) {
          await this.emitQueueUpdate(sessionId, 'added', queueItem);
        }

        return queueItem;
      } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Error adding to queue:', error);
        throw error;
      } finally {
        client.release();
      }
    } finally {
      // Release lock if acquired
      if (lockId) {
        await redisService.releaseLock(`queue:${sessionId}`, lockId);
      }
    }
  }

  /**
   * Remove a delegate from the queue
   */
  async removeFromQueue(queueItemId: string): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get queue item details
      const itemResult = await client.query('SELECT * FROM queue WHERE id = $1', [queueItemId]);

      if (itemResult.rows.length === 0) {
        throw new QueueItemNotFoundError(queueItemId);
      }

      const item = itemResult.rows[0];

      // Mark as removed
      await client.query(
        `UPDATE queue SET status = $1, ended_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [QueueStatus.REMOVED, queueItemId]
      );

      // Reorder remaining items
      await client.query(
        `UPDATE queue 
         SET position = position - 1 
         WHERE session_id = $1 AND position > $2 AND status = 'waiting'`,
        [item.session_id, item.position]
      );

      await client.query('COMMIT');

      // Invalidate cache
      await redisService.invalidateQueueCache(item.session_id);

      // Emit event
      await this.emitQueueUpdate(item.session_id, 'removed', { itemId: queueItemId });

      logger.info(`Removed queue item ${queueItemId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error removing from queue:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get current queue state with Redis caching
   */
  async getQueueState(sessionId: string): Promise<IQueueState> {
    // Try to get from cache first
    const cached = await redisService.getCachedQueueState(sessionId);
    if (cached) {
      // Update lastUpdated to current time for cache hits
      return { ...cached, lastUpdated: new Date() };
    }

    // Fetch from database
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT q.*, d.name, d.number, d.has_spoken_count
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.session_id = $1 AND q.status IN ('waiting', 'speaking')
         ORDER BY 
           CASE WHEN q.status = 'speaking' THEN 0 ELSE 1 END,
           q.position ASC`,
        [sessionId]
      );

      const items = result.rows.map((row) => this.mapToQueueItem(row));
      const currentSpeaker = result.rows.find((r) => r.status === 'speaking');
      const onDeckPositions = result.rows
        .filter((r) => r.status === 'waiting' && r.position <= this.ON_DECK_POSITIONS)
        .map((r) => r.delegate_id);

      const state: IQueueState = {
        sessionId,
        items,
        currentSpeakerId: currentSpeaker?.delegate_id || null,
        onDeckPositions,
        lastUpdated: new Date(),
      };

      // Cache the state
      await redisService.cacheQueueState(sessionId, state);

      return state;
    } finally {
      client.release();
    }
  }

  /**
   * Get queue position for a specific delegate
   */
  async getQueuePosition(delegateId: string, sessionId: string): Promise<IQueuePosition | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT q.position, d.has_spoken_count
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.delegate_id = $1 AND q.session_id = $2 
         AND q.status IN ('waiting', 'speaking')`,
        [delegateId, sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        position: row.position,
        isFirstTimeSpeaker: row.has_spoken_count === 0,
        isOnDeck: row.position <= this.ON_DECK_POSITIONS,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Check if a position is locked (on-deck)
   */
  async isPositionLocked(position: number, sessionId: string): Promise<boolean> {
    const lockedSet = this.lockedPositions.get(sessionId);
    if (!lockedSet) return false;
    return lockedSet.has(position);
  }

  /**
   * Lock on-deck positions to prevent reordering
   */
  async lockOnDeckPositions(sessionId: string): Promise<void> {
    const positions = new Set<number>();
    for (let i = 1; i <= this.ON_DECK_POSITIONS; i++) {
      positions.add(i);
    }
    this.lockedPositions.set(sessionId, positions);
    logger.info(`Locked on-deck positions for session ${sessionId}`);
  }

  /**
   * Unlock on-deck positions
   */
  async unlockOnDeckPositions(sessionId: string): Promise<void> {
    this.lockedPositions.delete(sessionId);
    logger.info(`Unlocked on-deck positions for session ${sessionId}`);
  }

  /**
   * Find next available position if current is locked
   */
  private async findNextAvailablePosition(
    sessionId: string,
    startPosition: number
  ): Promise<number> {
    let position = startPosition;
    while (await this.isPositionLocked(position, sessionId)) {
      position++;
    }
    return position;
  }

  /**
   * Map database row to IQueueItem
   */
  private mapToQueueItem(row: any): IQueueItem {
    return {
      id: row.id,
      sessionId: row.session_id,
      delegateId: row.delegate_id,
      position: row.position,
      status: row.status,
      joinedAt: row.joined_at,
      startedSpeakingAt: row.started_at,
      finishedSpeakingAt: row.ended_at,
      speakingDuration: row.speaking_duration,
      notes: row.notes,
      delegate: row.name
        ? {
            id: row.delegate_id,
            name: row.name,
            number: row.number,
            hasSpeakCount: row.has_spoken_count,
          }
        : undefined,
    } as unknown as IQueueItem;
  }

  /**
   * Reorder queue with a new order of delegate IDs
   */
  async reorderQueue(sessionId: string, newOrder: string[]): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Validate all IDs exist in queue
      const existingResult = await client.query(
        `SELECT delegate_id FROM queue 
         WHERE session_id = $1 AND status = 'waiting'
         ORDER BY position`,
        [sessionId]
      );

      const existingIds = new Set(existingResult.rows.map((r) => r.delegate_id));
      const newOrderSet = new Set(newOrder);

      // Check if all IDs match
      if (existingIds.size !== newOrderSet.size) {
        throw new InvalidPositionError(0);
      }

      for (const id of newOrder) {
        if (!existingIds.has(id)) {
          throw new DelegateNotFoundError(id);
        }
      }

      // Update positions
      for (let i = 0; i < newOrder.length; i++) {
        const position = i + 1;

        // Check if position is locked
        if (await this.isPositionLocked(position, sessionId)) {
          throw new PositionLockedError(position);
        }

        await client.query(
          `UPDATE queue 
           SET position = $1 
           WHERE session_id = $2 AND delegate_id = $3 AND status = 'waiting'`,
          [position, sessionId, newOrder[i]]
        );
      }

      await client.query('COMMIT');

      // Invalidate cache
      await redisService.invalidateQueueCache(sessionId);

      // Emit event
      await this.emitQueueUpdate(sessionId, 'reordered', { newOrder });

      logger.info(`Reordered queue for session ${sessionId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error reordering queue:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Internal method to reorder queue positions after insertions or deletions
   */
  private async reorderQueueInternal(sessionId: string, startPosition: number): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get all queue items that need reordering
      const items = await client.query(
        `SELECT id, position 
         FROM queue 
         WHERE session_id = $1 AND position >= $2 AND status = 'waiting'
         ORDER BY position ASC`,
        [sessionId, startPosition]
      );

      // Update positions sequentially
      let newPosition = startPosition;
      for (const item of items.rows) {
        if (item.position !== newPosition) {
          await client.query('UPDATE queue SET position = $1 WHERE id = $2', [
            newPosition,
            item.id,
          ]);
        }
        newPosition++;
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Advance the queue (move current speaker to completed, advance on-deck)
   */
  async advanceQueue(sessionId: string): Promise<IQueueAdvanceResult> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get current speaker
      const currentSpeaker = await client.query(
        `SELECT q.*, d.name, d.number 
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.session_id = $1 AND q.status = 'speaking'
         LIMIT 1`,
        [sessionId]
      );

      if (currentSpeaker.rows.length > 0) {
        // Mark current speaker as completed
        await client.query(
          `UPDATE queue 
           SET status = 'completed', ended_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [currentSpeaker.rows[0].id]
        );

        // Update delegate's speak count
        await client.query(
          `UPDATE delegates 
           SET has_spoken_count = has_spoken_count + 1 
           WHERE id = $1`,
          [currentSpeaker.rows[0].delegate_id]
        );
      }

      // Get next in line
      const nextSpeaker = await client.query(
        `SELECT q.*, d.name, d.number 
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.session_id = $1 AND q.status = 'waiting'
         ORDER BY q.position ASC
         LIMIT 1`,
        [sessionId]
      );

      let newSpeaker = null;
      if (nextSpeaker.rows.length > 0) {
        // Move to speaking status
        await client.query(
          `UPDATE queue 
           SET status = 'speaking', started_at = CURRENT_TIMESTAMP 
           WHERE id = $1`,
          [nextSpeaker.rows[0].id]
        );
        newSpeaker = nextSpeaker.rows[0];
      }

      // Get new on-deck speaker
      const onDeckSpeaker = await client.query(
        `SELECT q.*, d.name, d.number 
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.session_id = $1 AND q.status = 'waiting'
         ORDER BY q.position ASC
         LIMIT 1`,
        [sessionId]
      );

      await client.query('COMMIT');

      const result: IQueueAdvanceResult = {
        previousSpeaker: currentSpeaker.rows[0]
          ? this.mapToQueueItem(currentSpeaker.rows[0])
          : null,
        currentSpeaker: newSpeaker ? this.mapToQueueItem(newSpeaker) : null,
        onDeck: onDeckSpeaker.rows[0] ? this.mapToQueueItem(onDeckSpeaker.rows[0]) : null,
      };

      // Invalidate cache
      await redisService.invalidateQueueCache(sessionId);

      // Emit event
      await this.emitQueueUpdate(sessionId, 'advanced', result);

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save a snapshot of the current queue state
   */
  async saveQueueSnapshot(sessionId: string): Promise<void> {
    const client = await getClient();
    try {
      // Get current queue state
      const state = await this.getQueueState(sessionId);

      // Save snapshot to database
      await client.query(
        `INSERT INTO queue_snapshots (session_id, snapshot_data, created_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [sessionId, JSON.stringify(state)]
      );

      logger.info(`Saved queue snapshot for session ${sessionId}`);
    } catch (error) {
      logger.error('Error saving queue snapshot:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Restore queue from a saved snapshot
   */
  async restoreQueueFromSnapshot(sessionId: string, snapshotId: string): Promise<void> {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Get snapshot data
      const snapshotResult = await client.query(
        'SELECT snapshot_data FROM queue_snapshots WHERE id = $1 AND session_id = $2',
        [snapshotId, sessionId]
      );

      if (snapshotResult.rows.length === 0) {
        throw new QueueError('Snapshot not found', 'SNAPSHOT_NOT_FOUND', 404);
      }

      const snapshotData = JSON.parse(snapshotResult.rows[0].snapshot_data);

      // Clear current queue
      await client.query(
        `UPDATE queue SET status = 'removed' WHERE session_id = $1 AND status IN ('waiting', 'speaking')`,
        [sessionId]
      );

      // Restore queue items
      for (const item of snapshotData.items) {
        await client.query(
          `INSERT INTO queue (session_id, delegate_id, position, status, joined_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [sessionId, item.delegateId, item.position, item.status, item.joinedAt]
        );
      }

      await client.query('COMMIT');

      // Invalidate cache
      await redisService.invalidateQueueCache(sessionId);

      logger.info(`Restored queue from snapshot ${snapshotId} for session ${sessionId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error restoring queue from snapshot:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Emit queue update events for WebSocket broadcasting
   */
  async emitQueueUpdate(sessionId: string, event: string, data: any): Promise<void> {
    const queueEvent: QueueEvent = {
      type: event as any,
      sessionId,
      timestamp: new Date(),
      data,
    };

    this.eventEmitter.emit('queue:update', queueEvent);
    logger.debug(`Queue event emitted: ${event} for session ${sessionId}`);
  }

  /**
   * Subscribe to queue events
   */
  onQueueUpdate(callback: (event: QueueEvent) => void): void {
    this.eventEmitter.on('queue:update', callback);
  }

  /**
   * Unsubscribe from queue events
   */
  offQueueUpdate(callback: (event: QueueEvent) => void): void {
    this.eventEmitter.off('queue:update', callback);
  }
}

// Create singleton instance
const queueService = new QueueService();

// Export both the class and the singleton instance
export default queueService;
export { queueService };
