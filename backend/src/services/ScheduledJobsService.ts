import * as cron from 'node-cron';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import AnalyticsService from './AnalyticsService';
import DemographicAnalytics from './DemographicAnalytics';
import TimeAnalytics from './TimeAnalytics';
import PDFReportService from './PDFReportService';
import CacheService from './CacheService';
import { format } from 'date-fns';

export interface JobConfig {
  name: string;
  schedule: string;
  enabled: boolean;
  retries: number;
  timeout: number;
  lastRun?: Date;
  lastStatus?: 'success' | 'failure' | 'running';
  lastError?: string;
}

export interface AggregationResult {
  jobName: string;
  startTime: Date;
  endTime: Date;
  recordsProcessed: number;
  status: 'success' | 'failure';
  error?: string;
}

export class ScheduledJobsService extends EventEmitter {
  private db: Pool;
  private redis: Redis | null;
  private analyticsService: AnalyticsService;
  private demographicAnalytics: DemographicAnalytics;
  private timeAnalytics: TimeAnalytics;
  private pdfService: PDFReportService;
  private cacheService: CacheService | null;
  
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private jobConfigs: Map<string, JobConfig> = new Map();
  private jobQueue: Map<string, { retries: number; lastAttempt: Date }> = new Map();
  
  constructor(db: Pool, redis?: Redis, cacheService?: CacheService) {
    super();
    this.db = db;
    this.redis = redis || null;
    this.cacheService = cacheService || null;
    
    this.analyticsService = new AnalyticsService(db, redis);
    this.demographicAnalytics = new DemographicAnalytics(db, redis);
    this.timeAnalytics = new TimeAnalytics(db, redis);
    this.pdfService = new PDFReportService(db);
    
    this.initializeJobs();
  }

  /**
   * Initialize all scheduled jobs
   */
  private initializeJobs(): void {
    // Hourly aggregation job
    this.registerJob({
      name: 'hourly_aggregation',
      schedule: '0 * * * *', // Every hour
      enabled: true,
      retries: 3,
      timeout: 300000 // 5 minutes
    });

    // Daily summary job
    this.registerJob({
      name: 'daily_summary',
      schedule: '0 2 * * *', // 2 AM daily
      enabled: true,
      retries: 3,
      timeout: 600000 // 10 minutes
    });

    // Weekly trend analysis
    this.registerJob({
      name: 'weekly_trends',
      schedule: '0 3 * * 1', // 3 AM on Mondays
      enabled: true,
      retries: 3,
      timeout: 900000 // 15 minutes
    });

    // Cache warmup job
    this.registerJob({
      name: 'cache_warmup',
      schedule: '*/15 * * * *', // Every 15 minutes
      enabled: true,
      retries: 1,
      timeout: 60000 // 1 minute
    });

    // Data cleanup job
    this.registerJob({
      name: 'data_cleanup',
      schedule: '0 4 * * *', // 4 AM daily
      enabled: true,
      retries: 2,
      timeout: 300000 // 5 minutes
    });

    // Report generation job
    this.registerJob({
      name: 'report_generation',
      schedule: '0 6 * * *', // 6 AM daily
      enabled: true,
      retries: 2,
      timeout: 1200000 // 20 minutes
    });
  }

  /**
   * Register a new job
   */
  private registerJob(config: JobConfig): void {
    this.jobConfigs.set(config.name, config);
    
    if (config.enabled) {
      this.startJob(config.name);
    }
  }

  /**
   * Start a specific job
   */
  startJob(jobName: string): boolean {
    const config = this.jobConfigs.get(jobName);
    if (!config || !config.enabled) return false;

    // Stop existing job if running
    this.stopJob(jobName);

    const task = cron.schedule(config.schedule, async () => {
      await this.executeJob(jobName);
    }, {
      scheduled: false
    });

    this.jobs.set(jobName, task);
    task.start();
    
    console.log(`Started scheduled job: ${jobName}`);
    this.emit('job:started', { jobName, schedule: config.schedule });
    
    return true;
  }

