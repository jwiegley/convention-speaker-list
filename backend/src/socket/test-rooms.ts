#!/usr/bin/env ts-node

import { io as ioc, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from '../../../shared/src/types/socket';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// Test configuration
const TEST_SESSION_ID = 'test-session-001';
const NUM_CLIENTS = 3;

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logEvent(clientId: number, event: string, data?: any) {
  const prefix = `[Client ${clientId}]`;
  log(`${prefix} ${event}`, colors.cyan);
  if (data) {
    console.log('  Data:', JSON.stringify(data, null, 2));
  }
}

async function createClient(id: number): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const client = ioc(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false,
    }) as TestSocket;

    client.on('connect', () => {
      log(`Client ${id} connected with socket ID: ${client.id}`, colors.green);
      
      // Set up event listeners for session lifecycle events
      client.on('session:created', (payload) => {
        logEvent(id, 'Session created', payload);
      });
      
      client.on('session:participant:joined', (payload) => {
        logEvent(id, 'Participant joined', payload);
      });
      
      client.on('session:participant:left', (payload) => {
        logEvent(id, 'Participant left', payload);
      });
      
      client.on('session:ended', (payload) => {
        logEvent(id, 'Session ended', payload);
      });
      
      client.on('error', (error) => {
        logEvent(id, 'Error received', error);
      });
      
      resolve(client);
    });

    client.on('connect_error', (error) => {
      log(`Client ${id} connection error: ${error.message}`, colors.red);
      reject(error);
    });
    
    setTimeout(() => {
      reject(new Error(`Client ${id} connection timeout`));
    }, 5000);
  });
}

async function testRoomManagement() {
  log('\\n=== Testing Room Management with Session Lifecycle ===\\n', colors.bright);
  
  const clients: TestSocket[] = [];
  
  try {
    // Step 1: Create multiple clients
    log('Step 1: Creating clients...', colors.yellow);
    for (let i = 1; i <= NUM_CLIENTS; i++) {
      const client = await createClient(i);
      clients.push(client);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between connections
    }
    
    // Step 2: Have all clients join the same session
    log('\\nStep 2: Joining session...', colors.yellow);
    for (let i = 0; i < clients.length; i++) {
      clients[i].emit('join:session', TEST_SESSION_ID);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay to see events
    }
    
    // Wait to observe events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 3: Have one client leave the session
    log('\\nStep 3: Client 2 leaving session...', colors.yellow);
    clients[1].emit('leave:session', TEST_SESSION_ID);
    
    // Wait to observe leave event
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Have client rejoin
    log('\\nStep 4: Client 2 rejoining session...', colors.yellow);
    clients[1].emit('join:session', TEST_SESSION_ID);
    
    // Wait to observe rejoin event
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 5: Test room-specific broadcasting
    log('\\nStep 5: Testing room-specific events...', colors.yellow);
    // This would typically be done by the server, but we can simulate with admin client
    
    // Step 6: Disconnect clients one by one
    log('\\nStep 6: Disconnecting clients...', colors.yellow);
    for (let i = 0; i < clients.length; i++) {
      log(`Disconnecting client ${i + 1}...`, colors.magenta);
      clients[i].disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Delay to see participant leave events
    }
    
    // Wait to see if session ended event is emitted
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    log('\\n=== Test completed successfully ===\\n', colors.green);
    
  } catch (error) {
    log(`\\nTest failed: ${error}`, colors.red);
    process.exit(1);
  } finally {
    // Ensure all clients are disconnected
    clients.forEach(client => {
      if (client.connected) {
        client.disconnect();
      }
    });
  }
  
  process.exit(0);
}

// Run the test
testRoomManagement().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});