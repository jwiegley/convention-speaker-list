import { Pool } from 'pg';
import { Transform, Readable } from 'stream';
import { Parser } from 'json2csv';
import { format } from 'date-fns';

export interface ExportOptions {
  sessionId?: string;
  startDate?: Date;
  endDate?: Date;
  includeDemographics?: boolean;
  includeSpeakingHistory?: boolean;
  format?: 'csv' | 'json';
  streaming?: boolean;
}

export interface DelegateExportRow {
  delegate_id: string;
  delegate_name: string;
  delegate_number: string;
  gender?: string;
  age_range?: string;
  race?: string;
  speaking_instances: number;
  total_duration_seconds: number;
  average_duration_seconds: number;
  first_spoke_at?: string;
  last_spoke_at?: string;
  participation_rate?: number;
  longest_speech_seconds?: number;
  shortest_speech_seconds?: number;
}

export interface SessionExportRow {
  session_id: string;
  session_date: string;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  unique_speakers: number;
  total_speaking_instances: number;
  average_speaking_time_seconds: number;
  participation_rate: number;
  gender_balance_score: number;
  age_balance_score: number;
  race_balance_score: number;
}

export interface SpeakingHistoryRow {
  delegate_id: string;
  delegate_name: string;
  session_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  queue_position?: number;
  wait_time_seconds?: number;
  gender?: string;
  age_range?: string;
  race?: string;
}

export class ExportService {
  private db: Pool;
  private batchSize: number = 1000;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Export delegate statistics as CSV
   */
  async exportDelegateStats(options: ExportOptions): Promise<string | Readable> {
    const query = this.buildDelegateStatsQuery(options);

    if (options.streaming) {
      return this.streamCSV(query.text, query.params, this.getDelegateFields(options));
    }

    const result = await this.db.query(query.text, query.params);
    return this.convertToCSV(result.rows, this.getDelegateFields(options));
  }

  /**
   * Export session statistics as CSV
   */
  async exportSessionStats(options: ExportOptions): Promise<string | Readable> {
    const query = this.buildSessionStatsQuery(options);

    if (options.streaming) {
      return this.streamCSV(query.text, query.params, this.getSessionFields());
    }

    const result = await this.db.query(query.text, query.params);
    return this.convertToCSV(result.rows, this.getSessionFields());
  }

  /**
   * Export speaking history as CSV
   */
  async exportSpeakingHistory(options: ExportOptions): Promise<string | Readable> {
    const query = this.buildSpeakingHistoryQuery(options);

    if (options.streaming) {
      return this.streamCSV(query.text, query.params, this.getSpeakingHistoryFields(options));
    }

    const result = await this.db.query(query.text, query.params);
    return this.convertToCSV(result.rows, this.getSpeakingHistoryFields(options));
  }

