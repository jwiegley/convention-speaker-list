import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

class RedisService {
  private client: RedisClientType | null = null;
  private isConnected: boolean = false;
  private readonly DEFAULT_TTL = 3600; // 1 hour in seconds
  private readonly QUEUE_KEY_PREFIX = 'queue:';
  private readonly LOCK_KEY_PREFIX = 'lock:';
  
  constructor() {
    this.initializeClient();
  }
  
  private async initializeClient(): Promise<void> {
    try {
      this.client = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379',
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              logger.error('Redis: Max reconnection attempts reached');
              return new Error('Redis connection failed');
            }
            const delay = Math.min(retries * 100, 3000);
            logger.info(`Redis: Reconnecting... attempt ${retries}, delay ${delay}ms`);
            return delay;
          }
        }
      });
      
      // Set up event handlers
      this.client.on('error', (err) => {
        logger.error('Redis client error:', err);
        this.isConnected = false;
      });
      
      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });
      
      this.client.on('ready', () => {
        logger.info('Redis client ready');
      });
      
      this.client.on('end', () => {
        logger.info('Redis client connection closed');
        this.isConnected = false;
      });
      
      // Connect to Redis
      await this.client.connect();
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      // Continue without Redis - fallback to database only
    }
  }
  
  /**
   * Get Redis client instance
   */
  getClient(): RedisClientType | null {
    return this.client;
  }
  
  /**
   * Check if Redis is connected
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }
  
  /**
   * Cache queue state
   */
  async cacheQueueState(sessionId: string, queueState: any, ttl?: number): Promise<void> {
    if (!this.isReady()) {
      logger.debug('Redis not available, skipping cache');
      return;
    }
    
    try {
      const key = `${this.QUEUE_KEY_PREFIX}${sessionId}`;
      const data = JSON.stringify(queueState);
      const expiry = ttl || this.DEFAULT_TTL;
      
      await this.client!.setEx(key, expiry, data);
      logger.debug(`Cached queue state for session ${sessionId}`);
    } catch (error) {
      logger.error('Error caching queue state:', error);
    }
  }
  
  /**
   * Get cached queue state
   */
  async getCachedQueueState(sessionId: string): Promise<any | null> {
    if (!this.isReady()) {
      return null;
    }
    
    try {
      const key = `${this.QUEUE_KEY_PREFIX}${sessionId}`;
      const data = await this.client!.get(key);
      
      if (data) {
        logger.debug(`Cache hit for session ${sessionId}`);
        return JSON.parse(data);
      }
      
      logger.debug(`Cache miss for session ${sessionId}`);
      return null;
    } catch (error) {
      logger.error('Error getting cached queue state:', error);
      return null;
    }
  }
  
  /**
   * Invalidate cached queue state
   */
  async invalidateQueueCache(sessionId: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    
    try {
      const key = `${this.QUEUE_KEY_PREFIX}${sessionId}`;
      await this.client!.del(key);
      logger.debug(`Invalidated cache for session ${sessionId}`);
    } catch (error) {
      logger.error('Error invalidating queue cache:', error);
    }
  }
  
  /**
   * Acquire distributed lock for queue operations
   */
  async acquireLock(resource: string, ttl: number = 5000): Promise<string | null> {
    if (!this.isReady()) {
      return null;
    }
    
    const lockId = `${Date.now()}-${Math.random()}`;
    const key = `${this.LOCK_KEY_PREFIX}${resource}`;
    
    try {
      const result = await this.client!.set(key, lockId, {
        NX: true, // Only set if not exists
        PX: ttl   // Expire after ttl milliseconds
      });
      
      if (result === 'OK') {
        logger.debug(`Acquired lock for ${resource}`);
        return lockId;
      }
      
      return null;
    } catch (error) {
      logger.error('Error acquiring lock:', error);
      return null;
    }
  }
  
  /**
   * Release distributed lock
   */
  async releaseLock(resource: string, lockId: string): Promise<boolean> {
    if (!this.isReady()) {
      return false;
    }
    
    const key = `${this.LOCK_KEY_PREFIX}${resource}`;
    
    try {
      // Use Lua script to ensure atomic release
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      
      const result = await this.client!.eval(script, {
        keys: [key],
        arguments: [lockId]
      });
      
      if (result === 1) {
        logger.debug(`Released lock for ${resource}`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error releasing lock:', error);
      return false;
    }
  }
  
  /**
   * Batch cache multiple queue states
   */
  async batchCacheQueueStates(states: Map<string, any>, ttl?: number): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    
    try {
      const pipeline = this.client!.multi();
      const expiry = ttl || this.DEFAULT_TTL;
      
      for (const [sessionId, state] of states) {
        const key = `${this.QUEUE_KEY_PREFIX}${sessionId}`;
        const data = JSON.stringify(state);
        pipeline.setEx(key, expiry, data);
      }
      
      await pipeline.exec();
      logger.debug(`Batch cached ${states.size} queue states`);
    } catch (error) {
      logger.error('Error batch caching queue states:', error);
    }
  }
  
  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<any> {
    if (!this.isReady()) {
      return { available: false };
    }
    
    try {
      const info = await this.client!.info('stats');
      const keys = await this.client!.keys(`${this.QUEUE_KEY_PREFIX}*`);
      
      return {
        available: true,
        cachedQueues: keys.length,
        stats: info
      };
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return { available: false, error: error.message };
    }
  }
  
  /**
   * Warm cache on startup
   */
  async warmCache(sessionIds: string[], fetchFunction: (id: string) => Promise<any>): Promise<void> {
    if (!this.isReady()) {
      return;
    }
    
    logger.info(`Warming cache for ${sessionIds.length} sessions`);
    
    const states = new Map<string, any>();
    
    for (const sessionId of sessionIds) {
      try {
        const state = await fetchFunction(sessionId);
        if (state) {
          states.set(sessionId, state);
        }
      } catch (error) {
        logger.error(`Error fetching state for session ${sessionId}:`, error);
      }
    }
    
    if (states.size > 0) {
      await this.batchCacheQueueStates(states);
    }
    
    logger.info(`Cache warmed with ${states.size} sessions`);
  }
  
  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis connection closed');
    }
  }
}

// Create singleton instance
const redisService = new RedisService();

export default redisService;
export { redisService };