  /**
   * Stop a specific job
   */
  stopJob(jobName: string): boolean {
    const task = this.jobs.get(jobName);
    if (!task) return false;

    task.stop();
    this.jobs.delete(jobName);
    
    console.log(`Stopped scheduled job: ${jobName}`);
    this.emit('job:stopped', { jobName });
    
    return true;
  }

  /**
   * Execute a job with retry logic
   */
  private async executeJob(jobName: string): Promise<void> {
    const config = this.jobConfigs.get(jobName);
    if (!config) return;

    const startTime = new Date();
    config.lastRun = startTime;
    config.lastStatus = 'running';
    
    this.emit('job:executing', { jobName, startTime });

    try {
      // Set timeout for job execution
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job timeout')), config.timeout);
      });

      const jobPromise = this.runJob(jobName);
      
      await Promise.race([jobPromise, timeoutPromise]);
      
      config.lastStatus = 'success';
      config.lastError = undefined;
      
      this.emit('job:completed', {
        jobName,
        startTime,
        endTime: new Date(),
        status: 'success'
      });
      
      // Clear retry queue on success
      this.jobQueue.delete(jobName);
      
    } catch (error) {
      config.lastStatus = 'failure';
      config.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      console.error(`Job ${jobName} failed:`, error);
      
      // Handle retries
      await this.handleJobRetry(jobName, config, error as Error);
      
      this.emit('job:failed', {
        jobName,
        startTime,
        endTime: new Date(),
        error: config.lastError
      });
    }
  }

  /**
   * Handle job retry logic
   */
  private async handleJobRetry(jobName: string, config: JobConfig, error: Error): Promise<void> {
    const queueEntry = this.jobQueue.get(jobName) || { retries: 0, lastAttempt: new Date() };
    
    if (queueEntry.retries < config.retries) {
      queueEntry.retries++;
      queueEntry.lastAttempt = new Date();
      this.jobQueue.set(jobName, queueEntry);
      
      // Exponential backoff
      const delay = Math.pow(2, queueEntry.retries) * 1000;
      
      console.log(`Retrying job ${jobName} in ${delay}ms (attempt ${queueEntry.retries}/${config.retries})`);
      
      setTimeout(() => {
        this.executeJob(jobName);
      }, delay);
    } else {
      // Max retries reached
      console.error(`Job ${jobName} failed after ${config.retries} retries`);
      this.jobQueue.delete(jobName);
      
      // Log to database
      await this.logJobFailure(jobName, error);
    }
  }

  /**
   * Run a specific job
   */
  private async runJob(jobName: string): Promise<AggregationResult> {
    const startTime = new Date();
    let recordsProcessed = 0;
    
    try {
      switch (jobName) {
        case 'hourly_aggregation':
          recordsProcessed = await this.runHourlyAggregation();
          break;
          
        case 'daily_summary':
          recordsProcessed = await this.runDailySummary();
          break;
          
        case 'weekly_trends':
          recordsProcessed = await this.runWeeklyTrends();
          break;
          
        case 'cache_warmup':
          recordsProcessed = await this.runCacheWarmup();
          break;
          
        case 'data_cleanup':
          recordsProcessed = await this.runDataCleanup();
          break;
          
        case 'report_generation':
          recordsProcessed = await this.runReportGeneration();
          break;
          
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }
      
      return {
        jobName,
        startTime,
        endTime: new Date(),
        recordsProcessed,
        status: 'success'
      };
      
    } catch (error) {
      return {
        jobName,
        startTime,
        endTime: new Date(),
        recordsProcessed,
        status: 'failure',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Run hourly aggregation
   */
  private async runHourlyAggregation(): Promise<number> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create hourly stats table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS hourly_stats (
          hour_timestamp TIMESTAMP PRIMARY KEY,
          unique_speakers INTEGER,
          total_speaking_instances INTEGER,
          average_speaking_time NUMERIC,
          median_speaking_time NUMERIC,
          participation_rate NUMERIC,
          gender_balance NUMERIC,
          age_balance NUMERIC,
          race_balance NUMERIC,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Aggregate last hour's data
      const result = await client.query(`
        WITH hour_data AS (
          SELECT 
            DATE_TRUNC('hour', NOW() - INTERVAL '1 hour') as hour_timestamp,
            COUNT(DISTINCT sh.delegate_id) as unique_speakers,
            COUNT(sh.id) as total_speaking_instances,
            AVG(sh.duration) as average_speaking_time,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sh.duration) as median_speaking_time
          FROM speaker_history sh
          WHERE sh.start_time >= DATE_TRUNC('hour', NOW() - INTERVAL '1 hour')
            AND sh.start_time < DATE_TRUNC('hour', NOW())
        ),
        participation AS (
          SELECT 
            (COUNT(DISTINCT sh.delegate_id)::numeric / 
             NULLIF(COUNT(DISTINCT d.id), 0)) * 100 as participation_rate
          FROM delegates d
          LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
            AND sh.start_time >= DATE_TRUNC('hour', NOW() - INTERVAL '1 hour')
            AND sh.start_time < DATE_TRUNC('hour', NOW())
        ),
        balance AS (
          SELECT * FROM calculate_balance_score(NULL)
        )
        INSERT INTO hourly_stats (
          hour_timestamp,
          unique_speakers,
          total_speaking_instances,
          average_speaking_time,
          median_speaking_time,
          participation_rate,
          gender_balance,
          age_balance,
          race_balance
        )
        SELECT 
          hd.hour_timestamp,
          hd.unique_speakers,
          hd.total_speaking_instances,
          hd.average_speaking_time,
          hd.median_speaking_time,
          p.participation_rate,
          b.gender_balance,
          b.age_balance,
          b.race_balance
        FROM hour_data hd
        CROSS JOIN participation p
        CROSS JOIN balance b
        ON CONFLICT (hour_timestamp) DO UPDATE SET
          unique_speakers = EXCLUDED.unique_speakers,
          total_speaking_instances = EXCLUDED.total_speaking_instances,
          average_speaking_time = EXCLUDED.average_speaking_time,
          median_speaking_time = EXCLUDED.median_speaking_time,
          participation_rate = EXCLUDED.participation_rate,
          gender_balance = EXCLUDED.gender_balance,
          age_balance = EXCLUDED.age_balance,
          race_balance = EXCLUDED.race_balance
        RETURNING *
      `);
      
      await client.query('COMMIT');
      
      // Invalidate related cache
      if (this.cacheService) {
        await this.cacheService.invalidatePattern('aggregated:*');
      }
      
      return result.rowCount || 0;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run daily summary
   */
  private async runDailySummary(): Promise<number> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create daily summaries table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS daily_summaries (
          date DATE PRIMARY KEY,
          total_sessions INTEGER,
          total_unique_speakers INTEGER,
          total_speaking_instances INTEGER,
          average_speaking_time NUMERIC,
          total_speaking_time NUMERIC,
          participation_rate NUMERIC,
          peak_hour INTEGER,
          gender_balance NUMERIC,
          age_balance NUMERIC,
          race_balance NUMERIC,
          top_speakers JSONB,
          time_distribution JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Aggregate yesterday's data
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const result = await client.query(`
        WITH daily_data AS (
          SELECT 
            $1::DATE as date,
            COUNT(DISTINCT s.id) as total_sessions,
            COUNT(DISTINCT sh.delegate_id) as total_unique_speakers,
            COUNT(sh.id) as total_speaking_instances,
            AVG(sh.duration) as average_speaking_time,
            SUM(sh.duration) as total_speaking_time
          FROM sessions s
          LEFT JOIN speaker_history sh ON s.id = sh.session_id
          WHERE DATE(s.start_time) = $1::DATE
        ),
        participation AS (
          SELECT 
            (COUNT(DISTINCT sh.delegate_id)::numeric / 
             NULLIF(COUNT(DISTINCT d.id), 0)) * 100 as participation_rate
          FROM delegates d
          LEFT JOIN speaker_history sh ON d.id = sh.delegate_id
          JOIN sessions s ON sh.session_id = s.id
          WHERE DATE(s.start_time) = $1::DATE
        ),
        peak AS (
          SELECT 
            EXTRACT(HOUR FROM sh.start_time) as peak_hour
          FROM speaker_history sh
          JOIN sessions s ON sh.session_id = s.id
          WHERE DATE(s.start_time) = $1::DATE
          GROUP BY EXTRACT(HOUR FROM sh.start_time)
          ORDER BY COUNT(*) DESC
          LIMIT 1
        ),
        balance AS (
          SELECT * FROM calculate_balance_score(NULL)
        ),
        top_speakers AS (
          SELECT json_agg(
            json_build_object(
              'delegate_id', delegate_id,
              'name', name,
              'speaking_count', speaking_count
            ) ORDER BY speaking_count DESC
          ) as speakers
          FROM (
            SELECT 
              d.id as delegate_id,
              d.name,
              COUNT(sh.id) as speaking_count
            FROM delegates d
            JOIN speaker_history sh ON d.id = sh.delegate_id
            JOIN sessions s ON sh.session_id = s.id
            WHERE DATE(s.start_time) = $1::DATE
            GROUP BY d.id, d.name
            ORDER BY speaking_count DESC
            LIMIT 10
          ) t
        )
        INSERT INTO daily_summaries (
          date,
          total_sessions,
          total_unique_speakers,
          total_speaking_instances,
          average_speaking_time,
          total_speaking_time,
          participation_rate,
          peak_hour,
          gender_balance,
          age_balance,
          race_balance,
          top_speakers
        )
        SELECT 
          dd.date,
          dd.total_sessions,
          dd.total_unique_speakers,
          dd.total_speaking_instances,
          dd.average_speaking_time,
          dd.total_speaking_time,
          p.participation_rate,
          pk.peak_hour,
          b.gender_balance,
          b.age_balance,
          b.race_balance,
          ts.speakers
        FROM daily_data dd
        CROSS JOIN participation p
        CROSS JOIN peak pk
        CROSS JOIN balance b
        CROSS JOIN top_speakers ts
        ON CONFLICT (date) DO UPDATE SET
          total_sessions = EXCLUDED.total_sessions,
          total_unique_speakers = EXCLUDED.total_unique_speakers,
          total_speaking_instances = EXCLUDED.total_speaking_instances,
          average_speaking_time = EXCLUDED.average_speaking_time,
          total_speaking_time = EXCLUDED.total_speaking_time,
          participation_rate = EXCLUDED.participation_rate,
          peak_hour = EXCLUDED.peak_hour,
          gender_balance = EXCLUDED.gender_balance,
          age_balance = EXCLUDED.age_balance,
          race_balance = EXCLUDED.race_balance,
          top_speakers = EXCLUDED.top_speakers
        RETURNING *
      `, [yesterday]);
      
      await client.query('COMMIT');
      
      return result.rowCount || 0;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run weekly trends analysis
   */
  private async runWeeklyTrends(): Promise<number> {
    const client = await this.db.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create weekly trends table if not exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS weekly_trends (
          week_start DATE PRIMARY KEY,
          week_end DATE,
          trend_direction VARCHAR(20),
          participation_change NUMERIC,
          speaking_time_change NUMERIC,
          gender_balance_trend NUMERIC,
          age_balance_trend NUMERIC,
          race_balance_trend NUMERIC,
          insights JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      // Analyze last week's trends
      const result = await client.query(`
        WITH current_week AS (
          SELECT 
            DATE_TRUNC('week', NOW() - INTERVAL '1 week') as week_start,
            DATE_TRUNC('week', NOW() - INTERVAL '1 week') + INTERVAL '6 days' as week_end,
            AVG(participation_rate) as avg_participation,
            AVG(average_speaking_time) as avg_speaking_time,
            AVG(gender_balance) as avg_gender_balance,
            AVG(age_balance) as avg_age_balance,
            AVG(race_balance) as avg_race_balance
          FROM daily_summaries
          WHERE date >= DATE_TRUNC('week', NOW() - INTERVAL '1 week')
            AND date < DATE_TRUNC('week', NOW())
        ),
        previous_week AS (
          SELECT 
            AVG(participation_rate) as avg_participation,
            AVG(average_speaking_time) as avg_speaking_time,
            AVG(gender_balance) as avg_gender_balance,
            AVG(age_balance) as avg_age_balance,
            AVG(race_balance) as avg_race_balance
          FROM daily_summaries
          WHERE date >= DATE_TRUNC('week', NOW() - INTERVAL '2 weeks')
            AND date < DATE_TRUNC('week', NOW() - INTERVAL '1 week')
        ),
        trends AS (
          SELECT 
            cw.week_start,
            cw.week_end,
            CASE 
              WHEN cw.avg_participation > pw.avg_participation THEN 'improving'
              WHEN cw.avg_participation < pw.avg_participation THEN 'declining'
              ELSE 'stable'
            END as trend_direction,
            cw.avg_participation - pw.avg_participation as participation_change,
            cw.avg_speaking_time - pw.avg_speaking_time as speaking_time_change,
            cw.avg_gender_balance - pw.avg_gender_balance as gender_balance_trend,
            cw.avg_age_balance - pw.avg_age_balance as age_balance_trend,
            cw.avg_race_balance - pw.avg_race_balance as race_balance_trend
          FROM current_week cw
          CROSS JOIN previous_week pw
        )
        INSERT INTO weekly_trends (
          week_start,
          week_end,
          trend_direction,
          participation_change,
          speaking_time_change,
          gender_balance_trend,
          age_balance_trend,
          race_balance_trend,
          insights
        )
        SELECT 
          week_start,
          week_end,
          trend_direction,
          participation_change,
          speaking_time_change,
          gender_balance_trend,
          age_balance_trend,
          race_balance_trend,
          json_build_object(
            'significant_changes', ARRAY[]::text[],
            'recommendations', ARRAY[]::text[]
          )
        FROM trends
        ON CONFLICT (week_start) DO UPDATE SET
          week_end = EXCLUDED.week_end,
          trend_direction = EXCLUDED.trend_direction,
          participation_change = EXCLUDED.participation_change,
          speaking_time_change = EXCLUDED.speaking_time_change,
          gender_balance_trend = EXCLUDED.gender_balance_trend,
          age_balance_trend = EXCLUDED.age_balance_trend,
          race_balance_trend = EXCLUDED.race_balance_trend,
          insights = EXCLUDED.insights
        RETURNING *
      `);
      
      await client.query('COMMIT');
      
      return result.rowCount || 0;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run cache warmup
   */
  private async runCacheWarmup(): Promise<number> {
    if (!this.cacheService) return 0;
    
    let warmedKeys = 0;
    
    // Get active sessions
    const sessionsResult = await this.db.query(`
      SELECT id FROM sessions 
      WHERE end_time IS NULL 
      ORDER BY start_time DESC 
      LIMIT 5
    `);
    
    for (const session of sessionsResult.rows) {
      // Warm up session metrics
      await this.analyticsService.getSessionMetrics(session.id);
      warmedKeys++;
      
      // Warm up participation rates
      await this.analyticsService.calculateParticipationRate('gender', undefined, session.id);
      await this.analyticsService.calculateParticipationRate('age_group', undefined, session.id);
      await this.analyticsService.calculateParticipationRate('race', undefined, session.id);
      warmedKeys += 3;
      
      // Warm up time distribution
      await this.analyticsService.generateTimeDistribution(30, session.id);
      warmedKeys++;
    }
    
    // Warm up global metrics
    await this.demographicAnalytics.calculateBalanceScores();
    warmedKeys++;
    
    return warmedKeys;
  }

  /**
   * Run data cleanup
   */
  private async runDataCleanup(): Promise<number> {
    const client = await this.db.connect();
    let deletedRecords = 0;
    
    try {
      await client.query('BEGIN');
      
      // Delete old hourly stats (>30 days)
      const hourlyResult = await client.query(`
        DELETE FROM hourly_stats 
        WHERE hour_timestamp < NOW() - INTERVAL '30 days'
      `);
      deletedRecords += hourlyResult.rowCount || 0;
      
      // Delete old aggregated data (>90 days)
      const dailyResult = await client.query(`
        DELETE FROM daily_summaries 
        WHERE date < CURRENT_DATE - INTERVAL '90 days'
      `);
      deletedRecords += dailyResult.rowCount || 0;
      
      // Delete old weekly trends (>180 days)
      const weeklyResult = await client.query(`
        DELETE FROM weekly_trends 
        WHERE week_start < CURRENT_DATE - INTERVAL '180 days'
      `);
      deletedRecords += weeklyResult.rowCount || 0;
      
      // Clean up orphaned queue entries
      const queueResult = await client.query(`
        DELETE FROM queue 
        WHERE status = 'abandoned' 
        AND joined_at < NOW() - INTERVAL '7 days'
      `);
      deletedRecords += queueResult.rowCount || 0;
      
      await client.query('COMMIT');
      
      // Clear old cache entries
      if (this.cacheService) {
        await this.cacheService.clearAll();
      }
      
      return deletedRecords;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Run report generation
   */
  private async runReportGeneration(): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Get yesterday's sessions
    const sessionsResult = await this.db.query(`
      SELECT id FROM sessions 
      WHERE DATE(start_time) = $1
    `, [yesterday]);
    
    let reportsGenerated = 0;
    
    for (const session of sessionsResult.rows) {
      try {
        const report = await this.pdfService.generateReport({
          sessionId: session.id,
          includeCharts: true,
          includeHeatmap: true,
          includeSummary: true,
          includeRecommendations: true
        });
        
        // Save report to storage or send via email
        // This is a placeholder - implement actual storage logic
        await this.saveReport(session.id, report);
        
        reportsGenerated++;
      } catch (error) {
        console.error(`Failed to generate report for session ${session.id}:`, error);
      }
    }
    
    return reportsGenerated;
  }

  /**
   * Save report to storage
   */
  private async saveReport(sessionId: string, report: Buffer): Promise<void> {
    // Placeholder for report storage logic
    // Could save to S3, local filesystem, or database
    const filename = `report_${sessionId}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    console.log(`Report saved: ${filename} (${report.length} bytes)`);
  }

  /**
   * Manually trigger a job
   */
  async triggerJob(jobName: string): Promise<AggregationResult> {
    const config = this.jobConfigs.get(jobName);
    if (!config) {
      throw new Error(`Job ${jobName} not found`);
    }
    
    console.log(`Manually triggering job: ${jobName}`);
    return await this.runJob(jobName);
  }

  /**
   * Get job status
   */
  getJobStatus(jobName?: string): JobConfig | Map<string, JobConfig> {
    if (jobName) {
      const config = this.jobConfigs.get(jobName);
      if (!config) throw new Error(`Job ${jobName} not found`);
      return config;
    }
    
    return this.jobConfigs;
  }

  /**
   * Update job configuration
   */
  updateJobConfig(jobName: string, updates: Partial<JobConfig>): void {
    const config = this.jobConfigs.get(jobName);
    if (!config) throw new Error(`Job ${jobName} not found`);
    
    const wasEnabled = config.enabled;
    Object.assign(config, updates);
    
    // Restart job if enable status changed
    if (wasEnabled !== config.enabled) {
      if (config.enabled) {
        this.startJob(jobName);
      } else {
        this.stopJob(jobName);
      }
    } else if (config.enabled && updates.schedule) {
      // Restart if schedule changed
      this.stopJob(jobName);
      this.startJob(jobName);
    }
  }

  /**
   * Log job failure to database
   */
  private async logJobFailure(jobName: string, error: Error): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO job_failures (
          job_name,
          error_message,
          stack_trace,
          occurred_at
        ) VALUES ($1, $2, $3, NOW())
      `, [jobName, error.message, error.stack]);
    } catch (logError) {
      console.error('Failed to log job failure:', logError);
    }
  }

  /**
   * Start all enabled jobs
   */
  startAll(): void {
    for (const [jobName, config] of this.jobConfigs.entries()) {
      if (config.enabled) {
        this.startJob(jobName);
      }
    }
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    for (const jobName of this.jobs.keys()) {
      this.stopJob(jobName);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.stopAll();
    await this.pdfService.cleanup();
  }
}

export default ScheduledJobsService;