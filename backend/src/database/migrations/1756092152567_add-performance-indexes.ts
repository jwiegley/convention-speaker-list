import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Additional performance indexes for common query patterns

  // Composite index for finding first-time speakers
  pgm.createIndex('delegates', ['has_spoken', 'delegate_number']);

  // Composite index for queue ordering
  pgm.createIndex('queue', ['session_id', 'position']);

  // Partial index for active queue entries (excluding completed)
  pgm.createIndex('queue', ['session_id', 'status', 'position'], {
    name: 'idx_active_queue',
    where: "status != 'completed' AND status != 'removed'",
  });

  // Index for finding speakers currently speaking
  pgm.createIndex('queue', ['session_id'], {
    name: 'idx_current_speaker',
    where: "status = 'speaking'",
  });

  // Composite index for session tracking queries
  pgm.createIndex('sessions', ['is_tracked', 'start_time']);

  // Index for demographic analysis queries
  pgm.createIndex('delegates', ['gender', 'has_spoken']);
  pgm.createIndex('delegates', ['age_bracket', 'has_spoken']);
  pgm.createIndex('delegates', ['race_category', 'has_spoken']);

  // Composite index for speaking history analysis
  pgm.createIndex('speaking_instances', ['delegate_id', 'is_tracked', 'start_time']);

  // Index for finding delegates in any active queue
  pgm.createIndex('queue', 'delegate_id', {
    name: 'idx_delegate_in_queue',
    where: "status IN ('waiting', 'on_deck', 'speaking')",
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop all the indexes in reverse order
  pgm.dropIndex('queue', 'delegate_id', { name: 'idx_delegate_in_queue' });
  pgm.dropIndex('speaking_instances', ['delegate_id', 'is_tracked', 'start_time']);
  pgm.dropIndex('delegates', ['race_category', 'has_spoken']);
  pgm.dropIndex('delegates', ['age_bracket', 'has_spoken']);
  pgm.dropIndex('delegates', ['gender', 'has_spoken']);
  pgm.dropIndex('sessions', ['is_tracked', 'start_time']);
  pgm.dropIndex('queue', ['session_id'], { name: 'idx_current_speaker' });
  pgm.dropIndex('queue', ['session_id', 'status', 'position'], { name: 'idx_active_queue' });
  pgm.dropIndex('queue', ['session_id', 'position']);
  pgm.dropIndex('delegates', ['has_spoken', 'delegate_number']);
}
