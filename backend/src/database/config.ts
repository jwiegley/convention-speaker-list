import * as dotenv from 'dotenv';
import { PoolConfig } from 'pg';

// Load environment variables
dotenv.config();

// Database configuration for different environments
export const getDatabaseConfig = (env?: string): PoolConfig => {
  const environment = env || process.env.NODE_ENV || 'development';

  const configs: Record<string, PoolConfig> = {
    development: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'convention_dev',
      user: process.env.DB_USER || 'convention_user',
      password: process.env.DB_PASSWORD || 'convention_pass',
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
    test: {
      host: process.env.TEST_DB_HOST || 'localhost',
      port: parseInt(process.env.TEST_DB_PORT || '5432', 10),
      database: process.env.TEST_DB_NAME || 'convention_test',
      user: process.env.TEST_DB_USER || 'convention_user',
      password: process.env.TEST_DB_PASSWORD || 'convention_pass',
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    },
    production: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT!, 10),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      max: 50,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    },
  };

  return configs[environment] || configs.development;
};

// Migration configuration for node-pg-migrate
export const getMigrationConfig = () => {
  const dbConfig = getDatabaseConfig();

  return {
    databaseUrl: {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
    },
    migrationsTable: 'pgmigrations',
    migrationsSchema: 'public',
    dir: 'src/database/migrations',
    direction: 'up',
    count: undefined,
    timestamp: true,
    checkOrder: true,
    createSchema: false,
    createMigrationsSchema: false,
    verbose: true,
    noLock: false,
  };
};

export default getDatabaseConfig;
