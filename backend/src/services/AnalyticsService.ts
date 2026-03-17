import { Pool } from 'pg';
import { Redis } from 'ioredis';

export interface ParticipationRate {
  demographic: string;
  value: string;
  totalDelegates: number;
  participants: number;
  rate: number;
  averageSpeakingTime: number;
}

export interface TimeDistribution {
  bucket: string;
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
}

export interface SpeakerStatistics {
  delegateId: string;
  name: string;
  speakingInstances: number;
  totalTime: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  lastSpoke: Date | null;
}

export interface SessionMetrics {
  sessionId: string;
  duration: number;
  uniqueSpeakers: number;
  totalSpeakingInstances: number;
  averageSpeakingTime: number;
  medianSpeakingTime: number;
  queueLength: number;
  participationRate: number;
  demographicBalance: {
    gender: number;
    age: number;
    race: number;
  };
}

export interface AggregatedMetrics {
  timeRange: {
    start: Date;
    end: Date;
  };
  sessions: number;
  totalSpeakers: number;
  totalSpeakingTime: number;
  averageSessionDuration: number;
  peakHour: number;
  participationByDemographic: ParticipationRate[];
  timeDistribution: TimeDistribution[];
}

export class AnalyticsService {
  private db: Pool;
  private redis: Redis | null;
  private cacheEnabled: boolean;
  private cacheTTL: number = 300; // 5 minutes default

  constructor(db: Pool, redis?: Redis) {
    this.db = db;
    this.redis = redis || null;
    this.cacheEnabled = !!redis;
  }

  /**
   * Calculate participation rate by demographic
   */
  async calculateParticipationRate(
    demographic: 'gender' | 'age_group' | 'race',
    value?: string,
    sessionId?: string
  ): Promise<ParticipationRate[]> {
    const cacheKey = `participation:${demographic}:${value || 'all'}:${sessionId || 'all'}`;

    // Check cache
    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const query = `
      WITH speaker_stats AS (
        SELECT 
          d.id,
          d.${demographic},
          COUNT(DISTINCT sh.id) as speaking_instances,
          COALESCE(SUM(sh.duration), 0) as total_time
        FROM delegates d
        LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'WHERE sh.session_id = $1' : ''}
        GROUP BY d.id, d.${demographic}
      ),
      demographic_summary AS (
        SELECT 
          ${demographic} as value,
          COUNT(DISTINCT id) as total_delegates,
          COUNT(DISTINCT CASE WHEN speaking_instances > 0 THEN id END) as participants,
          AVG(CASE WHEN speaking_instances > 0 THEN total_time END) as avg_time
        FROM speaker_stats
        ${value ? `WHERE ${demographic} = ${sessionId ? '$2' : '$1'}` : ''}
        GROUP BY ${demographic}
      )
      SELECT 
        '${demographic}' as demographic,
        value,
        total_delegates,
        participants,
        ROUND((participants::numeric / NULLIF(total_delegates, 0)) * 100, 2) as rate,
        COALESCE(ROUND(avg_time, 2), 0) as average_speaking_time
      FROM demographic_summary
      ORDER BY rate DESC
    `;

    const params: any[] = [];
    if (sessionId) params.push(sessionId);
    if (value) params.push(value);

    const result = await this.db.query(query, params);
    const data = result.rows as ParticipationRate[];

    // Cache result
    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Get average speaking time
   */
  async getAverageSpeakingTime(delegateId?: string, sessionId?: string): Promise<number> {
    const cacheKey = `avg_time:${delegateId || 'all'}:${sessionId || 'all'}`;

    // Check cache
    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return parseFloat(cached);
      }
    }

    let query = `
      SELECT AVG(duration) as avg_time
      FROM speaker_history
      WHERE 1=1
    `;

    const params: any[] = [];
    if (delegateId) {
      query += ` AND delegate_id = $${params.length + 1}`;
      params.push(delegateId);
    }
    if (sessionId) {
      query += ` AND session_id = $${params.length + 1}`;
      params.push(sessionId);
    }

    const result = await this.db.query(query, params);
    const avgTime = result.rows[0]?.avg_time || 0;

