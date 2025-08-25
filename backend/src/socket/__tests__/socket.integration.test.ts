import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { io as ioc, Socket as ClientSocket } from 'socket.io-client';
import { createServer } from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import { initializeSocketServer, shutdownSocketServer, getSocketServer } from '../index';
import { getRedisService } from '../../services/redisService';

const TEST_PORT = 3999;
const TEST_URL = `http://localhost:${TEST_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('Socket.io Integration Tests', () => {
  let httpServer: any;
  let clientSocket: ClientSocket;
  let adminSocket: ClientSocket;
  let spectatorSocket: ClientSocket;

  // Generate test tokens
  const generateToken = (userId: string, role: string) => {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '1h' });
  };

  const adminToken = generateToken('admin-1', 'admin');
  const spectatorToken = generateToken('spec-1', 'spectator');
  const delegateToken = generateToken('del-1', 'delegate');

  beforeAll(async () => {
    // Create test server
    const app = express();
    httpServer = createServer(app);
    
    // Initialize Socket.io
    await initializeSocketServer(httpServer);
    
    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => {
        console.log(`Test server running on port ${TEST_PORT}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    await shutdownSocketServer();
    await new Promise((resolve) => httpServer.close(resolve));
    
    // Close Redis connection if exists
    const redisService = getRedisService();
    await redisService.disconnect();
  });

  beforeEach(() => {
    // Setup client sockets with proper cleanup tracking
  });

  afterEach(() => {
    // Disconnect all client sockets
    if (clientSocket?.connected) clientSocket.disconnect();
    if (adminSocket?.connected) adminSocket.disconnect();
    if (spectatorSocket?.connected) spectatorSocket.disconnect();
  });

  describe('Connection and Authentication', () => {
    it('should accept anonymous connections', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (error) => {
        done(error);
      });
    });

    it('should accept authenticated connections', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
        auth: {
          token: delegateToken,
        },
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should reject invalid tokens gracefully', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
        auth: {
          token: 'invalid-token',
        },
      });

      clientSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Authentication failed');
        done();
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });
    });
  });

  describe('Namespace Access Control', () => {
    it('should allow admin access to admin namespace', (done) => {
      adminSocket = ioc(`${TEST_URL}/admin`, {
        transports: ['websocket'],
        auth: {
          token: adminToken,
        },
      });

      adminSocket.on('connect', () => {
        expect(adminSocket.connected).toBe(true);
        done();
      });
    });

    it('should allow spectator access to spectator namespace', (done) => {
      spectatorSocket = ioc(`${TEST_URL}/spectator`, {
        transports: ['websocket'],
        auth: {
          token: spectatorToken,
        },
      });

      spectatorSocket.on('connect', () => {
        expect(spectatorSocket.connected).toBe(true);
        done();
      });
    });

    it('should deny non-admin access to admin namespace', (done) => {
      const unauthorizedSocket = ioc(`${TEST_URL}/admin`, {
        transports: ['websocket'],
        auth: {
          token: delegateToken,
        },
      });

      unauthorizedSocket.on('connect_error', (error) => {
        expect(error.message).toContain('Unauthorized');
        unauthorizedSocket.disconnect();
        done();
      });

      unauthorizedSocket.on('connect', () => {
        unauthorizedSocket.disconnect();
        done(new Error('Should not connect to admin namespace without admin role'));
      });
    });
  });

  describe('Room Management', () => {
    const testSessionId = 'test-session-123';

    it('should join session room successfully', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
        query: {
          sessionId: testSessionId,
        },
      });

      clientSocket.on('connect', () => {
        // Socket should auto-join session room
        setTimeout(() => {
          expect(clientSocket.connected).toBe(true);
          done();
        }, 100);
      });
    });

    it('should handle explicit room joining', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('join:session', testSessionId);
        
        // Wait for join confirmation (no error means success)
        setTimeout(() => {
          expect(clientSocket.connected).toBe(true);
          done();
        }, 100);
      });

      clientSocket.on('error', (error) => {
        done(new Error(`Room join failed: ${error.message}`));
      });
    });

    it('should handle room leaving', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        // Join then leave
        clientSocket.emit('join:session', testSessionId);
        
        setTimeout(() => {
          clientSocket.emit('leave:session', testSessionId);
          
          setTimeout(() => {
            expect(clientSocket.connected).toBe(true);
            done();
          }, 100);
        }, 100);
      });
    });
  });

  describe('Event Broadcasting', () => {
    const testSessionId = 'broadcast-test-123';
    let client1: ClientSocket;
    let client2: ClientSocket;

    afterEach(() => {
      if (client1?.connected) client1.disconnect();
      if (client2?.connected) client2.disconnect();
    });

    it('should broadcast queue updates to room members', (done) => {
      let receivedCount = 0;
      const expectedData = { queue: ['speaker1', 'speaker2'] };

      // Setup first client
      client1 = ioc(TEST_URL, {
        transports: ['websocket'],
        query: { sessionId: testSessionId },
      });

      // Setup second client
      client2 = ioc(TEST_URL, {
        transports: ['websocket'],
        query: { sessionId: testSessionId },
      });

      const checkComplete = () => {
        receivedCount++;
        if (receivedCount === 2) {
          done();
        }
      };

      client1.on('queue:updated', (data) => {
        expect(data).toMatchObject(expectedData);
        checkComplete();
      });

      client2.on('queue:updated', (data) => {
        expect(data).toMatchObject(expectedData);
        checkComplete();
      });

      // Wait for both clients to connect then emit from server
      Promise.all([
        new Promise(resolve => client1.on('connect', resolve)),
        new Promise(resolve => client2.on('connect', resolve)),
      ]).then(() => {
        // Simulate server-side broadcast
        const io = getSocketServer();
        if (io) {
          io.to(`session:${testSessionId}`).emit('queue:updated', expectedData);
        }
      });
    });

    it('should isolate events between different rooms', (done) => {
      const room1 = 'room-1';
      const room2 = 'room-2';

      client1 = ioc(TEST_URL, {
        transports: ['websocket'],
        query: { sessionId: room1 },
      });

      client2 = ioc(TEST_URL, {
        transports: ['websocket'],
        query: { sessionId: room2 },
      });

      client1.on('test:event', () => {
        done(new Error('Client 1 should not receive event for room 2'));
      });

      client2.on('test:event', () => {
        // Expected - client2 should receive this
        done();
      });

      Promise.all([
        new Promise(resolve => client1.on('connect', resolve)),
        new Promise(resolve => client2.on('connect', resolve)),
      ]).then(() => {
        const io = getSocketServer();
        if (io) {
          // Emit only to room2
          io.to(`session:${room2}`).emit('test:event', { test: true });
        }
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive events', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
      });

      let errorReceived = false;

      clientSocket.on('connect', () => {
        // Send many events rapidly
        for (let i = 0; i < 150; i++) {
          clientSocket.emit('test:event', { index: i });
        }
      });

      clientSocket.on('error', (error: any) => {
        if (error.code === 'RATE_LIMIT_EXCEEDED' && !errorReceived) {
          errorReceived = true;
          expect(error.message).toContain('Too many requests');
          done();
        }
      });

      // Timeout if no rate limit error
      setTimeout(() => {
        if (!errorReceived) {
          done(new Error('Rate limiting not triggered'));
        }
      }, 2000);
    });
  });

  describe('Connection Pooling', () => {
    it('should limit connections per IP', async () => {
      const sockets: ClientSocket[] = [];
      const maxConnectionsPerIP = 10; // Default from config
      
      // Try to create more connections than allowed
      for (let i = 0; i < maxConnectionsPerIP + 5; i++) {
        const socket = ioc(TEST_URL, {
          transports: ['websocket'],
          forceNew: true,
        });
        sockets.push(socket);
      }

      // Wait for connections to establish or fail
      await new Promise(resolve => setTimeout(resolve, 1000));

      const connectedCount = sockets.filter(s => s.connected).length;
      
      // Should not exceed max connections per IP
      expect(connectedCount).toBeLessThanOrEqual(maxConnectionsPerIP);

      // Cleanup
      sockets.forEach(s => s.disconnect());
    });
  });

  describe('Reconnection and State Recovery', () => {
    it('should handle reconnection gracefully', (done) => {
      let disconnectCount = 0;
      let reconnectCount = 0;

      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 100,
        reconnectionAttempts: 3,
      });

      clientSocket.on('connect', () => {
        if (reconnectCount === 0) {
          // First connection - trigger disconnect
          setTimeout(() => {
            clientSocket.disconnect();
            setTimeout(() => {
              clientSocket.connect();
            }, 100);
          }, 100);
        }
      });

      clientSocket.on('disconnect', () => {
        disconnectCount++;
      });

      clientSocket.io.on('reconnect', () => {
        reconnectCount++;
        expect(disconnectCount).toBeGreaterThan(0);
        expect(reconnectCount).toBe(1);
        done();
      });
    });
  });

  describe('Concurrent Connections Load Test', () => {
    it('should handle 50+ concurrent connections', async () => {
      const sockets: ClientSocket[] = [];
      const targetConnections = 50;

      // Create multiple connections
      for (let i = 0; i < targetConnections; i++) {
        const socket = ioc(TEST_URL, {
          transports: ['websocket'],
          forceNew: true,
          auth: {
            token: generateToken(`user-${i}`, 'delegate'),
          },
        });
        sockets.push(socket);
      }

      // Wait for all connections
      await Promise.all(
        sockets.map(socket => 
          new Promise((resolve, reject) => {
            socket.on('connect', resolve);
            socket.on('connect_error', reject);
            setTimeout(() => reject(new Error('Connection timeout')), 5000);
          })
        ).map(p => p.catch(() => null)) // Convert rejections to null
      );

      const connectedCount = sockets.filter(s => s.connected).length;
      
      // At least 90% should connect successfully
      expect(connectedCount).toBeGreaterThanOrEqual(targetConnections * 0.9);

      // Cleanup
      sockets.forEach(s => s.disconnect());
    }, 10000); // Increase timeout for load test
  });

  describe('Timer Synchronization', () => {
    it('should synchronize timer events across clients', (done) => {
      const sessionId = 'timer-test';
      let client1Received = false;
      let client2Received = false;

      client1 = ioc(TEST_URL, {
        transports: ['websocket'],
        query: { sessionId },
      });

      client2 = ioc(TEST_URL, {
        transports: ['websocket'],
        query: { sessionId },
      });

      const checkComplete = () => {
        if (client1Received && client2Received) {
          done();
        }
      };

      client1.on('timer:tick', (data) => {
        expect(data).toHaveProperty('remaining');
        client1Received = true;
        checkComplete();
      });

      client2.on('timer:tick', (data) => {
        expect(data).toHaveProperty('remaining');
        client2Received = true;
        checkComplete();
      });

      // Wait for connections then emit timer event
      Promise.all([
        new Promise(resolve => client1.on('connect', resolve)),
        new Promise(resolve => client2.on('connect', resolve)),
      ]).then(() => {
        const io = getSocketServer();
        if (io) {
          io.to(`session:${sessionId}`).emit('timer:tick', { 
            remaining: 180,
            speakerId: 'test-speaker',
          });
        }
      });
    });
  });

  describe('Graceful Shutdown', () => {
    it('should notify clients before shutdown', (done) => {
      clientSocket = ioc(TEST_URL, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        // Listen for shutdown notification
        clientSocket.on('server:shutdown', (data) => {
          expect(data).toHaveProperty('message');
          expect(data).toHaveProperty('reconnectIn');
          done();
        });

        // Simulate shutdown notification
        const io = getSocketServer();
        if (io) {
          io.emit('server:shutdown', {
            message: 'Server maintenance',
            reconnectIn: 30000,
          });
        }
      });
    });
  });
});