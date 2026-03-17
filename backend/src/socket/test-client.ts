import { io, Socket } from 'socket.io-client';
import { ServerToClientEvents, ClientToServerEvents } from '../../../shared/src/types/socket';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

async function testSocketConnection() {
  console.log('Testing Socket.io connection...');

  // Connect to main namespace
  const socket: TestSocket = io('http://localhost:3001', {
    transports: ['websocket'],
    reconnection: true,
  });

  socket.on('connect', () => {
    console.log('✅ Connected to Socket.io server');
    console.log('Socket ID:', socket.id);

    // Test joining a session
    socket.emit('join:session', 'test-session-123');
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });

  socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
  });

  // Test admin namespace
  const adminSocket: TestSocket = io('http://localhost:3001/admin', {
    transports: ['websocket'],
    auth: {
      token: 'test-admin-token', // Would need real JWT in production
    },
  });

  adminSocket.on('connect', () => {
    console.log('✅ Connected to admin namespace');
  });

  adminSocket.on('connect_error', (error) => {
    console.log('Admin connection error (expected without valid token):', error.message);
  });

  // Keep the test running for a few seconds
  setTimeout(() => {
    console.log('Closing connections...');
    socket.disconnect();
    adminSocket.disconnect();
    process.exit(0);
  }, 5000);
}

// Run the test
testSocketConnection().catch(console.error);
