import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ConnectionRateLimiter } from '../scaling';

describe('Connection Pool Tests', () => {
  // Note: ConnectionPool is instantiated as a singleton, so we'll test via the exported instance
  // For true unit testing, we'd need to refactor to allow dependency injection
  
  describe('ConnectionRateLimiter', () => {
    let rateLimiter: ConnectionRateLimiter;
    
    beforeEach(() => {
      rateLimiter = new ConnectionRateLimiter(10); // 10 events per minute for testing
    });

    it('should allow events within rate limit', () => {
      const socketId = 'test-socket-1';
      
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.checkLimit(socketId)).toBe(true);
      }
    });

    it('should block events exceeding rate limit', () => {
      const socketId = 'test-socket-2';
      
      // Use up the limit
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.checkLimit(socketId)).toBe(true);
      }
      
      // Should block the 11th request
      expect(rateLimiter.checkLimit(socketId)).toBe(false);
    });

    it('should track limits per socket independently', () => {
      const socket1 = 'socket-1';
      const socket2 = 'socket-2';
      
      // Use up limit for socket1
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit(socket1);
      }
      
      // socket2 should still have its full limit
      for (let i = 0; i < 10; i++) {
        expect(rateLimiter.checkLimit(socket2)).toBe(true);
      }
      
      // But socket1 should be blocked
      expect(rateLimiter.checkLimit(socket1)).toBe(false);
    });

    it('should reset limits when explicitly called', () => {
      const socketId = 'test-socket-3';
      
      // Use up the limit
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkLimit(socketId);
      }
      
      // Should be blocked
      expect(rateLimiter.checkLimit(socketId)).toBe(false);
      
      // Reset the limit
      rateLimiter.resetLimit(socketId);
      
      // Should work again
      expect(rateLimiter.checkLimit(socketId)).toBe(true);
    });

    it('should reset limits after time window', (done) => {
      const socketId = 'test-socket-4';
      const shortLimiter = new ConnectionRateLimiter(5);
      
      // Mock Date.now to control time
      const originalNow = Date.now;
      let currentTime = originalNow();
      Date.now = jest.fn(() => currentTime) as any;
      
      // Use up the limit
      for (let i = 0; i < 5; i++) {
        shortLimiter.checkLimit(socketId);
      }
      
      // Should be blocked
      expect(shortLimiter.checkLimit(socketId)).toBe(false);
      
      // Advance time by 61 seconds
      currentTime += 61000;
      
      // Should work again after time window
      expect(shortLimiter.checkLimit(socketId)).toBe(true);
      
      // Restore Date.now
      Date.now = originalNow;
      done();
    });
  });

  describe('Session ID Generation', () => {
    it('should generate consistent session IDs', async () => {
      // Dynamic import to get the function
      const { generateSessionId } = await import('../scaling');
      
      const socketId = 'test-socket-123';
      const sessionId1 = generateSessionId(socketId);
      const sessionId2 = generateSessionId(socketId);
      
      // Should be consistent for same socket ID
      expect(sessionId1).toBe(sessionId2);
      
      // Should include the socket ID
      expect(sessionId1).toContain(socketId);
    });

    it('should include instance identifier when available', async () => {
      const originalEnv = process.env.NODE_APP_INSTANCE;
      process.env.NODE_APP_INSTANCE = '5';
      
      // Re-import to get fresh instance
      jest.resetModules();
      const { generateSessionId } = await import('../scaling');
      
      const socketId = 'test-socket-456';
      const sessionId = generateSessionId(socketId);
      
      expect(sessionId).toBe('5-test-socket-456');
      
      // Restore env
      process.env.NODE_APP_INSTANCE = originalEnv;
    });
  });
});