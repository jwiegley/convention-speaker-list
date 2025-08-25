import dotenv from 'dotenv';
import path from 'path';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : process.env.NODE_ENV === 'docker'
  ? '.env.docker'
  : '.env.development';

dotenv.config({ path: path.resolve(process.cwd(), '..', envFile) });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });

// Type-safe environment configuration
interface Config {
  env: string;
  port: number;
  database: {
    url: string;
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  redis: {
    url: string;
    host: string;
    port: number;
  };
  frontend: {
    url: string;
  };
  socketIO: {
    corsOrigin: string;
  };
  jwt: {
    secret: string;
  };
  session: {
    secret: string;
    maxAge: number;
  };
  admin: {
    defaultPin: string;
  };
  logging: {
    level: string;
  };
}

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'SESSION_SECRET',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Export configuration object
export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  database: {
    url: process.env.DATABASE_URL!,
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    name: process.env.DATABASE_NAME || 'convention_db',
    user: process.env.DATABASE_USER || 'convention_user',
    password: process.env.DATABASE_PASSWORD || 'convention_pass',
  },
  redis: {
    url: process.env.REDIS_URL!,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },
  socketIO: {
    corsOrigin: process.env.SOCKET_IO_CORS_ORIGIN || 'http://localhost:5173',
  },
  jwt: {
    secret: process.env.JWT_SECRET!,
  },
  session: {
    secret: process.env.SESSION_SECRET!,
    maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
  },
  admin: {
    defaultPin: process.env.DEFAULT_ADMIN_PIN || '1234',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;