import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create queue_snapshots table
  pgm.createTable('queue_snapshots', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()')
    },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: 'sessions(id)',
      onDelete: 'CASCADE'
    },
    snapshot_data: {
      type: 'jsonb',
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    created_by: {
      type: 'varchar(255)'
    },
    notes: {
      type: 'text'
    }
  });
  
  // Add indexes
  pgm.addIndex('queue_snapshots', 'session_id');
  pgm.addIndex('queue_snapshots', 'created_at');
  
  // Add composite index for efficient queries
  pgm.addIndex('queue_snapshots', ['session_id', 'created_at'], {
    name: 'idx_queue_snapshots_session_created'
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('queue_snapshots');
}