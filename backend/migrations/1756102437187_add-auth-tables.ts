import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create users table for authentication
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      default: pgm.func('gen_random_uuid()'),
      primaryKey: true,
      notNull: true
    },
    username: {
      type: 'varchar(255)',
      notNull: true,
      unique: true
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true
    },
    role: {
      type: 'varchar(50)',
      notNull: true,
      check: "role IN ('admin', 'spectator')"
    },
    last_login: {
      type: 'timestamp'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // Create index on username for faster lookups
  pgm.createIndex('users', 'username');
  pgm.createIndex('users', 'role');

  // Create sessions table for tracking active sessions
  pgm.createTable('user_sessions', {
    id: {
      type: 'uuid',
      default: pgm.func('gen_random_uuid()'),
      primaryKey: true,
      notNull: true
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    refresh_token: {
      type: 'text',
      unique: true
    },
    ip_address: {
      type: 'varchar(45)'  // Support IPv6
    },
    user_agent: {
      type: 'text'
    },
    last_activity: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    expires_at: {
      type: 'timestamp',
      notNull: true
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // Create indexes for session lookups
  pgm.createIndex('user_sessions', 'user_id');
  pgm.createIndex('user_sessions', 'refresh_token');
  pgm.createIndex('user_sessions', 'expires_at');

  // Create audit_log table for tracking admin actions
  pgm.createTable('audit_log', {
    id: {
      type: 'uuid',
      default: pgm.func('gen_random_uuid()'),
      primaryKey: true,
      notNull: true
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE'
    },
    action: {
      type: 'varchar(255)',
      notNull: true
    },
    entity_type: {
      type: 'varchar(100)',
      notNull: true
    },
    entity_id: {
      type: 'varchar(255)'
    },
    old_value: {
      type: 'jsonb'
    },
    new_value: {
      type: 'jsonb'
    },
    ip_address: {
      type: 'varchar(45)'
    },
    user_agent: {
      type: 'text'
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    }
  });

  // Create indexes for audit log queries
  pgm.createIndex('audit_log', 'user_id');
  pgm.createIndex('audit_log', 'action');
  pgm.createIndex('audit_log', 'entity_type');
  pgm.createIndex('audit_log', 'created_at');

  // Create rate_limit table for tracking API rate limits
  pgm.createTable('rate_limits', {
    id: {
      type: 'uuid',
      default: pgm.func('gen_random_uuid()'),
      primaryKey: true,
      notNull: true
    },
    identifier: {
      type: 'varchar(255)',
      notNull: true
    },
    endpoint: {
      type: 'varchar(255)',
      notNull: true
    },
    count: {
      type: 'integer',
      notNull: true,
      default: 1
    },
    window_start: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP')
    },
    window_end: {
      type: 'timestamp',
      notNull: true
    }
  });

  // Create composite index for rate limit lookups
  pgm.createIndex('rate_limits', ['identifier', 'endpoint', 'window_end']);

  // Add trigger to update updated_at column
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);

  pgm.sql(`
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop triggers
  pgm.sql('DROP TRIGGER IF EXISTS update_users_updated_at ON users');
  pgm.sql('DROP FUNCTION IF EXISTS update_updated_at_column()');

  // Drop tables in reverse order
  pgm.dropTable('rate_limits');
  pgm.dropTable('audit_log');
  pgm.dropTable('user_sessions');
  pgm.dropTable('users');
}