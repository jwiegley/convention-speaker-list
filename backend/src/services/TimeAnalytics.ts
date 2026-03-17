import { Pool } from 'pg';
import { Redis } from 'ioredis';

export interface TimeHistogram {
  bucket: string;
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
  cumulativePercentage: number;
  delegates: string[];
}

export interface TimeStatistics {
  mean: number;
  median: number;
  mode: number;
  standardDeviation: number;
  variance: number;
  min: number;
  max: number;
  range: number;
  quartiles: {
    q1: number;
    q2: number;
    q3: number;
  };
  iqr: number;
  outliers: {
    delegateId: string;
    name: string;
    duration: number;
    zScore: number;
  }[];
}

export interface PeakHourAnalysis {
  hour: number;
  timeLabel: string;
  speakingInstances: number;
  uniqueSpeakers: number;
  averageDuration: number;
  totalDuration: number;
  percentageOfDaily: number;
  trend: 'peak' | 'high' | 'normal' | 'low';
}

export interface QueueWaitTime {
  delegateId: string;
  joinedAt: Date;
  calledAt: Date | null;
  waitTime: number;
  position: number;
  abandonedQueue: boolean;
}

export interface TimeTrend {
  period: string;
  startDate: Date;
  endDate: Date;
  averageSpeakingTime: number;
  totalSpeakingTime: number;
  speakingInstances: number;
  changeFromPrevious: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SessionTiming {
  sessionId: string;
  sessionDate: Date;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  activeSpeakingTime: number;
  idleTime: number;
  utilizationRate: number;
  averageGapBetweenSpeakers: number;
  longestGap: number;
  busiestHour: number;
}

export class TimeAnalytics {
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
   * Create detailed time distribution histogram with buckets
   */
  async createTimeHistogram(
    bucketSizeSeconds: number = 30,
    sessionId?: string,
    includeDelegateList: boolean = false
  ): Promise<TimeHistogram[]> {
    const cacheKey = `time_histogram:${bucketSizeSeconds}:${sessionId || 'all'}:${includeDelegateList}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const query = `
      WITH time_buckets AS (
        SELECT 
          FLOOR(sh.duration / $1) * $1 as bucket_start,
          FLOOR(sh.duration / $1) * $1 + $1 - 1 as bucket_end,
          COUNT(*) as count,
          ${includeDelegateList ? 'ARRAY_AGG(DISTINCT d.name ORDER BY d.name) as delegates' : 'ARRAY[]::text[] as delegates'}
        FROM speaker_history sh
        ${includeDelegateList ? 'JOIN delegates d ON sh.delegate_id = d.id' : ''}
        ${sessionId ? 'WHERE sh.session_id = $2' : ''}
        GROUP BY FLOOR(sh.duration / $1)
      ),
      total_stats AS (
        SELECT 
          COUNT(*) as total_count,
          SUM(COUNT(*)) OVER (ORDER BY bucket_start) as running_total
        FROM time_buckets
      ),
      histogram AS (
        SELECT 
          CASE 
            WHEN bucket_start < 60 THEN CONCAT(bucket_start, '-', bucket_end, 's')
            WHEN bucket_start < 120 THEN CONCAT('1-', FLOOR(bucket_end/60), 'm ', bucket_end%60, 's')
            ELSE CONCAT(FLOOR(bucket_start/60), '-', FLOOR(bucket_end/60), 'm')
          END as bucket,
          bucket_start as range_start,
          bucket_end as range_end,
          tb.count,
          ROUND((tb.count::numeric / NULLIF(MAX(ts.total_count) OVER (), 0)) * 100, 2) as percentage,
          ROUND((SUM(tb.count) OVER (ORDER BY bucket_start)::numeric / 
                 NULLIF(MAX(ts.total_count) OVER (), 0)) * 100, 2) as cumulative_percentage,
          tb.delegates
        FROM time_buckets tb
        CROSS JOIN (SELECT MAX(total_count) as total_count FROM total_stats) ts
      )
      SELECT * FROM histogram
      ORDER BY range_start
    `;

    const params: any[] = [bucketSizeSeconds];
    if (sessionId) params.push(sessionId);

    const result = await this.db.query(query, params);
    const data = result.rows as TimeHistogram[];

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Calculate comprehensive time statistics including outliers
   */
  async calculateTimeStatistics(sessionId?: string): Promise<TimeStatistics> {
    const cacheKey = `time_statistics:${sessionId || 'all'}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const query = `
      WITH time_data AS (
        SELECT 
          sh.duration,
          sh.delegate_id,
          d.name
        FROM speaker_history sh
        JOIN delegates d ON sh.delegate_id = d.id
        ${sessionId ? 'WHERE sh.session_id = $1' : ''}
      ),
      basic_stats AS (
        SELECT 
          AVG(duration) as mean,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) as median,
          MODE() WITHIN GROUP (ORDER BY duration) as mode,
          STDDEV(duration) as std_dev,
          VARIANCE(duration) as variance,
          MIN(duration) as min_val,
          MAX(duration) as max_val,
          MAX(duration) - MIN(duration) as range_val,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY duration) as q1,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration) as q2,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY duration) as q3
        FROM time_data
      ),
      outlier_detection AS (
        SELECT 
          td.delegate_id,
          td.name,
          td.duration,
          (td.duration - bs.mean) / NULLIF(bs.std_dev, 0) as z_score
        FROM time_data td
        CROSS JOIN basic_stats bs
        WHERE ABS((td.duration - bs.mean) / NULLIF(bs.std_dev, 0)) > 2
      )
      SELECT 
        ROUND(bs.mean::numeric, 2) as mean,
        ROUND(bs.median::numeric, 2) as median,
        COALESCE(bs.mode, 0) as mode,
        ROUND(bs.std_dev::numeric, 2) as standard_deviation,
        ROUND(bs.variance::numeric, 2) as variance,
        bs.min_val as min,
        bs.max_val as max,
        bs.range_val as range,
        json_build_object(
          'q1', ROUND(bs.q1::numeric, 2),
          'q2', ROUND(bs.q2::numeric, 2),
          'q3', ROUND(bs.q3::numeric, 2)
        ) as quartiles,
        ROUND((bs.q3 - bs.q1)::numeric, 2) as iqr,
        COALESCE(
          json_agg(
            json_build_object(
              'delegateId', od.delegate_id,
              'name', od.name,
              'duration', od.duration,
              'zScore', ROUND(od.z_score::numeric, 2)
            ) ORDER BY ABS(od.z_score) DESC
          ) FILTER (WHERE od.delegate_id IS NOT NULL),
          '[]'::json
        ) as outliers
      FROM basic_stats bs
      LEFT JOIN outlier_detection od ON true
      GROUP BY bs.mean, bs.median, bs.mode, bs.std_dev, bs.variance, 
               bs.min_val, bs.max_val, bs.range_val, bs.q1, bs.q2, bs.q3
    `;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);
    const stats = result.rows[0] as TimeStatistics;

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(stats));
    }

    return stats;
  }

  /**
   * Analyze peak speaking hours
   */
  async analyzePeakHours(date?: Date, sessionId?: string): Promise<PeakHourAnalysis[]> {
    const cacheKey = `peak_hours:${date?.toISOString() || 'all'}:${sessionId || 'all'}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const query = `
      WITH hourly_stats AS (
        SELECT 
          EXTRACT(HOUR FROM sh.start_time) as hour,
          COUNT(*) as speaking_instances,
          COUNT(DISTINCT sh.delegate_id) as unique_speakers,
          AVG(sh.duration) as avg_duration,
          SUM(sh.duration) as total_duration
        FROM speaker_history sh
        ${sessionId ? 'JOIN sessions s ON sh.session_id = s.id' : ''}
        WHERE 1=1
        ${date ? 'AND DATE(sh.start_time) = $1' : ''}
        ${sessionId ? `AND sh.session_id = ${date ? '$2' : '$1'}` : ''}
        GROUP BY EXTRACT(HOUR FROM sh.start_time)
      ),
      daily_total AS (
        SELECT SUM(total_duration) as daily_total
        FROM hourly_stats
      ),
      hour_analysis AS (
        SELECT 
          hs.hour,
          hs.speaking_instances,
          hs.unique_speakers,
          hs.avg_duration,
          hs.total_duration,
          ROUND((hs.total_duration::numeric / NULLIF(dt.daily_total, 0)) * 100, 2) as percentage_of_daily,
          NTILE(4) OVER (ORDER BY hs.total_duration DESC) as quartile
        FROM hourly_stats hs
        CROSS JOIN daily_total dt
      )
      SELECT 
        hour::integer,
        CASE 
          WHEN hour < 12 THEN CONCAT(hour, ':00 AM')
          WHEN hour = 12 THEN '12:00 PM'
          ELSE CONCAT(hour - 12, ':00 PM')
        END as time_label,
        speaking_instances,
        unique_speakers,
        ROUND(avg_duration::numeric, 2) as average_duration,
        ROUND(total_duration::numeric, 2) as total_duration,
        percentage_of_daily,
        CASE 
          WHEN quartile = 1 THEN 'peak'
          WHEN quartile = 2 THEN 'high'
          WHEN quartile = 3 THEN 'normal'
          ELSE 'low'
        END as trend
      FROM hour_analysis
      ORDER BY hour
    `;

    const params: any[] = [];
    if (date) params.push(date);
    if (sessionId) params.push(sessionId);

    const result = await this.db.query(query, params);
    const data = result.rows as PeakHourAnalysis[];

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Analyze queue wait times
   */
  async analyzeQueueWaitTimes(sessionId: string): Promise<{
    averageWaitTime: number;
    medianWaitTime: number;
    maxWaitTime: number;
    abandonmentRate: number;
    waitTimeByPosition: { position: number; avgWaitTime: number }[];
    details: QueueWaitTime[];
  }> {
    const query = `
      WITH queue_analysis AS (
        SELECT 
          q.delegate_id,
          q.joined_at,
          q.position,
          sh.start_time as called_at,
          CASE 
            WHEN sh.start_time IS NOT NULL THEN 
              EXTRACT(EPOCH FROM (sh.start_time - q.joined_at))
            ELSE 
              EXTRACT(EPOCH FROM (NOW() - q.joined_at))
          END as wait_time,
          q.status = 'abandoned' as abandoned
        FROM queue q
        LEFT JOIN speaker_history sh ON q.delegate_id = sh.delegate_id 
          AND q.session_id = sh.session_id
          AND sh.start_time >= q.joined_at
        WHERE q.session_id = $1
      ),
      wait_stats AS (
        SELECT 
          AVG(wait_time) FILTER (WHERE NOT abandoned) as avg_wait,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY wait_time) 
            FILTER (WHERE NOT abandoned) as median_wait,
          MAX(wait_time) FILTER (WHERE NOT abandoned) as max_wait,
          COUNT(*) FILTER (WHERE abandoned)::numeric / NULLIF(COUNT(*), 0) * 100 as abandonment_rate
        FROM queue_analysis
      ),
      position_analysis AS (
        SELECT 
          position,
          AVG(wait_time) FILTER (WHERE NOT abandoned) as avg_wait_time
        FROM queue_analysis
        GROUP BY position
        ORDER BY position
      )
      SELECT 
        json_build_object(
          'averageWaitTime', ROUND(COALESCE(ws.avg_wait, 0), 2),
          'medianWaitTime', ROUND(COALESCE(ws.median_wait, 0), 2),
          'maxWaitTime', ROUND(COALESCE(ws.max_wait, 0), 2),
          'abandonmentRate', ROUND(COALESCE(ws.abandonment_rate, 0), 2),
          'waitTimeByPosition', COALESCE(
            json_agg(
              json_build_object(
                'position', pa.position,
                'avgWaitTime', ROUND(pa.avg_wait_time, 2)
              ) ORDER BY pa.position
            ) FILTER (WHERE pa.position IS NOT NULL),
            '[]'::json
          ),
          'details', COALESCE(
            json_agg(
              json_build_object(
                'delegateId', qa.delegate_id,
                'joinedAt', qa.joined_at,
                'calledAt', qa.called_at,
                'waitTime', ROUND(qa.wait_time, 2),
                'position', qa.position,
                'abandonedQueue', qa.abandoned
              ) ORDER BY qa.wait_time DESC
            ) FILTER (WHERE qa.delegate_id IS NOT NULL),
            '[]'::json
          )
        ) as result
      FROM wait_stats ws
      CROSS JOIN position_analysis pa
      CROSS JOIN queue_analysis qa
    `;

    const result = await this.db.query(query, [sessionId]);
    return (
      result.rows[0]?.result || {
        averageWaitTime: 0,
        medianWaitTime: 0,
        maxWaitTime: 0,
        abandonmentRate: 0,
        waitTimeByPosition: [],
        details: [],
      }
    );
  }

  /**
   * Calculate speaking time trends over periods
   */
  async calculateTimeTrends(
    periodType: 'day' | 'week' | 'month',
    periods: number = 7
  ): Promise<TimeTrend[]> {
    const cacheKey = `time_trends:${periodType}:${periods}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const dateFormat =
      periodType === 'day' ? 'YYYY-MM-DD' : periodType === 'week' ? 'YYYY-WW' : 'YYYY-MM';

    const query = `
      WITH period_stats AS (
        SELECT 
          TO_CHAR(sh.start_time, '${dateFormat}') as period,
          MIN(DATE(sh.start_time)) as start_date,
          MAX(DATE(sh.start_time)) as end_date,
          AVG(sh.duration) as avg_time,
          SUM(sh.duration) as total_time,
          COUNT(*) as instances
        FROM speaker_history sh
        WHERE sh.start_time >= CURRENT_DATE - INTERVAL '${periods} ${periodType}s'
        GROUP BY TO_CHAR(sh.start_time, '${dateFormat}')
      ),
      trend_analysis AS (
        SELECT 
          period,
          start_date,
          end_date,
          avg_time,
          total_time,
          instances,
          avg_time - LAG(avg_time) OVER (ORDER BY period) as change,
          CASE 
            WHEN avg_time - LAG(avg_time) OVER (ORDER BY period) > 5 THEN 'increasing'
            WHEN avg_time - LAG(avg_time) OVER (ORDER BY period) < -5 THEN 'decreasing'
            ELSE 'stable'
          END as trend
        FROM period_stats
      )
      SELECT 
        period,
        start_date,
        end_date,
        ROUND(avg_time::numeric, 2) as average_speaking_time,
        ROUND(total_time::numeric, 2) as total_speaking_time,
        instances as speaking_instances,
        ROUND(COALESCE(change, 0)::numeric, 2) as change_from_previous,
        trend
      FROM trend_analysis
      ORDER BY period DESC
    `;

    const result = await this.db.query(query);
    const data = result.rows as TimeTrend[];

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Analyze session timing and utilization
   */
  async analyzeSessionTiming(sessionId: string): Promise<SessionTiming> {
    const query = `
      WITH session_data AS (
        SELECT 
          s.id,
          DATE(s.start_time) as session_date,
          s.start_time,
          s.end_time,
          EXTRACT(EPOCH FROM (COALESCE(s.end_time, NOW()) - s.start_time)) as duration
        FROM sessions s
        WHERE s.id = $1
      ),
      speaking_times AS (
        SELECT 
          sh.start_time,
          sh.end_time,
          sh.duration,
          LAG(sh.end_time) OVER (ORDER BY sh.start_time) as prev_end_time
        FROM speaker_history sh
        WHERE sh.session_id = $1
        ORDER BY sh.start_time
      ),
      gap_analysis AS (
        SELECT 
          EXTRACT(EPOCH FROM (start_time - prev_end_time)) as gap_duration
        FROM speaking_times
        WHERE prev_end_time IS NOT NULL
      ),
      utilization AS (
        SELECT 
          SUM(duration) as active_time,
          EXTRACT(HOUR FROM MIN(start_time)) as first_hour,
          EXTRACT(HOUR FROM MAX(end_time)) as last_hour
        FROM speaking_times
      ),
      busiest_hour AS (
        SELECT 
          EXTRACT(HOUR FROM start_time) as hour,
          SUM(duration) as hour_duration
        FROM speaking_times
        GROUP BY EXTRACT(HOUR FROM start_time)
        ORDER BY hour_duration DESC
        LIMIT 1
      )
      SELECT 
        sd.id as session_id,
        sd.session_date,
        sd.start_time,
        sd.end_time,
        ROUND(sd.duration, 2) as duration,
        ROUND(COALESCE(u.active_time, 0), 2) as active_speaking_time,
        ROUND(sd.duration - COALESCE(u.active_time, 0), 2) as idle_time,
        ROUND((COALESCE(u.active_time, 0) / NULLIF(sd.duration, 0)) * 100, 2) as utilization_rate,
        ROUND(COALESCE(AVG(ga.gap_duration), 0), 2) as average_gap_between_speakers,
        ROUND(COALESCE(MAX(ga.gap_duration), 0), 2) as longest_gap,
        COALESCE(bh.hour, 0)::integer as busiest_hour
      FROM session_data sd
      LEFT JOIN utilization u ON true
      LEFT JOIN gap_analysis ga ON true
      LEFT JOIN busiest_hour bh ON true
      GROUP BY sd.id, sd.session_date, sd.start_time, sd.end_time, 
               sd.duration, u.active_time, bh.hour
    `;

    const result = await this.db.query(query, [sessionId]);
    return result.rows[0] as SessionTiming;
  }

  /**
   * Get cumulative time tracking for demographics
   */
  async getCumulativeTimeByDemographic(
    demographic: 'gender' | 'age_group' | 'race',
    sessionId?: string
  ): Promise<
    {
      value: string;
      totalTime: number;
      averageTime: number;
      percentage: number;
      cumulativePercentage: number;
    }[]
  > {
    const query = `
      WITH demographic_times AS (
        SELECT 
          d.${demographic} as value,
          SUM(sh.duration) as total_time,
          AVG(sh.duration) as avg_time
        FROM delegates d
        JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'WHERE sh.session_id = $1' : ''}
        GROUP BY d.${demographic}
      ),
      total_time AS (
        SELECT SUM(total_time) as grand_total
        FROM demographic_times
      ),
      cumulative AS (
        SELECT 
          value,
          total_time,
          avg_time,
          (total_time::numeric / NULLIF(tt.grand_total, 0)) * 100 as percentage,
          SUM(total_time) OVER (ORDER BY total_time DESC) as running_total
        FROM demographic_times
        CROSS JOIN total_time tt
      )
      SELECT 
        value,
        ROUND(total_time::numeric, 2) as total_time,
        ROUND(avg_time::numeric, 2) as average_time,
        ROUND(percentage::numeric, 2) as percentage,
        ROUND((running_total::numeric / NULLIF(
          (SELECT grand_total FROM total_time), 0)
        ) * 100, 2) as cumulative_percentage
      FROM cumulative
      ORDER BY total_time DESC
    `;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Detect unusual speaking patterns
   */
  async detectUnusualPatterns(
    sessionId?: string,
    threshold: number = 2 // z-score threshold
  ): Promise<
    {
      type: string;
      description: string;
      severity: 'high' | 'medium' | 'low';
      affectedDelegates: string[];
      metrics: any;
    }[]
  > {
    const patterns: any[] = [];

    // Detect monopolization (speakers taking too much time)
    const monopolizationQuery = `
      WITH speaker_totals AS (
        SELECT 
          d.id,
          d.name,
          SUM(sh.duration) as total_time,
          COUNT(*) as speaking_count
        FROM delegates d
        JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'WHERE sh.session_id = $1' : ''}
        GROUP BY d.id, d.name
      ),
      stats AS (
        SELECT 
          AVG(total_time) as mean_time,
          STDDEV(total_time) as std_time
        FROM speaker_totals
      )
      SELECT 
        st.name,
        st.total_time,
        st.speaking_count,
        (st.total_time - s.mean_time) / NULLIF(s.std_time, 0) as z_score
      FROM speaker_totals st
      CROSS JOIN stats s
      WHERE (st.total_time - s.mean_time) / NULLIF(s.std_time, 0) > ${threshold}
    `;

    const monopolizationResult = await this.db.query(
      monopolizationQuery,
      sessionId ? [sessionId] : []
    );

    if (monopolizationResult.rows.length > 0) {
      patterns.push({
        type: 'monopolization',
        description: 'Delegates taking significantly more speaking time than average',
        severity: monopolizationResult.rows[0].z_score > 3 ? 'high' : 'medium',
        affectedDelegates: monopolizationResult.rows.map((r) => r.name),
        metrics: {
          delegates: monopolizationResult.rows.map((r) => ({
            name: r.name,
            totalTime: r.total_time,
            speakingCount: r.speaking_count,
            zScore: r.z_score,
          })),
        },
      });
    }

    // Detect clustering (same delegates speaking repeatedly)
    const clusteringQuery = `
      WITH sequential_speakers AS (
        SELECT 
          sh.delegate_id,
          d.name,
          sh.start_time,
          LAG(sh.delegate_id) OVER (ORDER BY sh.start_time) as prev_delegate,
          LEAD(sh.delegate_id) OVER (ORDER BY sh.start_time) as next_delegate
        FROM speaker_history sh
        JOIN delegates d ON sh.delegate_id = d.id
        ${sessionId ? 'WHERE sh.session_id = $1' : ''}
        ORDER BY sh.start_time
      ),
      repeat_patterns AS (
        SELECT 
          delegate_id,
          name,
          COUNT(*) FILTER (WHERE delegate_id = prev_delegate) as immediate_repeats,
          COUNT(*) FILTER (WHERE delegate_id = next_delegate) as following_repeats
        FROM sequential_speakers
        GROUP BY delegate_id, name
        HAVING COUNT(*) FILTER (WHERE delegate_id = prev_delegate) > 2
            OR COUNT(*) FILTER (WHERE delegate_id = next_delegate) > 2
      )
      SELECT * FROM repeat_patterns
    `;

    const clusteringResult = await this.db.query(clusteringQuery, sessionId ? [sessionId] : []);

    if (clusteringResult.rows.length > 0) {
      patterns.push({
        type: 'clustering',
        description: 'Delegates speaking multiple times in succession',
        severity: 'medium',
        affectedDelegates: clusteringResult.rows.map((r) => r.name),
        metrics: {
          repeatingDelegates: clusteringResult.rows,
        },
      });
    }

    // Detect dead zones (long periods without activity)
    const deadZoneQuery = `
      WITH time_gaps AS (
        SELECT 
          sh.start_time,
          LAG(sh.end_time) OVER (ORDER BY sh.start_time) as prev_end,
          EXTRACT(EPOCH FROM (
            sh.start_time - LAG(sh.end_time) OVER (ORDER BY sh.start_time)
          )) as gap_seconds
        FROM speaker_history sh
        ${sessionId ? 'WHERE sh.session_id = $1' : ''}
        ORDER BY sh.start_time
      )
      SELECT 
        start_time,
        prev_end,
        gap_seconds
      FROM time_gaps
      WHERE gap_seconds > 300 -- gaps longer than 5 minutes
      ORDER BY gap_seconds DESC
    `;

    const deadZoneResult = await this.db.query(deadZoneQuery, sessionId ? [sessionId] : []);

    if (deadZoneResult.rows.length > 0) {
      patterns.push({
        type: 'dead_zones',
        description: 'Extended periods with no speaking activity',
        severity: deadZoneResult.rows[0].gap_seconds > 600 ? 'high' : 'low',
        affectedDelegates: [],
        metrics: {
          gaps: deadZoneResult.rows.map((r) => ({
            startTime: r.prev_end,
            endTime: r.start_time,
            gapSeconds: r.gap_seconds,
            gapMinutes: Math.round(r.gap_seconds / 60),
          })),
        },
      });
    }

    return patterns;
  }

  /**
   * Create indexes for optimal time analysis performance
   */
  async createIndexes(): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_speaker_history_duration 
       ON speaker_history(duration)`,

      `CREATE INDEX IF NOT EXISTS idx_speaker_history_start_time 
       ON speaker_history(start_time)`,

      `CREATE INDEX IF NOT EXISTS idx_speaker_history_session_duration 
       ON speaker_history(session_id, duration)`,

      `CREATE INDEX IF NOT EXISTS idx_queue_session_status 
       ON queue(session_id, status)`,

      `CREATE INDEX IF NOT EXISTS idx_queue_joined_at 
       ON queue(joined_at)`,
    ];

    for (const index of indexes) {
      await this.db.query(index);
    }
  }

  /**
   * Clear cache for time analytics
   */
  async clearCache(pattern?: string): Promise<void> {
    if (!this.cacheEnabled || !this.redis) {
      return;
    }

    const patterns = pattern
      ? [pattern]
      : ['time_histogram:*', 'time_statistics:*', 'peak_hours:*', 'time_trends:*'];

    for (const p of patterns) {
      const keys = await this.redis.keys(p);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}

export default TimeAnalytics;
