import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

// Create SQLite database for development
export async function initSQLiteDb() {
  const db = await open({
    filename: path.join(process.cwd(), 'convention.db'),
    driver: sqlite3.Database,
  });

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      started_at DATETIME,
      ended_at DATETIME,
      start_time DATETIME,
      end_time DATETIME,
      is_active BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delegates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      delegate_number TEXT UNIQUE,
      gender TEXT,
      age_group TEXT,
      race TEXT,
      email TEXT,
      phone TEXT,
      location TEXT,
      personal_notes TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      delegate_id INTEGER,
      position INTEGER,
      priority TEXT DEFAULT 'normal',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'waiting',
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (delegate_id) REFERENCES delegates(id)
    );

    CREATE TABLE IF NOT EXISTS speaker_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      delegate_id INTEGER,
      start_time DATETIME,
      end_time DATETIME,
      duration INTEGER,
      notes TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (delegate_id) REFERENCES delegates(id)
    );

    CREATE TABLE IF NOT EXISTS speaking_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      delegate_id INTEGER,
      started_at DATETIME,
      ended_at DATETIME,
      duration INTEGER,
      notes TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id),
      FOREIGN KEY (delegate_id) REFERENCES delegates(id)
    );
  `);

  // Insert sample data
  await db.run(`
    INSERT OR IGNORE INTO sessions (id, name, is_active)
    VALUES (1, 'Main Session', 1)
  `);

  return db;
}

// Export a mock pool interface for compatibility
export const sqlitePool = {
  query: async (text: string, params?: any[]) => {
    const db = await initSQLiteDb();
    try {
      // Convert PostgreSQL-style parameters ($1, $2) to SQLite-style (?)
      let sqliteQuery = text;
      if (params && params.length > 0) {
        // Replace $1, $2, etc. with ?
        sqliteQuery = text.replace(/\$(\d+)/g, '?');
      }

      // Handle special PostgreSQL functions
      sqliteQuery = sqliteQuery
        .replace(/EXTRACT\(EPOCH FROM \((.*?)\)\)/gi, '(strftime("%s", $1))')
        .replace(/COUNT\(\*\) FROM sessions\s*$/i, 'COUNT(*) as count FROM sessions');

      if (sqliteQuery.toLowerCase().startsWith('select')) {
        const result = await db.all(sqliteQuery, params);
        return { rows: result, rowCount: result.length };
      } else {
        const result = await db.run(sqliteQuery, params);
        return { rows: [], rowCount: result.changes };
      }
    } finally {
      await db.close();
    }
  },
  connect: async () => {
    const db = await initSQLiteDb();
    return {
      query: async (text: string, params?: any[]) => {
        // Convert PostgreSQL-style parameters ($1, $2) to SQLite-style (?)
        let sqliteQuery = text;
        if (params && params.length > 0) {
          sqliteQuery = text.replace(/\$(\d+)/g, '?');
        }

        // Handle special PostgreSQL functions
        sqliteQuery = sqliteQuery
          .replace(/EXTRACT\(EPOCH FROM \((.*?)\)\)/gi, '(strftime("%s", $1))')
          .replace(/COUNT\(\*\) FROM sessions\s*$/i, 'COUNT(*) as count FROM sessions');

        if (sqliteQuery.toLowerCase().startsWith('select')) {
          const result = await db.all(sqliteQuery, params);
          return { rows: result, rowCount: result.length };
        } else if (
          text.toUpperCase() === 'BEGIN' ||
          text.toUpperCase() === 'COMMIT' ||
          text.toUpperCase() === 'ROLLBACK'
        ) {
          await db.exec(text);
          return { rows: [], rowCount: 0 };
        } else {
          const result = await db.run(sqliteQuery, params);
          return { rows: [], rowCount: result.changes };
        }
      },
      release: () => db.close(),
    };
  },
};
