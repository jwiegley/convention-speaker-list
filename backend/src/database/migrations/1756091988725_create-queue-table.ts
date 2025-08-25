import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create queue status enum
  pgm.createType('queue_status_enum', ['waiting', 'on_deck', 'speaking', 'completed', 'removed']);
  
  // Create queue table
  pgm.createTable('queue', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      notNull: true,
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'sessions',
      onDelete: 'CASCADE',
    },
    delegate_id: {
      type: 'uuid',
      notNull: true,
      references: 'delegates',
      onDelete: 'CASCADE',
    },
    position: {
      type: 'integer',
      notNull: true,
    },
    added_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    status: {
      type: 'queue_status_enum',
      notNull: true,
      default: 'waiting',
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
  pgm.createIndex('queue', ['session_id', 'status', 'position']);
  pgm.createIndex('queue', ['session_id', 'delegate_id']);
  pgm.createIndex('queue', 'status');
  
  // Create unique constraint to prevent duplicate active entries
  pgm.addConstraint('queue', 'unique_active_delegate_per_session', {
    unique: ['session_id', 'delegate_id'],
    where: "status IN ('waiting', 'on_deck', 'speaking')",
  });
  
  // Create trigger for updated_at
  pgm.createTrigger('queue', 'update_updated_at_column', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop trigger
  pgm.dropTrigger('queue', 'update_updated_at_column');
  
  // Drop constraints
  pgm.dropConstraint('queue', 'unique_active_delegate_per_session');
  
  // Drop indexes
  pgm.dropIndex('queue', 'status');
  pgm.dropIndex('queue', ['session_id', 'delegate_id']);
  pgm.dropIndex('queue', ['session_id', 'status', 'position']);
  
  // Drop table
  pgm.dropTable('queue');
  
  // Drop enum type
  pgm.dropType('queue_status_enum');
}