import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create speaking_instances table
  pgm.createTable('speaking_instances', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      notNull: true,
    },
    delegate_id: {
      type: 'uuid',
      notNull: true,
      references: 'delegates',
      onDelete: 'CASCADE',
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'sessions',
      onDelete: 'CASCADE',
    },
    start_time: {
      type: 'timestamp',
      notNull: true,
    },
    end_time: {
      type: 'timestamp',
      notNull: false,
    },
    duration_seconds: {
      type: 'integer',
      notNull: false,
    },
    position_in_queue: {
      type: 'integer',
      notNull: true,
    },
    is_tracked: {
      type: 'boolean',
      notNull: true,
      default: true,
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
  pgm.createIndex('speaking_instances', ['delegate_id', 'session_id']);
  pgm.createIndex('speaking_instances', ['session_id', 'start_time']);
  pgm.createIndex('speaking_instances', 'delegate_id');
  pgm.createIndex('speaking_instances', 'is_tracked');

  // Create trigger for updated_at
  pgm.createTrigger('speaking_instances', 'update_updated_at_column', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Add constraint for end_time > start_time
  pgm.addConstraint('speaking_instances', 'check_speaking_times', {
    check: '(end_time IS NULL OR end_time > start_time)',
  });

  // Add trigger to calculate duration_seconds when end_time is set
  pgm.sql(`
    CREATE OR REPLACE FUNCTION calculate_duration_seconds()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::INTEGER;
      END IF;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  pgm.createTrigger('speaking_instances', 'calculate_duration', {
    when: 'BEFORE',
    operation: ['INSERT', 'UPDATE'],
    function: 'calculate_duration_seconds',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop triggers
  pgm.dropTrigger('speaking_instances', 'calculate_duration');
  pgm.dropTrigger('speaking_instances', 'update_updated_at_column');

  // Drop function
  pgm.sql('DROP FUNCTION IF EXISTS calculate_duration_seconds()');

  // Drop constraints
  pgm.dropConstraint('speaking_instances', 'check_speaking_times');

  // Drop indexes
  pgm.dropIndex('speaking_instances', 'is_tracked');
  pgm.dropIndex('speaking_instances', 'delegate_id');
  pgm.dropIndex('speaking_instances', ['session_id', 'start_time']);
  pgm.dropIndex('speaking_instances', ['delegate_id', 'session_id']);

  // Drop table
  pgm.dropTable('speaking_instances');
}
