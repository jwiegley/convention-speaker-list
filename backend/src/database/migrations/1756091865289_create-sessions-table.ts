import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create sessions table
  pgm.createTable('sessions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      notNull: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    start_time: {
      type: 'timestamp',
      notNull: false,
    },
    end_time: {
      type: 'timestamp',
      notNull: false,
    },
    is_tracked: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    garden_state: {
      type: 'integer',
      notNull: true,
      default: 0,
      check: 'garden_state >= 0 AND garden_state <= 32',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
  
  // Create indexes for performance
  pgm.createIndex('sessions', 'is_tracked');
  pgm.createIndex('sessions', 'start_time');
  pgm.createIndex('sessions', 'garden_state');
  
  // Create trigger for updated_at
  pgm.createTrigger('sessions', 'update_updated_at_column', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
  
  // Add constraint for end_time > start_time
  pgm.addConstraint('sessions', 'check_session_times', {
    check: '(start_time IS NULL OR end_time IS NULL OR end_time > start_time)',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop constraints
  pgm.dropConstraint('sessions', 'check_session_times');
  
  // Drop trigger
  pgm.dropTrigger('sessions', 'update_updated_at_column');
  
  // Drop indexes
  pgm.dropIndex('sessions', 'garden_state');
  pgm.dropIndex('sessions', 'start_time');
  pgm.dropIndex('sessions', 'is_tracked');
  
  // Drop table
  pgm.dropTable('sessions');
}