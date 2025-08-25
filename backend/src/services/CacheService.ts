import Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  maxRetries?: number;
  retryStrategy?: (times: number) => number | void;
  enableOfflineQueue?: boolean;
  connectionPoolSize?: number;
}

export interface CacheTTLConfig {
  participationRates: number;      // 5 minutes
  timeDistributions: number;       // 2 minutes
  demographicSummaries: number;    // 10 minutes
  sessionMetrics: number;          // 1 minute
  speakerStatistics: number;       // 3 minutes
  aggregatedMetrics: number;       // 15 minutes
  queueStatus: number;             // 30 seconds
  realtimeStats: number;           // 10 seconds
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
  evictedKeys: number;
}

export class CacheService extends EventEmitter {
  private redis: Redis | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalKeys: 0,
    memoryUsage: 0,
    evictedKeys: 0
  };

  private ttlConfig: CacheTTLConfig = {
    participationRates: 300,      // 5 minutes
    timeDistributions: 120,       // 2 minutes
    demographicSummaries: 600,    // 10 minutes
    sessionMetrics: 60,           // 1 minute
    speakerStatistics: 180,       // 3 minutes
    aggregatedMetrics: 900,       // 15 minutes
    queueStatus: 30,              // 30 seconds
    realtimeStats: 10             // 10 seconds
  };

  private readonly INVALIDATION_CHANNEL = 'cache:invalidation';
  private readonly WARMUP_CHANNEL = 'cache:warmup';

  constructor(private config: CacheConfig) {
    super();
    this.initialize();
  }

  /**
   * Initialize Redis connections
   */
  private async initialize(): Promise<void> {
    try {
      // Main Redis client for get/set operations
      this.redis = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db || 0,
        retryStrategy: this.config.retryStrategy || ((times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }),
        enableOfflineQueue: this.config.enableOfflineQueue !== false,
        maxRetriesPerRequest: this.config.maxRetries || 3
      });

      // Pub/Sub clients for cache invalidation
      this.pubClient = this.redis.duplicate();
      this.subClient = this.redis.duplicate();

      // Set up event listeners
      this.setupEventListeners();

      // Set up pub/sub for cache invalidation
      await this.setupPubSub();

      this.isConnected = true;
      this.emit('connected');

      // Start monitoring
      this.startMonitoring();

    } catch (error) {
      console.error('Failed to initialize cache service:', error);
      this.emit('error', error);
    }
  }

  /**
   * Set up event listeners for Redis clients
   */
  private setupEventListeners(): void {
    if (!this.redis) return;

    this.redis.on('connect', () => {
      console.log('Cache service connected to Redis');
      this.isConnected = true;
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });
  }

  /**
   * Set up pub/sub for cache invalidation across instances
   */
  private async setupPubSub(): Promise<void> {
    if (!this.subClient) return;

    // Subscribe to invalidation channel
    await this.subClient.subscribe(this.INVALIDATION_CHANNEL);
    await this.subClient.subscribe(this.WARMUP_CHANNEL);

    this.subClient.on('message', async (channel, message) => {
      if (channel === this.INVALIDATION_CHANNEL) {
        await this.handleInvalidationMessage(message);
      } else if (channel === this.WARMUP_CHANNEL) {
        await this.handleWarmupMessage(message);
      }
    });
  }

  /**
   * Handle cache invalidation messages
   */
  private async handleInvalidationMessage(message: string): Promise<void> {
    try {
      const { pattern, keys } = JSON.parse(message);
      
      if (pattern) {
        await this.invalidatePattern(pattern, false); // Don't broadcast again
      } else if (keys && Array.isArray(keys)) {
        await this.invalidateKeys(keys, false); // Don't broadcast again
      }
    } catch (error) {
      console.error('Error handling invalidation message:', error);
    }
  }

  /**
   * Handle cache warmup messages
   */
  private async handleWarmupMessage(message: string): Promise<void> {
    try {
      const { type, params } = JSON.parse(message);
      this.emit('warmup:requested', { type, params });
    } catch (error) {
      console.error('Error handling warmup message:', error);
    }
  }

  /**
   * Get value from cache with stats tracking
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis || !this.isConnected) return null;

    try {
      const value = await this.redis.get(key);
      
      if (value) {
        this.stats.hits++;
        this.updateHitRate();
        return JSON.parse(value);
      } else {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (!this.redis || !this.isConnected) return false;

    try {
      const serialized = JSON.stringify(value);
      const effectiveTTL = ttl || this.getDefaultTTL(key);
      
      if (effectiveTTL > 0) {
        await this.redis.setex(key, effectiveTTL, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Generate value
    const value = await factory();
    
    // Store in cache
    await this.set(key, value, ttl);
    
    return value;
  }

  /**
   * Invalidate specific keys
   */
  async invalidateKeys(keys: string[], broadcast: boolean = true): Promise<void> {
    if (!this.redis || !this.isConnected) return;

    try {
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        if (broadcast && this.pubClient) {
          await this.pubClient.publish(
            this.INVALIDATION_CHANNEL,
            JSON.stringify({ keys })
          );
        }
      }
    } catch (error) {
      console.error('Error invalidating keys:', error);
    }
  }

  /**
   * Invalidate keys matching pattern
   */
  async invalidatePattern(pattern: string, broadcast: boolean = true): Promise<void> {
    if (!this.redis || !this.isConnected) return;

    try {
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        
        if (broadcast && this.pubClient) {
          await this.pubClient.publish(
            this.INVALIDATION_CHANNEL,
            JSON.stringify({ pattern })
          );
        }
      }
    } catch (error) {
      console.error('Error invalidating pattern:', error);
    }
  }

  /**
   * Invalidate cache based on event type
   */
  async invalidateByEvent(eventType: string, context?: any): Promise<void> {
    const patterns: string[] = [];

    switch (eventType) {
      case 'speaker:added':
        patterns.push('participation:*', 'time_dist:*', 'avg_time:*');
        if (context?.sessionId) {
          patterns.push(`session:${context.sessionId}:*`);
        }
        break;
        
      case 'delegate:updated':
        patterns.push('demographic_*', 'participation:*');
        if (context?.delegateId) {
          patterns.push(`delegate:${context.delegateId}:*`);
        }
        break;
        
      case 'session:ended':
        if (context?.sessionId) {
          patterns.push(`session:${context.sessionId}:*`);
        }
        patterns.push('aggregated:*');
        break;
        
      case 'queue:updated':
        patterns.push('queue:*', 'realtime:*');
        break;
    }

    for (const pattern of patterns) {
      await this.invalidatePattern(pattern);
    }
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmupCache(sessionId?: string): Promise<void> {
    if (!this.pubClient) return;

    const warmupTasks = [
      { type: 'participationRates', params: { sessionId } },
      { type: 'timeDistributions', params: { sessionId } },
      { type: 'demographicSummaries', params: { sessionId } },
      { type: 'sessionMetrics', params: { sessionId } }
    ];

    for (const task of warmupTasks) {
      await this.pubClient.publish(
        this.WARMUP_CHANNEL,
        JSON.stringify(task)
      );
    }
  }

  /**
   * Get default TTL based on key pattern
   */
  private getDefaultTTL(key: string): number {
    if (key.includes('participation')) return this.ttlConfig.participationRates;
    if (key.includes('time_dist')) return this.ttlConfig.timeDistributions;
    if (key.includes('demographic')) return this.ttlConfig.demographicSummaries;
    if (key.includes('session') && key.includes('metrics')) return this.ttlConfig.sessionMetrics;
    if (key.includes('speaker') && key.includes('stats')) return this.ttlConfig.speakerStatistics;
    if (key.includes('aggregated')) return this.ttlConfig.aggregatedMetrics;
    if (key.includes('queue')) return this.ttlConfig.queueStatus;
    if (key.includes('realtime')) return this.ttlConfig.realtimeStats;
    
    return 300; // Default 5 minutes
  }

  /**
   * Update TTL configuration
   */
  updateTTLConfig(config: Partial<CacheTTLConfig>): void {
    this.ttlConfig = { ...this.ttlConfig, ...config };
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    if (!this.redis || !this.isConnected) return this.stats;

    try {
      // Get total keys
      const keys = await this.redis.keys('*');
      this.stats.totalKeys = keys.length;

      // Get memory usage
      const info = await this.redis.info('memory');
      const memMatch = info.match(/used_memory:(\d+)/);
      if (memMatch) {
        this.stats.memoryUsage = parseInt(memMatch[1]);
      }

      // Get evicted keys
      const statsInfo = await this.redis.info('stats');
      const evictedMatch = statsInfo.match(/evicted_keys:(\d+)/);
      if (evictedMatch) {
        this.stats.evictedKeys = parseInt(evictedMatch[1]);
      }

      return this.stats;
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return this.stats;
    }
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = (this.stats.hits / total) * 100;
    }
  }

  /**
   * Monitor cache performance
   */
  private startMonitoring(): void {
    // Update stats every minute
    setInterval(async () => {
      const stats = await this.getStats();
      this.emit('stats:updated', stats);

      // Alert if hit rate is too low
      if (stats.hitRate < 50 && (stats.hits + stats.misses) > 100) {
        this.emit('performance:warning', {
          message: 'Cache hit rate below 50%',
          hitRate: stats.hitRate
        });
      }

      // Alert if too many evictions
      if (stats.evictedKeys > 1000) {
        this.emit('performance:warning', {
          message: 'High number of evicted keys',
          evictedKeys: stats.evictedKeys
        });
      }
    }, 60000); // Every minute
  }

  /**
   * Optimize cache based on usage patterns
   */
  async optimizeCache(): Promise<void> {
    const stats = await this.getStats();

    // Adjust TTLs based on hit rate
    if (stats.hitRate < 60) {
      // Increase TTLs if hit rate is low
      this.ttlConfig = {
        participationRates: Math.min(this.ttlConfig.participationRates * 1.5, 900),
        timeDistributions: Math.min(this.ttlConfig.timeDistributions * 1.5, 300),
        demographicSummaries: Math.min(this.ttlConfig.demographicSummaries * 1.5, 1800),
        sessionMetrics: Math.min(this.ttlConfig.sessionMetrics * 1.5, 120),
        speakerStatistics: Math.min(this.ttlConfig.speakerStatistics * 1.5, 360),
        aggregatedMetrics: Math.min(this.ttlConfig.aggregatedMetrics * 1.5, 1800),
        queueStatus: this.ttlConfig.queueStatus, // Keep real-time data fresh
        realtimeStats: this.ttlConfig.realtimeStats // Keep real-time data fresh
      };
      
      console.log('Cache TTLs increased due to low hit rate');
    } else if (stats.hitRate > 90 && stats.evictedKeys < 100) {
      // Decrease TTLs if hit rate is very high and few evictions
      this.ttlConfig = {
        participationRates: Math.max(this.ttlConfig.participationRates * 0.8, 180),
        timeDistributions: Math.max(this.ttlConfig.timeDistributions * 0.8, 60),
        demographicSummaries: Math.max(this.ttlConfig.demographicSummaries * 0.8, 300),
        sessionMetrics: Math.max(this.ttlConfig.sessionMetrics * 0.8, 30),
        speakerStatistics: Math.max(this.ttlConfig.speakerStatistics * 0.8, 120),
        aggregatedMetrics: Math.max(this.ttlConfig.aggregatedMetrics * 0.8, 600),
        queueStatus: this.ttlConfig.queueStatus,
        realtimeStats: this.ttlConfig.realtimeStats
      };
      
      console.log('Cache TTLs decreased for fresher data');
    }

    this.emit('cache:optimized', { ttlConfig: this.ttlConfig, stats });
  }

  /**
   * Clear all cache
   */
  async clearAll(): Promise<void> {
    if (!this.redis || !this.isConnected) return;

    try {
      await this.redis.flushdb();
      this.stats = {
        hits: 0,
        misses: 0,
        hitRate: 0,
        totalKeys: 0,
        memoryUsage: 0,
        evictedKeys: 0
      };
      console.log('Cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Check if cache is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }
}

export default CacheService;