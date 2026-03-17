#!/usr/bin/env node

import { runner } from 'node-pg-migrate';
import { getMigrationConfig } from './config';
import path from 'path';

async function runMigrations() {
  const config = getMigrationConfig();

  // Parse command line arguments
  const args = process.argv.slice(2);
  const direction = args.includes('down') ? 'down' : 'up';
  const count = args.find((arg) => arg.startsWith('--count='))?.split('=')[1];

  try {
    console.log(`Running migrations ${direction}...`);

    const result = await runner({
      ...config,
      direction: direction as 'up' | 'down',
      count: count ? parseInt(count, 10) : undefined,
      dir: path.join(__dirname, 'migrations'),
      migrationsTable: 'pgmigrations',
      checkOrder: true,
      verbose: true,
    });

    if (result.length === 0) {
      console.log('No migrations to run.');
    } else {
      console.log(`Successfully ran ${result.length} migration(s).`);
      result.forEach((migration) => {
        console.log(`  - ${migration}`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

export default runMigrations;
