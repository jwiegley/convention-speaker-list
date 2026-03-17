import { Pool, PoolClient } from 'pg';
import { getDatabaseConfig } from './config';
import { sqlitePool } from './sqlite-config';

// Create a singleton pool instance
let pool: Pool | null = null;

export const getPool = (): Pool => {
  // Use SQLite for development without PostgreSQL
  if (process.env.NODE_ENV === 'development' && !process.env.USE_POSTGRES) {
    return sqlitePool as any;
  }

  if (!pool) {
    pool = new Pool(getDatabaseConfig());

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    // Log successful connection
    pool.on('connect', () => {
      console.log('Database pool: New client connected');
    });
  }

  return pool;
};

// Helper function to execute queries
export const query = async (text: string, params?: any[]) => {
  const pool = getPool();
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text, duration, rows: res.rowCount });
  }

  return res;
};

// Helper function to get a client from the pool for transactions
export const getClient = async () => {
  const pool = getPool();
  const client = await pool.connect();

  const release = client.release.bind(client);

  // Override the release method to set a timeout
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
  }, 5000);

  client.release = () => {
    clearTimeout(timeout);
    return release();
  };

  return client;
};

// Close the pool (useful for testing)
export const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

export default {
  getPool,
  query,
  getClient,
  closePool,
};

// Export types
export type { PoolClient } from 'pg';
