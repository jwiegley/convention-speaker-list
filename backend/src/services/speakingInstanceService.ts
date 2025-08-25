import { getClient } from '../database/client';
import {
  SpeakingInstance,
  CreateSpeakingInstanceDTO,
  UpdateSpeakingInstanceDTO,
  SessionSpeakingStats,
  DelegateSpeakingStats
} from '../types/speakingInstance';
import logger from '../utils/logger';

/**
 * Service for managing speaking instance records
 */
export class SpeakingInstanceService {
  /**
   * Create a new speaking instance when a delegate starts speaking
   */
  async createSpeakingInstance(data: CreateSpeakingInstanceDTO): Promise<SpeakingInstance> {
    const client = await getClient();
    try {
      const result = await client.query(
        `INSERT INTO speaking_instances 
         (delegate_id, session_id, queue_item_id, position_in_queue, is_tracked, start_time)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          data.delegate_id,
          data.session_id,
          data.queue_item_id || null,
          data.position_in_queue,
          data.is_tracked !== false
        ]
      );
      
      logger.info(`Created speaking instance for delegate ${data.delegate_id} in session ${data.session_id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating speaking instance:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Update a speaking instance when delegate stops speaking
   */
  async completeSpeakingInstance(
    delegateId: string,
    sessionId: string,
    status: 'completed' | 'interrupted' = 'completed'
  ): Promise<SpeakingInstance | null> {
    const client = await getClient();
    try {
      // Find the active speaking instance
      const activeInstance = await client.query(
        `SELECT * FROM speaking_instances 
         WHERE delegate_id = $1 AND session_id = $2 AND end_time IS NULL
         ORDER BY start_time DESC
         LIMIT 1`,
        [delegateId, sessionId]
      );
      
      if (activeInstance.rows.length === 0) {
        logger.warn(`No active speaking instance found for delegate ${delegateId} in session ${sessionId}`);
        return null;
      }
      
      // Update with end time (duration is calculated by trigger)
      const result = await client.query(
        `UPDATE speaking_instances 
         SET end_time = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [activeInstance.rows[0].id]
      );
      
      logger.info(`Completed speaking instance for delegate ${delegateId} in session ${sessionId} with status: ${status}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error completing speaking instance:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get active speaking instance for a session
   */
  async getActiveSpeakingInstance(sessionId: string): Promise<SpeakingInstance | null> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT * FROM speaking_instances 
         WHERE session_id = $1 AND end_time IS NULL
         ORDER BY start_time DESC
         LIMIT 1`,
        [sessionId]
      );
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting active speaking instance:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get speaking statistics for a session
   */
  async getSessionStats(sessionId: string): Promise<SessionSpeakingStats> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT 
           COUNT(DISTINCT delegate_id) as total_speakers,
           COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
           COALESCE(AVG(duration_seconds), 0) as average_duration_seconds,
           COALESCE(MAX(duration_seconds), 0) as longest_duration_seconds,
           COALESCE(MIN(duration_seconds), 0) as shortest_duration_seconds
         FROM speaking_instances 
         WHERE session_id = $1 AND duration_seconds IS NOT NULL`,
        [sessionId]
      );
      
      return {
        session_id: sessionId,
        total_speakers: parseInt(result.rows[0].total_speakers),
        total_duration_seconds: parseInt(result.rows[0].total_duration_seconds),
        average_duration_seconds: Math.round(parseFloat(result.rows[0].average_duration_seconds)),
        longest_duration_seconds: parseInt(result.rows[0].longest_duration_seconds),
        shortest_duration_seconds: parseInt(result.rows[0].shortest_duration_seconds)
      };
    } catch (error) {
      logger.error('Error getting session stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get speaking statistics for a delegate
   */
  async getDelegateStats(delegateId: string): Promise<DelegateSpeakingStats> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT 
           COUNT(*) as total_instances,
           COALESCE(SUM(duration_seconds), 0) as total_duration_seconds,
           COALESCE(AVG(duration_seconds), 0) as average_duration_seconds,
           COUNT(DISTINCT session_id) as sessions_participated
         FROM speaking_instances 
         WHERE delegate_id = $1 AND duration_seconds IS NOT NULL`,
        [delegateId]
      );
      
      return {
        delegate_id: delegateId,
        total_instances: parseInt(result.rows[0].total_instances),
        total_duration_seconds: parseInt(result.rows[0].total_duration_seconds),
        average_duration_seconds: Math.round(parseFloat(result.rows[0].average_duration_seconds)),
        sessions_participated: parseInt(result.rows[0].sessions_participated)
      };
    } catch (error) {
      logger.error('Error getting delegate stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get all speaking instances for a session
   */
  async getSessionSpeakingInstances(sessionId: string): Promise<SpeakingInstance[]> {
    const client = await getClient();
    try {
      const result = await client.query(
        `SELECT si.*, d.name as delegate_name, d.country as delegate_country
         FROM speaking_instances si
         JOIN delegates d ON si.delegate_id = d.id
         WHERE si.session_id = $1
         ORDER BY si.start_time DESC`,
        [sessionId]
      );
      
      return result.rows;
    } catch (error) {
      logger.error('Error getting session speaking instances:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
const speakingInstanceService = new SpeakingInstanceService();
export default speakingInstanceService;
export { speakingInstanceService };