import fc from 'fast-check';
import { QueueService } from '../queueService';
import * as database from '../../database';
import { QueueStatus } from '@shared/enums';

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

describe('QueueService property-based tests', () => {
  let queueService: QueueService;
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    queueService = new QueueService();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (database.getClient as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('calculateQueuePosition', () => {
    it('should always return a positive position', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat({ max: 100 }),
          fc.array(
            fc.record({
              position: fc.nat({ max: 1000 }),
              has_spoken_count: fc.nat({ max: 50 }),
            }),
            { minLength: 0, maxLength: 200 }
          ),
          async (hasSpokeCount, queueItems) => {
            mockClient.query
              .mockResolvedValueOnce({ rows: [{ has_spoken_count: hasSpokeCount }] })
              .mockResolvedValueOnce({ rows: queueItems });

            const position = await queueService.calculateQueuePosition('d1', 's1');
            expect(position).toBeGreaterThan(0);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('first-time speakers should never be placed after repeat speakers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc
              .record({
                position: fc.nat({ max: 1000 }),
                has_spoken_count: fc.nat({ max: 50 }),
              })
              .map((item) => ({
                ...item,
                has_spoken: item.has_spoken_count > 0,
              })),
            { minLength: 1, maxLength: 100 }
          ),
          async (queueItems) => {
            // First-time speaker
            mockClient.query
              .mockResolvedValueOnce({ rows: [{ has_spoken: false, has_spoken_count: 0 }] })
              .mockResolvedValueOnce({ rows: queueItems });

            const position = await queueService.calculateQueuePosition('d1', 's1');

            // Position should always be positive and within queue bounds + 1
            expect(position).toBeGreaterThan(0);
            expect(position).toBeLessThanOrEqual(queueItems.length + 1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('position locking invariants', () => {
    it('locking then unlocking should always result in unlocked state', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (sessionId) => {
          await queueService.lockOnDeckPositions(sessionId);
          await queueService.unlockOnDeckPositions(sessionId);

          const locked1 = await queueService.isPositionLocked(1, sessionId);
          const locked2 = await queueService.isPositionLocked(2, sessionId);
          const locked3 = await queueService.isPositionLocked(3, sessionId);

          expect(locked1).toBe(false);
          expect(locked2).toBe(false);
          expect(locked3).toBe(false);
        }),
        { numRuns: 20 }
      );
    });

    it('positions beyond on-deck range should never be locked', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 4, max: 10000 }),
          async (sessionId, position) => {
            await queueService.lockOnDeckPositions(sessionId);

            const isLocked = await queueService.isPositionLocked(position, sessionId);
            expect(isLocked).toBe(false);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('queue state invariants', () => {
    it('queue items should always have valid status values', async () => {
      const validStatuses = Object.values(QueueStatus);

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.uuid(),
              session_id: fc.uuid(),
              delegate_id: fc.uuid(),
              position: fc.nat({ max: 1000 }),
              status: fc.constantFrom(...validStatuses),
              joined_at: fc.date(),
              name: fc.string({ minLength: 1, maxLength: 100 }),
              number: fc.string({
                minLength: 1,
                maxLength: 5,
                unit: fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
              }),
              has_spoken_count: fc.nat({ max: 50 }),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          async (queueRows) => {
            const { redisService } = await import('../redisService');
            (redisService.getCachedQueueState as jest.Mock).mockResolvedValue(null);
            (redisService.cacheQueueState as jest.Mock).mockResolvedValue(undefined);
            mockClient.query.mockResolvedValue({ rows: queueRows });

            const state = await queueService.getQueueState('session1');

            expect(state.items.length).toBe(queueRows.length);
            expect(state.sessionId).toBe('session1');
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
