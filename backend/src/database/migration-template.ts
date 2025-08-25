import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add your migration logic here
  // Example:
  // pgm.createTable('table_name', {
  //   id: 'id',
  //   name: { type: 'varchar(255)', notNull: true },
  //   created_at: {
  //     type: 'timestamp',
  //     notNull: true,
  //     default: pgm.func('current_timestamp'),
  //   },
  // });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Add your rollback logic here
  // Example:
  // pgm.dropTable('table_name');
}