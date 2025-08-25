import { ServerOptions } from 'socket.io';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const socketConfig: Partial<ServerOptions> = {
  cors: {
    origin: isDevelopment 
      ? ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001']
      : process.env.FRONTEND_URL || 'https://convention-speaker-list.com',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  
  // Transport options
  transports: ['websocket', 'polling'],
  
  // Connection parameters
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  connectTimeout: 45000, // 45 seconds
  
  // Max HTTP buffer size (1MB)
  maxHttpBufferSize: 1e6,
  
  // Allow binary data
  allowEIO3: true,
  
  // Path for socket.io endpoint
  path: '/socket.io/',
  
  // Server options
  serveClient: false, // Don't serve client files
  
  // Adapter options (for scaling with Redis in production)
  // adapter: production ? createAdapter(redisClient) : undefined
};

// Namespace-specific configurations
export const namespaceConfig = {
  admin: {
    path: '/admin',
    authRequired: true,
    permissions: ['queue:manage', 'timer:control', 'session:manage'],
  },
  spectator: {
    path: '/spectator',
    authRequired: true,
    permissions: ['queue:view', 'timer:view', 'session:view'],
  },
};

// Room configuration
export const roomConfig = {
  maxRoomsPerClient: 5,
  roomPrefix: 'session:',
};

// Event rate limiting
export const rateLimits = {
  'queue:join': { points: 5, duration: 60 }, // 5 joins per minute
  'speaker:next': { points: 10, duration: 60 }, // 10 advances per minute
  'timer:start': { points: 5, duration: 60 }, // 5 timer starts per minute
  default: { points: 100, duration: 60 }, // 100 events per minute default
};