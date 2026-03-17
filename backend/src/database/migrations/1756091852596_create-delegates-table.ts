import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create enum types for delegates
  pgm.createType('gender_enum', ['Male', 'Female', 'Other']);
  pgm.createType('age_bracket_enum', ['20s', '30s', '40s', '50s', '60s', '70s+']);
  pgm.createType('race_category_enum', ['White_Persian', 'Non_White_Non_Persian']);

  // Create delegates table
  pgm.createTable('delegates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
      notNull: true,
    },
    delegate_number: {
      type: 'integer',
      notNull: true,
      unique: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    location: {
      type: 'varchar(255)',
      notNull: false,
    },
    gender: {
      type: 'gender_enum',
      notNull: true,
    },
    age_bracket: {
      type: 'age_bracket_enum',
      notNull: true,
    },
    race_category: {
      type: 'race_category_enum',
      notNull: true,
    },
    has_spoken: {
      type: 'boolean',
      notNull: true,
      default: false,
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

  // Create indexes
  pgm.createIndex('delegates', 'delegate_number');
  pgm.createIndex('delegates', 'has_spoken');
  pgm.createIndex('delegates', ['gender', 'age_bracket', 'race_category']);

  // Create trigger for updated_at
  pgm.createTrigger('delegates', 'update_updated_at_column', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Create the function for updating updated_at if it doesn't exist
  pgm.sql(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Drop trigger first
  pgm.dropTrigger('delegates', 'update_updated_at_column');

  // Drop indexes
  pgm.dropIndex('delegates', ['gender', 'age_bracket', 'race_category']);
  pgm.dropIndex('delegates', 'has_spoken');
  pgm.dropIndex('delegates', 'delegate_number');

  // Drop table
  pgm.dropTable('delegates');

  // Drop enum types
  pgm.dropType('race_category_enum');
  pgm.dropType('age_bracket_enum');
  pgm.dropType('gender_enum');
}
