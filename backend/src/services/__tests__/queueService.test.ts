import { QueueService } from '../queueService';
import { redisService } from '../redisService';
import * as database from '../../database';
import {
  DuplicateEntryError,
  DelegateNotFoundError,
  QueueItemNotFoundError,
  PositionLockedError,
  ConcurrentModificationError,
} from '../../errors/QueueErrors';
import { QueueStatus } from '@shared/enums';

// Mock dependencies
jest.mock('../../database');
jest.mock('../redisService');
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
  },
}));

describe('QueueService', () => {
  let queueService: QueueService;
  let mockClient: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create new instance for each test
    queueService = new QueueService();

    // Setup mock database client
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (database.getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('calculateQueuePosition', () => {
    it('should return position 1 for empty queue', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ has_spoken_count: 0 }] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const position = await queueService.calculateQueuePosition('delegate1', 'session1');

      expect(position).toBe(1);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should prioritize first-time speakers', async () => {
      // Mock delegate with has_spoken_count = 0
      mockClient.query.mockResolvedValueOnce({
        rows: [{ has_spoken: false, has_spoken_count: 0 }],
      });

      // Mock existing queue with mix of speakers
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { position: 1, has_spoken: false, has_spoken_count: 0 },
          { position: 2, has_spoken: false, has_spoken_count: 0 },
          { position: 3, has_spoken: true, has_spoken_count: 1 },
          { position: 4, has_spoken: true, has_spoken_count: 2 },
        ],
      });

      const position = await queueService.calculateQueuePosition('delegate1', 'session1');

      // Should be placed after last first-time speaker
      expect(position).toBe(3);
    });

    it('should place repeat speakers at the end', async () => {
      // Mock delegate with has_spoken_count > 0
      mockClient.query.mockResolvedValueOnce({ rows: [{ has_spoken: true, has_spoken_count: 2 }] });

      // Mock existing queue
      mockClient.query.mockResolvedValueOnce({
        rows: [
          { position: 1, has_spoken: false, has_spoken_count: 0 },
          { position: 2, has_spoken: true, has_spoken_count: 1 },
          { position: 3, has_spoken: true, has_spoken_count: 1 },
        ],
      });

      const position = await queueService.calculateQueuePosition('delegate1', 'session1');

      // Should be placed at the end
      expect(position).toBe(4);
    });

    it('should throw error if delegate not found', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await expect(queueService.calculateQueuePosition('nonexistent', 'session1')).rejects.toThrow(
        'Delegate not found'
      );
    });
  });

  describe('addToQueue', () => {
    beforeEach(() => {
      // Mock successful validation
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, is_active FROM delegates')) {
          return { rows: [{ id: 'delegate1', is_active: true }] };
        }
        if (sql.includes('SELECT id FROM queue')) {
          return { rows: [] }; // No duplicates
        }
        if (sql.includes('SELECT has_spoken')) {
          return { rows: [{ has_spoken: false, has_spoken_count: 0 }] };
        }
        if (sql.includes('FROM queue q') && sql.includes("status = 'waiting'")) {
          return { rows: [] }; // Empty queue for position calculation
        }
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return {};
        }
        if (sql.includes('UPDATE queue')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO queue')) {
          return {
            rows: [
              {
                id: 'queue1',
                session_id: 'session1',
                delegate_id: 'delegate1',
                position: 1,
                status: QueueStatus.WAITING,
                joined_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });
    });

    it('should add delegate to queue successfully', async () => {
      const result = await queueService.addToQueue('delegate1', 'session1');

      expect(result).toHaveProperty('id', 'queue1');
      expect(result).toHaveProperty('delegateId', 'delegate1');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(redisService.invalidateQueueCache).toHaveBeenCalledWith('session1');
    });

    it('should throw error for duplicate entry', async () => {
      // Mock duplicate entry found
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, is_active FROM delegates')) {
          return { rows: [{ id: 'delegate1', is_active: true }] };
        }
        if (sql.includes('SELECT id FROM queue')) {
          return { rows: [{ id: 'existing' }] }; // Duplicate found
        }
        return { rows: [] };
      });

      await expect(queueService.addToQueue('delegate1', 'session1')).rejects.toThrow(
        DuplicateEntryError
      );
    });

    it('should acquire lock when requested', async () => {
      (redisService.acquireLock as jest.Mock).mockResolvedValue('lock123');
      (redisService.releaseLock as jest.Mock).mockResolvedValue(true);

      await queueService.addToQueue('delegate1', 'session1', { useLock: true });

      expect(redisService.acquireLock).toHaveBeenCalledWith('queue:session1', 5000);
      expect(redisService.releaseLock).toHaveBeenCalledWith('queue:session1', 'lock123');
    });

    it('should throw error when lock cannot be acquired', async () => {
      (redisService.acquireLock as jest.Mock).mockResolvedValue(null);

      await expect(
        queueService.addToQueue('delegate1', 'session1', { useLock: true })
      ).rejects.toThrow(ConcurrentModificationError);
    });
  });

  describe('removeFromQueue', () => {
    it('should remove queue item successfully', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return {};
        }
        if (sql.includes('SELECT * FROM queue')) {
          return {
            rows: [
              {
                id: 'queue1',
                session_id: 'session1',
                position: 2,
              },
            ],
          };
        }
        return { rows: [] };
      });

      await queueService.removeFromQueue('queue1');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE queue SET status ='),
        expect.arrayContaining([QueueStatus.REMOVED, 'queue1'])
      );
      expect(redisService.invalidateQueueCache).toHaveBeenCalledWith('session1');
    });

    it('should throw error if queue item not found', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT * FROM queue')) {
          return { rows: [] };
        }
        return {};
      });

      await expect(queueService.removeFromQueue('nonexistent')).rejects.toThrow(
        QueueItemNotFoundError
      );
    });
  });

  describe('advanceQueue', () => {
    it('should advance queue correctly', async () => {
      // Mock current speaker
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return {};
        }
        if (sql.includes("q.status = 'speaking'")) {
          return {
            rows: [
              {
                id: 'queue1',
                delegate_id: 'delegate1',
                name: 'Speaker 1',
                number: '001',
              },
            ],
          };
        }
        if (sql.includes("q.status = 'waiting'")) {
          return {
            rows: [
              {
                id: 'queue2',
                delegate_id: 'delegate2',
                name: 'Speaker 2',
                number: '002',
              },
            ],
          };
        }
        return { rows: [] };
      });

      const result = await queueService.advanceQueue('session1');

      expect(result.previousSpeaker).toBeTruthy();
      expect(result.currentSpeaker).toBeTruthy();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE delegates'),
        expect.arrayContaining(['delegate1'])
      );
      expect(redisService.invalidateQueueCache).toHaveBeenCalledWith('session1');
    });

    it('should handle empty queue gracefully', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await queueService.advanceQueue('session1');

      expect(result.previousSpeaker).toBeNull();
      expect(result.currentSpeaker).toBeNull();
      expect(result.onDeck).toBeNull();
    });
  });

  describe('Position Locking', () => {
    it('should lock on-deck positions', async () => {
      await queueService.lockOnDeckPositions('session1');

      const isLocked1 = await queueService.isPositionLocked(1, 'session1');
      const isLocked2 = await queueService.isPositionLocked(2, 'session1');
      const isLocked3 = await queueService.isPositionLocked(3, 'session1');
      const isLocked4 = await queueService.isPositionLocked(4, 'session1');

      expect(isLocked1).toBe(true);
      expect(isLocked2).toBe(true);
      expect(isLocked3).toBe(true);
      expect(isLocked4).toBe(false);
    });

    it('should unlock on-deck positions', async () => {
      await queueService.lockOnDeckPositions('session1');
      await queueService.unlockOnDeckPositions('session1');

      const isLocked = await queueService.isPositionLocked(1, 'session1');

      expect(isLocked).toBe(false);
    });
  });

  describe('reorderQueue', () => {
    it('should reorder queue with new order', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return {};
        }
        if (sql.includes('SELECT delegate_id FROM queue')) {
          return {
            rows: [
              { delegate_id: 'delegate1' },
              { delegate_id: 'delegate2' },
              { delegate_id: 'delegate3' },
            ],
          };
        }
        return { rows: [] };
      });

      const newOrder = ['delegate3', 'delegate1', 'delegate2'];
      await queueService.reorderQueue('session1', newOrder);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(redisService.invalidateQueueCache).toHaveBeenCalledWith('session1');
    });

    it('should throw error if delegate not in queue', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT delegate_id FROM queue')) {
          return {
            rows: [{ delegate_id: 'delegate1' }, { delegate_id: 'delegate2' }],
          };
        }
        return {};
      });

      const newOrder = ['delegate1', 'delegate3']; // delegate3 not in queue

      await expect(queueService.reorderQueue('session1', newOrder)).rejects.toThrow(
        DelegateNotFoundError
      );
    });

    it('should throw error if position is locked', async () => {
      await queueService.lockOnDeckPositions('session1');

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT delegate_id FROM queue')) {
          return {
            rows: [{ delegate_id: 'delegate1' }, { delegate_id: 'delegate2' }],
          };
        }
        return {};
      });

      await expect(
        queueService.reorderQueue('session1', ['delegate1', 'delegate2'])
      ).rejects.toThrow(PositionLockedError);
    });
  });

  describe('getQueueState', () => {
    it('should return cached state if available', async () => {
      const cachedState = {
        sessionId: 'session1',
        items: [],
        currentSpeakerId: null,
        onDeckPositions: [],
        lastUpdated: new Date('2024-01-01'),
      };

      (redisService.getCachedQueueState as jest.Mock).mockResolvedValue(cachedState);

      const state = await queueService.getQueueState('session1');

      expect(state.sessionId).toBe('session1');
      expect(state.lastUpdated).toBeInstanceOf(Date);
      expect(mockClient.query).not.toHaveBeenCalled(); // Should not hit database
    });

    it('should fetch from database if cache miss', async () => {
      (redisService.getCachedQueueState as jest.Mock).mockResolvedValue(null);

      mockClient.query.mockResolvedValue({
        rows: [
          {
            id: 'queue1',
            session_id: 'session1',
            delegate_id: 'delegate1',
            position: 1,
            status: QueueStatus.SPEAKING,
            joined_at: new Date(),
            name: 'Speaker 1',
            number: '001',
            has_spoken_count: 0,
          },
        ],
      });

      const state = await queueService.getQueueState('session1');

      expect(state.items).toHaveLength(1);
      expect(state.currentSpeakerId).toBe('delegate1');
      expect(redisService.cacheQueueState).toHaveBeenCalledWith('session1', expect.any(Object));
    });
  });

  describe('Persistence and Recovery', () => {
    it('should save queue snapshot', async () => {
      mockClient.query.mockResolvedValue({
        rows: [
          {
            id: 'queue1',
            session_id: 'session1',
            delegate_id: 'delegate1',
            position: 1,
            status: QueueStatus.WAITING,
            joined_at: new Date(),
          },
        ],
      });

      await queueService.saveQueueSnapshot('session1');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO queue_snapshots'),
        expect.arrayContaining(['session1'])
      );
    });

    it('should restore queue from snapshot', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return {};
        }
        if (sql.includes('SELECT snapshot_data')) {
          return {
            rows: [
              {
                snapshot_data: JSON.stringify({
                  items: [
                    {
                      delegateId: 'delegate1',
                      position: 1,
                      status: QueueStatus.WAITING,
                      joinedAt: new Date(),
                    },
                  ],
                }),
              },
            ],
          };
        }
        return { rows: [] };
      });

      await queueService.restoreQueueFromSnapshot('session1', 'snapshot1');

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE queue SET status = 'removed'"),
        ['session1']
      );
      expect(redisService.invalidateQueueCache).toHaveBeenCalledWith('session1');
    });
  });

  describe('Event Emitters', () => {
    it('should emit queue update events', async () => {
      const callback = jest.fn();
      queueService.onQueueUpdate(callback);

      await queueService.emitQueueUpdate('session1', 'added', { id: 'test' });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'added',
          sessionId: 'session1',
          data: { id: 'test' },
        })
      );
    });

    it('should unsubscribe from events', async () => {
      const callback = jest.fn();
      queueService.onQueueUpdate(callback);
      queueService.offQueueUpdate(callback);

      await queueService.emitQueueUpdate('session1', 'added', { id: 'test' });

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('should handle database connection failure gracefully', async () => {
      (database.getClient as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      await expect(queueService.calculateQueuePosition('delegate1', 'session1')).rejects.toThrow(
        'Connection failed'
      );
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, is_active FROM delegates')) {
          return { rows: [{ id: 'delegate1', is_active: true }] };
        }
        if (sql.includes('SELECT id FROM queue') && sql.includes('status IN')) {
          return { rows: [] }; // No duplicates
        }
        if (sql.includes('SELECT has_spoken')) {
          return { rows: [{ has_spoken: false, has_spoken_count: 0 }] };
        }
        if (sql.includes('FROM queue q') && sql.includes("status = 'waiting'")) {
          return { rows: [] }; // Empty queue
        }
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return {};
        }
        if (sql.includes('UPDATE queue')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO queue')) {
          throw new Error('Insert failed');
        }
        return { rows: [] };
      });

      await expect(queueService.addToQueue('delegate1', 'session1')).rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle concurrent modifications correctly', async () => {
      // First lock succeeds, second fails - set up mocks BEFORE calling
      (redisService.acquireLock as jest.Mock)
        .mockResolvedValueOnce('lock1')
        .mockResolvedValueOnce(null);
      (redisService.releaseLock as jest.Mock).mockResolvedValue(true);

      // Set up DB mocks so promise1 doesn't crash during validation
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, is_active FROM delegates')) {
          return { rows: [{ id: 'delegate1', is_active: true }] };
        }
        if (sql.includes('SELECT id FROM queue') && sql.includes('status IN')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT has_spoken')) {
          return { rows: [{ has_spoken: false, has_spoken_count: 0 }] };
        }
        if (sql.includes('FROM queue q') && sql.includes("status = 'waiting'")) {
          return { rows: [] };
        }
        if (sql === 'BEGIN' || sql === 'COMMIT') {
          return {};
        }
        if (sql.includes('UPDATE queue') || sql.includes('INSERT INTO queue')) {
          return {
            rows: [
              {
                id: 'q1',
                session_id: 'session1',
                delegate_id: 'delegate1',
                position: 1,
                status: 'waiting',
                joined_at: new Date(),
              },
            ],
          };
        }
        return { rows: [] };
      });

      // Simulate two concurrent add operations
      const _promise1 = queueService.addToQueue('delegate1', 'session1', { useLock: true });
      const promise2 = queueService.addToQueue('delegate2', 'session1', { useLock: true });

      await expect(promise2).rejects.toThrow(ConcurrentModificationError);
      // Wait for promise1 to settle to avoid dangling promises
      await _promise1.catch(() => {});
    });

    it('should handle Redis unavailability', async () => {
      (redisService.getCachedQueueState as jest.Mock).mockResolvedValue(null);
      (redisService.cacheQueueState as jest.Mock).mockResolvedValue(undefined);

      mockClient.query.mockResolvedValue({ rows: [] });

      // Should continue working when Redis returns null from cache
      const state = await queueService.getQueueState('session1');

      expect(state).toBeDefined();
      expect(state.sessionId).toBe('session1');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large queue efficiently', async () => {
      const largeQueue = Array.from({ length: 1000 }, (_, i) => ({
        position: i + 1,
        has_spoken_count: i % 3,
        delegate_id: `delegate${i}`,
        id: `queue${i}`,
        session_id: 'session1',
        status: QueueStatus.WAITING,
        joined_at: new Date(),
      }));

      mockClient.query.mockResolvedValue({ rows: largeQueue });

      const startTime = Date.now();
      const state = await queueService.getQueueState('session1');
      const endTime = Date.now();

      expect(state.items).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
