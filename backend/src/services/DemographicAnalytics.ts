import { Pool } from 'pg';
import { Redis } from 'ioredis';

export interface DemographicRanking {
  rank: number;
  demographicGroup: string;
  value: string;
  speakingFrequency: number;
  totalTime: number;
  averageTime: number;
  percentileRank: number;
  participationScore: number;
}

export interface DemographicCombination {
  gender: string;
  ageGroup: string;
  race: string;
  totalDelegates: number;
  participants: number;
  participationRate: number;
  speakingInstances: number;
  averageSpeakingTime: number;
  balanceScore: number;
}

export interface DemographicTrend {
  demographic: string;
  value: string;
  timePoint: Date;
  participationRate: number;
  changeFromPrevious: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface SequentialAnalysis {
  delegateId: string;
  demographic: string;
  value: string;
  previousSpeaker: {
    demographic: string;
    value: string;
  } | null;
  nextSpeaker: {
    demographic: string;
    value: string;
  } | null;
  transitionPattern: string;
}

export class DemographicAnalytics {
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
   * Rank speakers by frequency using window functions
   */
  async rankSpeakersByDemographic(
    demographic: 'gender' | 'age_group' | 'race',
    sessionId?: string,
    limit: number = 20
  ): Promise<DemographicRanking[]> {
    const cacheKey = `demographic_rank:${demographic}:${sessionId || 'all'}:${limit}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const query = `
      WITH speaker_metrics AS (
        SELECT 
          d.${demographic} as demographic_value,
          d.id,
          d.name,
          COUNT(sh.id) as speaking_frequency,
          COALESCE(SUM(sh.duration), 0) as total_time,
          COALESCE(AVG(sh.duration), 0) as average_time
        FROM delegates d
        LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'AND sh.session_id = $1' : ''}
        WHERE d.${demographic} IS NOT NULL
        GROUP BY d.${demographic}, d.id, d.name
      ),
      ranked_speakers AS (
        SELECT 
          ROW_NUMBER() OVER (
            PARTITION BY demographic_value 
            ORDER BY speaking_frequency DESC, total_time DESC
          ) as rank,
          demographic_value,
          name,
          speaking_frequency,
          total_time,
          average_time,
          PERCENT_RANK() OVER (
            PARTITION BY demographic_value 
            ORDER BY speaking_frequency
          ) * 100 as percentile_rank,
          -- Calculate participation score based on frequency and consistency
          (speaking_frequency::numeric / NULLIF(
            MAX(speaking_frequency) OVER (PARTITION BY demographic_value), 0
          )) * 50 +
          (CASE 
            WHEN average_time > 0 THEN 
              (average_time::numeric / NULLIF(
                AVG(average_time) OVER (PARTITION BY demographic_value), 0
              )) * 50
            ELSE 0
          END) as participation_score
        FROM speaker_metrics
      )
      SELECT 
        rank,
        '${demographic}' as demographic_group,
        demographic_value as value,
        speaking_frequency,
        ROUND(total_time::numeric, 2) as total_time,
        ROUND(average_time::numeric, 2) as average_time,
        ROUND(percentile_rank::numeric, 2) as percentile_rank,
        ROUND(participation_score::numeric, 2) as participation_score
      FROM ranked_speakers
      WHERE rank <= ${limit}
      ORDER BY demographic_value, rank
    `;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);
    const data = result.rows as DemographicRanking[];

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Analyze participation by demographic combinations
   */
  async analyzeDemographicCombinations(sessionId?: string): Promise<DemographicCombination[]> {
    const cacheKey = `demographic_combinations:${sessionId || 'all'}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const query = `
      WITH demographic_groups AS (
        SELECT 
          d.gender,
          d.age_group,
          d.race,
          d.id,
          COUNT(sh.id) as speaking_instances,
          COALESCE(AVG(sh.duration), 0) as avg_speaking_time
        FROM delegates d
        LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'AND sh.session_id = $1' : ''}
        WHERE d.gender IS NOT NULL 
          AND d.age_group IS NOT NULL 
          AND d.race IS NOT NULL
        GROUP BY d.gender, d.age_group, d.race, d.id
      ),
      combination_stats AS (
        SELECT 
          gender,
          age_group,
          race,
          COUNT(DISTINCT id) as total_delegates,
          COUNT(DISTINCT CASE WHEN speaking_instances > 0 THEN id END) as participants,
          SUM(speaking_instances) as total_speaking_instances,
          AVG(CASE WHEN speaking_instances > 0 THEN avg_speaking_time END) as avg_time
        FROM demographic_groups
        GROUP BY gender, age_group, race
      ),
      balance_calculation AS (
        SELECT 
          *,
          (participants::numeric / NULLIF(total_delegates, 0)) * 100 as participation_rate,
          -- Calculate balance score based on expected vs actual participation
          ABS(50 - (participants::numeric / NULLIF(total_delegates, 0)) * 100) as deviation_from_ideal,
          AVG(participants::numeric / NULLIF(total_delegates, 0)) OVER () * 100 as overall_avg_rate
        FROM combination_stats
      )
      SELECT 
        gender,
        age_group,
        race,
        total_delegates,
        participants,
        ROUND(participation_rate, 2) as participation_rate,
        total_speaking_instances as speaking_instances,
        ROUND(avg_time::numeric, 2) as average_speaking_time,
        ROUND(
          GREATEST(0, 100 - deviation_from_ideal - 
            ABS(participation_rate - overall_avg_rate)
          ), 2
        ) as balance_score
      FROM balance_calculation
      ORDER BY participation_rate DESC, total_delegates DESC
    `;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);
    const data = result.rows as DemographicCombination[];

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(data));
    }

    return data;
  }

  /**
   * Calculate demographic balance scores
   */
  async calculateBalanceScores(sessionId?: string): Promise<{
    gender: number;
    age: number;
    race: number;
    overall: number;
  }> {
    const cacheKey = `balance_scores:${sessionId || 'all'}`;

    if (this.cacheEnabled && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const query = `
      WITH participation_stats AS (
        SELECT 
          d.gender,
          d.age_group,
          d.race,
          COUNT(DISTINCT sh.id) as speaking_count,
          COUNT(DISTINCT d.id) as delegate_count
        FROM delegates d
        LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'AND sh.session_id = $1' : ''}
        GROUP BY d.gender, d.age_group, d.race
      ),
      gender_stats AS (
        SELECT 
          gender,
          SUM(speaking_count)::numeric / NULLIF(SUM(delegate_count), 0) as participation_rate,
          STDDEV(speaking_count) as variance
        FROM participation_stats
        WHERE gender IS NOT NULL
        GROUP BY gender
      ),
      age_stats AS (
        SELECT 
          age_group,
          SUM(speaking_count)::numeric / NULLIF(SUM(delegate_count), 0) as participation_rate,
          STDDEV(speaking_count) as variance
        FROM participation_stats
        WHERE age_group IS NOT NULL
        GROUP BY age_group
      ),
      race_stats AS (
        SELECT 
          race,
          SUM(speaking_count)::numeric / NULLIF(SUM(delegate_count), 0) as participation_rate,
          STDDEV(speaking_count) as variance
        FROM participation_stats
        WHERE race IS NOT NULL
        GROUP BY race
      ),
      balance_metrics AS (
        SELECT 
          -- Gender balance: ideal is 50-50 split
          100 - ABS(50 - (
            SELECT SUM(CASE WHEN gender = 'Female' THEN speaking_count ELSE 0 END)::numeric / 
                   NULLIF(SUM(speaking_count), 0) * 100
            FROM participation_stats WHERE gender IS NOT NULL
          )) as gender_balance,
          
          -- Age balance: lower variance is better
          GREATEST(0, 100 - COALESCE((SELECT AVG(variance) FROM age_stats), 0) * 10) as age_balance,
          
          -- Race balance: lower variance is better
          GREATEST(0, 100 - COALESCE((SELECT AVG(variance) FROM race_stats), 0) * 10) as race_balance
      )
      SELECT 
        ROUND(COALESCE(gender_balance, 50), 2) as gender,
        ROUND(COALESCE(age_balance, 50), 2) as age,
        ROUND(COALESCE(race_balance, 50), 2) as race,
        ROUND((
          COALESCE(gender_balance, 50) + 
          COALESCE(age_balance, 50) + 
          COALESCE(race_balance, 50)
        ) / 3, 2) as overall
      FROM balance_metrics
    `;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);
    const scores = result.rows[0] || { gender: 50, age: 50, race: 50, overall: 50 };

    if (this.cacheEnabled && this.redis) {
      await this.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(scores));
    }

    return scores;
  }

  /**
   * Analyze sequential speaking patterns using LAG/LEAD
   */
  async analyzeSequentialPatterns(
    sessionId: string,
    demographic: 'gender' | 'age_group' | 'race'
  ): Promise<SequentialAnalysis[]> {
    const query = `
      WITH speaking_sequence AS (
        SELECT 
          sh.id,
          sh.delegate_id,
          d.${demographic} as current_value,
          sh.start_time,
          LAG(d.${demographic}) OVER (ORDER BY sh.start_time) as prev_value,
          LAG(sh.delegate_id) OVER (ORDER BY sh.start_time) as prev_delegate,
          LEAD(d.${demographic}) OVER (ORDER BY sh.start_time) as next_value,
          LEAD(sh.delegate_id) OVER (ORDER BY sh.start_time) as next_delegate
        FROM speaker_history sh
        JOIN delegates d ON sh.delegate_id = d.id
        WHERE sh.session_id = $1
        ORDER BY sh.start_time
      ),
      transitions AS (
        SELECT 
          delegate_id,
          current_value,
          prev_value,
          next_value,
          CASE 
            WHEN prev_value = current_value AND next_value = current_value THEN 'homogeneous'
            WHEN prev_value != current_value AND next_value != current_value THEN 'transitional'
            WHEN prev_value = current_value OR next_value = current_value THEN 'partial_match'
            ELSE 'isolated'
          END as transition_pattern
        FROM speaking_sequence
      )
      SELECT 
        delegate_id,
        '${demographic}' as demographic,
        current_value as value,
        CASE 
          WHEN prev_value IS NOT NULL THEN 
            json_build_object('demographic', '${demographic}', 'value', prev_value)
          ELSE NULL
        END as previous_speaker,
        CASE 
          WHEN next_value IS NOT NULL THEN 
            json_build_object('demographic', '${demographic}', 'value', next_value)
          ELSE NULL
        END as next_speaker,
        transition_pattern
      FROM transitions
      ORDER BY delegate_id
    `;

    const result = await this.db.query(query, [sessionId]);
    return result.rows as SequentialAnalysis[];
  }

  /**
   * Calculate participation trends over time
   */
  async calculateParticipationTrends(
    demographic: 'gender' | 'age_group' | 'race',
    value: string,
    days: number = 7
  ): Promise<DemographicTrend[]> {
    const query = `
      WITH daily_participation AS (
        SELECT 
          DATE(s.start_time) as date,
          COUNT(DISTINCT CASE WHEN d.${demographic} = $1 THEN sh.delegate_id END)::numeric /
          NULLIF(COUNT(DISTINCT CASE WHEN d.${demographic} = $1 THEN d.id END), 0) * 100 as participation_rate
        FROM sessions s
        CROSS JOIN delegates d
        LEFT JOIN speaker_history sh ON sh.session_id = s.id AND sh.delegate_id = d.id
        WHERE s.start_time >= CURRENT_DATE - INTERVAL '${days} days'
          AND d.${demographic} IS NOT NULL
        GROUP BY DATE(s.start_time)
      ),
      trend_analysis AS (
        SELECT 
          date,
          participation_rate,
          LAG(participation_rate) OVER (ORDER BY date) as prev_rate,
          participation_rate - LAG(participation_rate) OVER (ORDER BY date) as change,
          CASE 
            WHEN participation_rate - LAG(participation_rate) OVER (ORDER BY date) > 1 THEN 'increasing'
            WHEN participation_rate - LAG(participation_rate) OVER (ORDER BY date) < -1 THEN 'decreasing'
            ELSE 'stable'
          END as trend
        FROM daily_participation
      )
      SELECT 
        '${demographic}' as demographic,
        $1 as value,
        date as time_point,
        ROUND(participation_rate, 2) as participation_rate,
        ROUND(COALESCE(change, 0), 2) as change_from_previous,
        trend
      FROM trend_analysis
      ORDER BY date DESC
    `;

    const result = await this.db.query(query, [value]);
    return result.rows as DemographicTrend[];
  }

  /**
   * Get speaking frequency distribution
   */
  async getSpeakingFrequencyDistribution(
    demographic: 'gender' | 'age_group' | 'race',
    sessionId?: string
  ): Promise<
    {
      value: string;
      frequency_0: number;
      frequency_1_3: number;
      frequency_4_6: number;
      frequency_7_plus: number;
      avg_frequency: number;
    }[]
  > {
    const query = `
      WITH frequency_counts AS (
        SELECT 
          d.${demographic} as demographic_value,
          d.id,
          COUNT(sh.id) as speaking_frequency
        FROM delegates d
        LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
        ${sessionId ? 'AND sh.session_id = $1' : ''}
        WHERE d.${demographic} IS NOT NULL
        GROUP BY d.${demographic}, d.id
      ),
      distribution AS (
        SELECT 
          demographic_value,
          COUNT(CASE WHEN speaking_frequency = 0 THEN 1 END) as freq_0,
          COUNT(CASE WHEN speaking_frequency BETWEEN 1 AND 3 THEN 1 END) as freq_1_3,
          COUNT(CASE WHEN speaking_frequency BETWEEN 4 AND 6 THEN 1 END) as freq_4_6,
          COUNT(CASE WHEN speaking_frequency >= 7 THEN 1 END) as freq_7_plus,
          AVG(speaking_frequency) as avg_freq
        FROM frequency_counts
        GROUP BY demographic_value
      )
      SELECT 
        demographic_value as value,
        freq_0 as frequency_0,
        freq_1_3 as frequency_1_3,
        freq_4_6 as frequency_4_6,
        freq_7_plus as frequency_7_plus,
        ROUND(avg_freq, 2) as avg_frequency
      FROM distribution
      ORDER BY demographic_value
    `;

    const params = sessionId ? [sessionId] : [];
    const result = await this.db.query(query, params);
    return result.rows;
  }

  /**
   * Create stored procedures for frequently used calculations
   */
  async createStoredProcedures(): Promise<void> {
    // Procedure for calculating participation rate
    const participationProcedure = `
      CREATE OR REPLACE FUNCTION calculate_participation_rate(
        p_demographic TEXT,
        p_value TEXT DEFAULT NULL,
        p_session_id UUID DEFAULT NULL
      )
      RETURNS TABLE(
        demographic TEXT,
        value TEXT,
        total_delegates INTEGER,
        participants INTEGER,
        rate NUMERIC,
        average_speaking_time NUMERIC
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        WITH speaker_stats AS (
          SELECT 
            d.id,
            CASE p_demographic
              WHEN 'gender' THEN d.gender
              WHEN 'age_group' THEN d.age_group
              WHEN 'race' THEN d.race
            END as demo_value,
            COUNT(DISTINCT sh.id) as speaking_instances,
            COALESCE(SUM(sh.duration), 0) as total_time
          FROM delegates d
          LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
            AND (p_session_id IS NULL OR sh.session_id = p_session_id)
          GROUP BY d.id, demo_value
        ),
        demographic_summary AS (
          SELECT 
            demo_value,
            COUNT(DISTINCT id) as total_dels,
            COUNT(DISTINCT CASE WHEN speaking_instances > 0 THEN id END) as parts,
            AVG(CASE WHEN speaking_instances > 0 THEN total_time END) as avg_time
          FROM speaker_stats
          WHERE (p_value IS NULL OR demo_value = p_value)
          GROUP BY demo_value
        )
        SELECT 
          p_demographic::TEXT,
          demo_value::TEXT,
          total_dels::INTEGER,
          parts::INTEGER,
          ROUND((parts::numeric / NULLIF(total_dels, 0)) * 100, 2),
          COALESCE(ROUND(avg_time, 2), 0)
        FROM demographic_summary
        ORDER BY rate DESC;
      END;
      $$;
    `;

    // Procedure for balance score calculation
    const balanceScoreProcedure = `
      CREATE OR REPLACE FUNCTION calculate_balance_score(
        p_session_id UUID DEFAULT NULL
      )
      RETURNS TABLE(
        gender_balance NUMERIC,
        age_balance NUMERIC,
        race_balance NUMERIC,
        overall_balance NUMERIC
      )
      LANGUAGE plpgsql
      AS $$
      DECLARE
        v_gender_balance NUMERIC;
        v_age_balance NUMERIC;
        v_race_balance NUMERIC;
      BEGIN
        -- Calculate gender balance
        SELECT 100 - ABS(50 - (
          SUM(CASE WHEN d.gender = 'Female' THEN 1 ELSE 0 END)::numeric / 
          NULLIF(COUNT(*), 0) * 100
        ))
        INTO v_gender_balance
        FROM delegates d
        JOIN speaker_history sh ON d.id = sh.delegate_id
        WHERE p_session_id IS NULL OR sh.session_id = p_session_id;
        
        -- Calculate age balance (using variance)
        WITH age_variance AS (
          SELECT STDDEV(count) as variance
          FROM (
            SELECT d.age_group, COUNT(*) as count
            FROM delegates d
            JOIN speaker_history sh ON d.id = sh.delegate_id
            WHERE p_session_id IS NULL OR sh.session_id = p_session_id
            GROUP BY d.age_group
          ) t
        )
        SELECT GREATEST(0, 100 - COALESCE(variance, 0) * 10)
        INTO v_age_balance
        FROM age_variance;
        
        -- Calculate race balance (using variance)
        WITH race_variance AS (
          SELECT STDDEV(count) as variance
          FROM (
            SELECT d.race, COUNT(*) as count
            FROM delegates d
            JOIN speaker_history sh ON d.id = sh.delegate_id
            WHERE p_session_id IS NULL OR sh.session_id = p_session_id
            GROUP BY d.race
          ) t
        )
        SELECT GREATEST(0, 100 - COALESCE(variance, 0) * 10)
        INTO v_race_balance
        FROM race_variance;
        
        RETURN QUERY
        SELECT 
          ROUND(COALESCE(v_gender_balance, 50), 2),
          ROUND(COALESCE(v_age_balance, 50), 2),
          ROUND(COALESCE(v_race_balance, 50), 2),
          ROUND((
            COALESCE(v_gender_balance, 50) + 
            COALESCE(v_age_balance, 50) + 
            COALESCE(v_race_balance, 50)
          ) / 3, 2);
      END;
      $$;
    `;

    await this.db.query(participationProcedure);
    await this.db.query(balanceScoreProcedure);
  }

  /**
   * Create indexes for optimal query performance
   */
  async createIndexes(): Promise<void> {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_delegates_demographics 
       ON delegates(gender, age_group, race)`,

      `CREATE INDEX IF NOT EXISTS idx_speaker_history_delegate_session 
       ON speaker_history(delegate_id, session_id)`,

      `CREATE INDEX IF NOT EXISTS idx_speaker_history_session_time 
       ON speaker_history(session_id, start_time)`,

      `CREATE INDEX IF NOT EXISTS idx_delegates_gender 
       ON delegates(gender) WHERE gender IS NOT NULL`,

      `CREATE INDEX IF NOT EXISTS idx_delegates_age_group 
       ON delegates(age_group) WHERE age_group IS NOT NULL`,

      `CREATE INDEX IF NOT EXISTS idx_delegates_race 
       ON delegates(race) WHERE race IS NOT NULL`,
    ];

    for (const index of indexes) {
      await this.db.query(index);
    }
  }

  /**
   * Clear cache for demographic analytics
   */
  async clearCache(pattern?: string): Promise<void> {
    if (!this.cacheEnabled || !this.redis) {
      return;
    }

    const patterns = pattern
      ? [pattern]
      : ['demographic_rank:*', 'demographic_combinations:*', 'balance_scores:*'];

    for (const p of patterns) {
      const keys = await this.redis.keys(p);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }
}

export default DemographicAnalytics;