    // Cache result
    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, avgTime.toString());
    }

    return avgTime;
  }

  /**
   * Generate time distribution histogram
   */
  async generateTimeDistribution(
    bucketSize: number = 30, // seconds
    sessionId?: string
  ): Promise<TimeDistribution[]> {
    const cacheKey = `time_dist:${bucketSize}:${sessionId || 'all'}`;

    // Check cache
    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const query = `
      WITH time_buckets AS (
        SELECT 
          FLOOR(duration / $1) * $1 as bucket_start,
          COUNT(*) as count
        FROM speaker_history
        ${sessionId ? 'WHERE session_id = $2' : ''}
        GROUP BY FLOOR(duration / $1)
      ),
      total_count AS (
        SELECT COUNT(*) as total
        FROM speaker_history
        ${sessionId ? 'WHERE session_id = $2' : ''}
      )
      SELECT 
        CONCAT(bucket_start, '-', bucket_start + $1 - 1, 's') as bucket,
        bucket_start as range_start,
        bucket_start + $1 - 1 as range_end,
        count,
        ROUND((count::numeric / NULLIF(total, 0)) * 100, 2) as percentage
      FROM time_buckets, total_count
      ORDER BY bucket_start
    `;

    const params: any[] = [bucketSize];
    if (sessionId) params.push(sessionId);

    const result = await this.db.query(query, params);
    const data = result.rows as TimeDistribution[];

    // Cache result
    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Get detailed speaker statistics
   */
  async getSpeakerStatistics(
    delegateId: string,
    sessionId?: string
  ): Promise<SpeakerStatistics | null> {
    const query = `
      SELECT 
        d.id as delegate_id,
        d.name,
        COUNT(sh.id) as speaking_instances,
        COALESCE(SUM(sh.duration), 0) as total_time,
        COALESCE(AVG(sh.duration), 0) as average_time,
        COALESCE(MIN(sh.duration), 0) as min_time,
        COALESCE(MAX(sh.duration), 0) as max_time,
        MAX(sh.end_time) as last_spoke
      FROM delegates d
      LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
      WHERE d.id = $1
      ${sessionId ? 'AND sh.session_id = $2' : ''}
      GROUP BY d.id, d.name
    `;

    const params: any[] = [delegateId];
    if (sessionId) params.push(sessionId);

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as SpeakerStatistics;
  }

  /**
   * Get real-time session metrics
   */
  async getSessionMetrics(sessionId: string): Promise<SessionMetrics> {
    // Get basic session stats
    const sessionQuery = `
      SELECT 
        s.id as session_id,
        EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.start_time)) as duration,
        COUNT(DISTINCT sh.delegate_id) as unique_speakers,
        COUNT(sh.id) as total_speaking_instances,
        AVG(sh.duration) as average_speaking_time,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sh.duration) as median_speaking_time
      FROM sessions s
      LEFT JOIN speaker_history sh ON s.id = sh.session_id
      WHERE s.id = $1
      GROUP BY s.id, s.start_time, s.end_time
    `;

    const sessionResult = await this.db.query(sessionQuery, [sessionId]);

    if (sessionResult.rows.length === 0) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get current queue length
    const queueQuery = `
      SELECT COUNT(*) as queue_length
      FROM queue
      WHERE session_id = $1 AND status = 'waiting'
    `;
    const queueResult = await this.db.query(queueQuery, [sessionId]);

    // Get demographic balance
    const demographicQuery = `
      WITH demographic_counts AS (
        SELECT 
          d.gender,
          d.age_group,
          d.race,
          COUNT(DISTINCT sh.id) as speaking_count
        FROM delegates d
        JOIN speaker_history sh ON d.id = sh.delegate_id
        WHERE sh.session_id = $1
        GROUP BY d.gender, d.age_group, d.race
      ),
      gender_balance AS (
        SELECT 
          CASE 
            WHEN COUNT(*) = 0 THEN 50
            ELSE (SUM(CASE WHEN gender = 'Female' THEN speaking_count ELSE 0 END)::numeric / 
                  NULLIF(SUM(speaking_count), 0)) * 100
          END as gender_balance
        FROM demographic_counts
      ),
      age_balance AS (
        SELECT 
          STDDEV(speaking_count) as age_variance
        FROM (
          SELECT age_group, SUM(speaking_count) as speaking_count
          FROM demographic_counts
          GROUP BY age_group
        ) t
      ),
      race_balance AS (
        SELECT 
          STDDEV(speaking_count) as race_variance
        FROM (
          SELECT race, SUM(speaking_count) as speaking_count
          FROM demographic_counts
          GROUP BY race
        ) t
      )
      SELECT 
        COALESCE(gb.gender_balance, 50) as gender_balance,
        CASE 
          WHEN ab.age_variance IS NULL OR ab.age_variance = 0 THEN 100
          ELSE GREATEST(0, 100 - (ab.age_variance * 10))
        END as age_balance,
        CASE 
          WHEN rb.race_variance IS NULL OR rb.race_variance = 0 THEN 100
          ELSE GREATEST(0, 100 - (rb.race_variance * 10))
        END as race_balance
      FROM gender_balance gb, age_balance ab, race_balance rb
    `;
    const demographicResult = await this.db.query(demographicQuery, [sessionId]);

    // Get participation rate
    const participationQuery = `
      SELECT 
        (COUNT(DISTINCT sh.delegate_id)::numeric / 
         NULLIF(COUNT(DISTINCT d.id), 0)) * 100 as participation_rate
      FROM delegates d
      LEFT JOIN speaker_history sh ON d.id = sh.delegate_id AND sh.session_id = $1
    `;
    const participationResult = await this.db.query(participationQuery, [sessionId]);

    const sessionData = sessionResult.rows[0];
    const queueLength = queueResult.rows[0]?.queue_length || 0;
    const demographics = demographicResult.rows[0] || {
      gender_balance: 50,
      age_balance: 50,
      race_balance: 50,
    };
    const participationRate = participationResult.rows[0]?.participation_rate || 0;

    return {
      sessionId,
      duration: sessionData.duration || 0,
      uniqueSpeakers: parseInt(sessionData.unique_speakers) || 0,
      totalSpeakingInstances: parseInt(sessionData.total_speaking_instances) || 0,
      averageSpeakingTime: parseFloat(sessionData.average_speaking_time) || 0,
      medianSpeakingTime: parseFloat(sessionData.median_speaking_time) || 0,
      queueLength: parseInt(queueLength),
      participationRate: parseFloat(participationRate),
      demographicBalance: {
        gender: parseFloat(demographics.gender_balance),
        age: parseFloat(demographics.age_balance),
        race: parseFloat(demographics.race_balance),
      },
    };
  }

  /**
   * Get aggregated metrics for a time range
   */
  async getAggregatedMetrics(startDate: Date, endDate: Date): Promise<AggregatedMetrics> {
    // Get session count and duration stats
    const sessionStatsQuery = `
      SELECT 
        COUNT(*) as sessions,
        AVG(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time))) as avg_duration
      FROM sessions
      WHERE start_time >= $1 AND start_time <= $2
    `;
    const sessionStats = await this.db.query(sessionStatsQuery, [startDate, endDate]);

    // Get speaker stats
    const speakerStatsQuery = `
      SELECT 
        COUNT(DISTINCT sh.delegate_id) as total_speakers,
        SUM(sh.duration) as total_speaking_time,
        EXTRACT(HOUR FROM sh.start_time) as hour,
        COUNT(*) as count
      FROM speaker_history sh
      JOIN sessions s ON sh.session_id = s.id
      WHERE s.start_time >= $1 AND s.start_time <= $2
      GROUP BY EXTRACT(HOUR FROM sh.start_time)
      ORDER BY count DESC
      LIMIT 1
    `;
    const speakerStats = await this.db.query(speakerStatsQuery, [startDate, endDate]);

    // Get participation by demographic
    const participationRates = await Promise.all([
      this.calculateParticipationRate('gender'),
      this.calculateParticipationRate('age_group'),
      this.calculateParticipationRate('race'),
    ]);

    // Get time distribution
    const timeDistribution = await this.generateTimeDistribution(30);

    const sessionData = sessionStats.rows[0] || { sessions: 0, avg_duration: 0 };
    const speakerData = speakerStats.rows[0] || {
      total_speakers: 0,
      total_speaking_time: 0,
      hour: 0,
    };

    return {
      timeRange: { start: startDate, end: endDate },
      sessions: parseInt(sessionData.sessions) || 0,
      totalSpeakers: parseInt(speakerData.total_speakers) || 0,
      totalSpeakingTime: parseFloat(speakerData.total_speaking_time) || 0,
      averageSessionDuration: parseFloat(sessionData.avg_duration) || 0,
      peakHour: parseInt(speakerData.hour) || 0,
      participationByDemographic: participationRates.flat(),
      timeDistribution,
    };
  }

  /**
   * Clear cache for specific keys or all analytics cache
   */
  async clearCache(pattern?: string): Promise<void> {
    if (!this.cacheEnabled || !this.redis) {
      return;
    }

    if (pattern) {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } else {
      // Clear all analytics cache
      const keys = await this.redis.keys('participation:*');
      keys.push(...(await this.redis.keys('avg_time:*')));
      keys.push(...(await this.redis.keys('time_dist:*')));

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(seconds: number): void {
    this.cacheTTL = seconds;
  }
}

export default AnalyticsService;
