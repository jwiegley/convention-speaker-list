#!/usr/bin/env node

import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function createDatabase() {
  const env = process.env.NODE_ENV || 'development';

  // Database names for different environments
  const dbNames: Record<string, string> = {
    development: process.env.DB_NAME || 'convention_dev',
    test: process.env.TEST_DB_NAME || 'convention_test',
    production: process.env.DB_NAME!,
  };

  const dbName = dbNames[env];

  // Connect to postgres database to create the target database
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'convention_user',
    password: process.env.DB_PASSWORD || 'convention_pass',
    database: 'postgres', // Connect to default postgres database
  });

  try {
    await client.connect();

    // Check if database exists
    const result = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);

    if (result.rows.length === 0) {
      // Create database if it doesn't exist
      await client.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database '${dbName}' created successfully.`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }
  } catch (error) {
    console.error('Error creating database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  createDatabase();
}

export default createDatabase;