  /**
   * Build query for delegate statistics
   */
  private buildDelegateStatsQuery(options: ExportOptions) {
    let query = `
      WITH speaker_stats AS (
        SELECT 
          d.id as delegate_id,
          d.name as delegate_name,
          d.delegate_number,
          ${
            options.includeDemographics
              ? `
            d.gender,
            d.age_group as age_range,
            d.race,
          `
              : ''
          }
          COUNT(sh.id) as speaking_instances,
          COALESCE(SUM(sh.duration), 0) as total_duration_seconds,
          COALESCE(AVG(sh.duration), 0) as average_duration_seconds,
          MIN(sh.start_time) as first_spoke_at,
          MAX(sh.start_time) as last_spoke_at,
          COALESCE(MAX(sh.duration), 0) as longest_speech_seconds,
          COALESCE(MIN(sh.duration), 0) as shortest_speech_seconds
        FROM delegates d
        LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.sessionId) {
      conditions.push(`sh.session_id = $${params.length + 1}`);
      params.push(options.sessionId);
    }

    if (options.startDate) {
      conditions.push(`sh.start_time >= $${params.length + 1}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`sh.start_time <= $${params.length + 1}`);
      params.push(options.endDate);
    }

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(' AND ')}`;
    }

    query += `
        GROUP BY d.id, d.name, d.delegate_number
        ${options.includeDemographics ? ', d.gender, d.age_group, d.race' : ''}
      ),
      total_delegates AS (
        SELECT COUNT(DISTINCT id) as total FROM delegates
      )
      SELECT 
        ss.*,
        ROUND((CASE 
          WHEN speaking_instances > 0 THEN 100.0
          ELSE 0
        END / td.total), 2) as participation_rate
      FROM speaker_stats ss
      CROSS JOIN total_delegates td
      ORDER BY speaking_instances DESC, total_duration_seconds DESC
    `;

    return { text: query, params };
  }

  /**
   * Build query for session statistics
   */
  private buildSessionStatsQuery(options: ExportOptions) {
    let query = `
      WITH session_stats AS (
        SELECT 
          s.id as session_id,
          DATE(s.start_time) as session_date,
          s.start_time,
          s.end_time,
          EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.start_time)) / 60 as duration_minutes,
          COUNT(DISTINCT sh.delegate_id) as unique_speakers,
          COUNT(sh.id) as total_speaking_instances,
          AVG(sh.duration) as average_speaking_time_seconds
        FROM sessions s
        LEFT JOIN speaker_history sh ON s.id = sh.session_id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.sessionId) {
      conditions.push(`s.id = $${params.length + 1}`);
      params.push(options.sessionId);
    }

    if (options.startDate) {
      conditions.push(`s.start_time >= $${params.length + 1}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`s.start_time <= $${params.length + 1}`);
      params.push(options.endDate);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
        GROUP BY s.id, s.start_time, s.end_time
      ),
      demographic_balance AS (
        SELECT 
          sh.session_id,
          -- Gender balance calculation
          100 - ABS(50 - (
            SUM(CASE WHEN d.gender = 'Female' THEN 1 ELSE 0 END)::numeric / 
            NULLIF(COUNT(DISTINCT d.id), 0) * 100
          )) as gender_balance,
          -- Age balance (using variance)
          GREATEST(0, 100 - (
            STDDEV(age_counts.count) * 10
          )) as age_balance,
          -- Race balance (using variance)
          GREATEST(0, 100 - (
            STDDEV(race_counts.count) * 10
          )) as race_balance
        FROM speaker_history sh
        JOIN delegates d ON sh.delegate_id = d.id
        LEFT JOIN LATERAL (
          SELECT d2.age_group, COUNT(*) as count
          FROM speaker_history sh2
          JOIN delegates d2 ON sh2.delegate_id = d2.id
          WHERE sh2.session_id = sh.session_id
          GROUP BY d2.age_group
        ) age_counts ON true
        LEFT JOIN LATERAL (
          SELECT d3.race, COUNT(*) as count
          FROM speaker_history sh3
          JOIN delegates d3 ON sh3.delegate_id = d3.id
          WHERE sh3.session_id = sh.session_id
          GROUP BY d3.race
        ) race_counts ON true
        GROUP BY sh.session_id
      ),
      participation AS (
        SELECT 
          s.id as session_id,
          (COUNT(DISTINCT sh.delegate_id)::numeric / 
           NULLIF(COUNT(DISTINCT d.id), 0)) * 100 as participation_rate
        FROM sessions s
        CROSS JOIN delegates d
        LEFT JOIN speaker_history sh ON sh.session_id = s.id AND sh.delegate_id = d.id
        GROUP BY s.id
      )
      SELECT 
        ss.session_id,
        TO_CHAR(ss.session_date, 'YYYY-MM-DD') as session_date,
        TO_CHAR(ss.start_time, 'HH24:MI:SS') as start_time,
        TO_CHAR(ss.end_time, 'HH24:MI:SS') as end_time,
        ROUND(ss.duration_minutes::numeric, 2) as duration_minutes,
        ss.unique_speakers,
        ss.total_speaking_instances,
        ROUND(ss.average_speaking_time_seconds::numeric, 2) as average_speaking_time_seconds,
        ROUND(COALESCE(p.participation_rate, 0), 2) as participation_rate,
        ROUND(COALESCE(db.gender_balance, 50), 2) as gender_balance_score,
        ROUND(COALESCE(db.age_balance, 50), 2) as age_balance_score,
        ROUND(COALESCE(db.race_balance, 50), 2) as race_balance_score
      FROM session_stats ss
      LEFT JOIN demographic_balance db ON ss.session_id = db.session_id
      LEFT JOIN participation p ON ss.session_id = p.session_id
      ORDER BY ss.session_date DESC, ss.start_time DESC
    `;

    return { text: query, params };
  }

  /**
   * Build query for speaking history
   */
  private buildSpeakingHistoryQuery(options: ExportOptions) {
    let query = `
      SELECT 
        sh.delegate_id,
        d.name as delegate_name,
        sh.session_id,
        TO_CHAR(DATE(s.start_time), 'YYYY-MM-DD') as session_date,
        TO_CHAR(sh.start_time, 'HH24:MI:SS') as start_time,
        TO_CHAR(sh.end_time, 'HH24:MI:SS') as end_time,
        sh.duration as duration_seconds,
        q.position as queue_position,
        EXTRACT(EPOCH FROM (sh.start_time - q.joined_at)) as wait_time_seconds
        ${
          options.includeDemographics
            ? `,
        d.gender,
        d.age_group as age_range,
        d.race
        `
            : ''
        }
      FROM speaker_history sh
      JOIN delegates d ON sh.delegate_id = d.id
      JOIN sessions s ON sh.session_id = s.id
      LEFT JOIN queue q ON q.delegate_id = sh.delegate_id 
        AND q.session_id = sh.session_id
        AND q.status = 'completed'
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (options.sessionId) {
      conditions.push(`sh.session_id = $${params.length + 1}`);
      params.push(options.sessionId);
    }

    if (options.startDate) {
      conditions.push(`sh.start_time >= $${params.length + 1}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`sh.start_time <= $${params.length + 1}`);
      params.push(options.endDate);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY sh.start_time DESC`;

    return { text: query, params };
  }

  /**
   * Convert rows to CSV format
   */
  private convertToCSV(rows: any[], fields: string[]): string {
    if (rows.length === 0) {
      return fields.join(',') + '\n';
    }

    // Add UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';

    // Sanitize data to prevent CSV injection
    const sanitizedRows = rows.map((row) => {
      const sanitized: any = {};
      for (const key in row) {
        let value = row[key];
        if (typeof value === 'string') {
          // Prevent CSV injection
          if (
            value.startsWith('=') ||
            value.startsWith('+') ||
            value.startsWith('-') ||
            value.startsWith('@')
          ) {
            value = `'${value}`;
          }
        }
        sanitized[key] = value;
      }
      return sanitized;
    });

    const parser = new Parser({ fields });
    const csv = parser.parse(sanitizedRows);

    return BOM + csv;
  }

  /**
   * Stream CSV data for large datasets
   */
  private streamCSV(query: string, params: any[], fields: string[]): Readable {
    const stream = new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        // Sanitize data
        const sanitized: any = {};
        for (const key in chunk) {
          let value = chunk[key];
          if (typeof value === 'string') {
            if (
              value.startsWith('=') ||
              value.startsWith('+') ||
              value.startsWith('-') ||
              value.startsWith('@')
            ) {
              value = `'${value}`;
            }
          }
          sanitized[key] = value;
        }

        const parser = new Parser({ fields, header: false });
        const csv = parser.parse([sanitized]);
        callback(null, csv + '\n');
      },
    });

    // Write UTF-8 BOM and headers
    const BOM = '\uFEFF';
    stream.push(BOM + fields.join(',') + '\n');

    // Execute query with cursor for streaming
    this.streamQuery(query, params, stream);

    return stream;
  }

  /**
   * Stream query results
   */
  private async streamQuery(query: string, params: any[], stream: Transform) {
    const client = await this.db.connect();

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const cursor = client.query(new (require('pg-cursor'))(query, params));

      const readBatch = () => {
        cursor.read(this.batchSize, (err: any, rows: any[]) => {
          if (err) {
            stream.destroy(err);
            return;
          }

          if (rows.length === 0) {
            stream.end();
            return;
          }

          rows.forEach((row) => stream.write(row));
          readBatch();
        });
      };

      readBatch();
    } catch (error) {
      stream.destroy(error as Error);
    } finally {
      client.release();
    }
  }

  /**
   * Get field names for delegate export
   */
  private getDelegateFields(options: ExportOptions): string[] {
    const fields = ['delegate_id', 'delegate_name', 'delegate_number'];

    if (options.includeDemographics) {
      fields.push('gender', 'age_range', 'race');
    }

    fields.push(
      'speaking_instances',
      'total_duration_seconds',
      'average_duration_seconds',
      'first_spoke_at',
      'last_spoke_at',
      'participation_rate',
      'longest_speech_seconds',
      'shortest_speech_seconds'
    );

    return fields;
  }

  /**
   * Get field names for session export
   */
  private getSessionFields(): string[] {
    return [
      'session_id',
      'session_date',
      'start_time',
      'end_time',
      'duration_minutes',
      'unique_speakers',
      'total_speaking_instances',
      'average_speaking_time_seconds',
      'participation_rate',
      'gender_balance_score',
      'age_balance_score',
      'race_balance_score',
    ];
  }

  /**
   * Get field names for speaking history export
   */
  private getSpeakingHistoryFields(options: ExportOptions): string[] {
    const fields = [
      'delegate_id',
      'delegate_name',
      'session_id',
      'session_date',
      'start_time',
      'end_time',
      'duration_seconds',
      'queue_position',
      'wait_time_seconds',
    ];

    if (options.includeDemographics) {
      fields.push('gender', 'age_range', 'race');
    }

    return fields;
  }

  /**
   * Generate filename with timestamp
   */
  generateFilename(type: string, extension: string = 'csv'): string {
    const timestamp = format(new Date(), 'yyyyMMdd_HHmmss');
    return `${type}_export_${timestamp}.${extension}`;
  }
}

export default ExportService;
