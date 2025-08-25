import { Request, Response } from 'express';
import { query, getClient } from '../database';
import queueService from '../services/queueService';

export class QueueController {
  // Get current queue state
  async getQueue(req: Request, res: Response) {
    try {
      const { session_id } = req.query;
      
      if (!session_id) {
        // Get queue for active session
        const activeSession = await query(
          'SELECT id FROM sessions WHERE ended_at IS NULL LIMIT 1'
        );
        
        if (activeSession.rows.length === 0) {
          return res.status(404).json({ error: 'No active session found' });
        }
        
        req.query.session_id = activeSession.rows[0].id;
      }
      
      const result = await query(
        `SELECT q.*, d.name, d.number, d.location, d.gender, 
                d.age_bracket, d.race_category, d.has_spoken_count
         FROM queue q
         JOIN delegates d ON q.delegate_id = d.id
         WHERE q.session_id = $1
         ORDER BY 
           CASE 
             WHEN q.status = 'speaking' THEN 0
             WHEN q.status = 'waiting' THEN 1
             ELSE 2
           END,
           q.position ASC`,
        [req.query.session_id]
      );
      
      const queue = {
        speaking: result.rows.find(r => r.status === 'speaking') || null,
        waiting: result.rows.filter(r => r.status === 'waiting'),
        completed: result.rows.filter(r => r.status === 'completed')
      };
      
      res.json(queue);
    } catch (error) {
      console.error('Error fetching queue:', error);
      res.status(500).json({ error: 'Failed to fetch queue' });
    }
  }
  
  // Add delegate to queue
  async addToQueue(req: Request, res: Response) {
    try {
      const { delegate_number, session_id } = req.body;
      
      if (!delegate_number) {
        return res.status(400).json({ error: 'Delegate number is required' });
      }
      
      const client = await getClient();
      try {
        await client.query('BEGIN');
        
        // Get active session if not provided
        let activeSessionId = session_id;
        if (!activeSessionId) {
          const activeSession = await client.query(
            'SELECT id FROM sessions WHERE ended_at IS NULL LIMIT 1'
          );
          
          if (activeSession.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'No active session found' });
          }
          
          activeSessionId = activeSession.rows[0].id;
        }
        
        // Get delegate by number
        const delegate = await client.query(
          'SELECT id FROM delegates WHERE number = $1',
          [delegate_number]
        );
        
        if (delegate.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Delegate not found' });
        }
        
        const delegateId = delegate.rows[0].id;
        
        // Check if already in queue
        const existing = await client.query(
          `SELECT id FROM queue 
           WHERE delegate_id = $1 AND session_id = $2 AND status IN ('waiting', 'speaking')`,
          [delegateId, activeSessionId]
        );
        
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'Delegate already in queue' });
        }
        
        // Calculate position based on priority
        const position = await queueService.calculateQueuePosition(delegateId, activeSessionId);
        
        // Shift existing positions if needed
        await client.query(
          `UPDATE queue 
           SET position = position + 1 
           WHERE session_id = $1 AND position >= $2 AND status = 'waiting'`,
          [activeSessionId, position]
        );
        
        // Insert into queue
        const result = await client.query(
          `INSERT INTO queue (delegate_id, session_id, position, status, priority_override)
           VALUES ($1, $2, $3, 'waiting', $4)
           RETURNING *`,
          [delegateId, activeSessionId, position, req.body.priority_override || false]
        );
        
        await client.query('COMMIT');
        
        // Get full delegate info
        const fullInfo = await query(
          `SELECT q.*, d.name, d.number, d.location
           FROM queue q
           JOIN delegates d ON q.delegate_id = d.id
           WHERE q.id = $1`,
          [result.rows[0].id]
        );
        
        res.status(201).json(fullInfo.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error adding to queue:', error);
      res.status(500).json({ error: 'Failed to add to queue' });
    }
  }
  
  // Advance queue to next speaker
  async advanceQueue(req: Request, res: Response) {
    try {
      const { session_id } = req.body;
      
      // Get active session if not provided
      let activeSessionId = session_id;
      if (!activeSessionId) {
        const activeSession = await query(
          'SELECT id FROM sessions WHERE ended_at IS NULL LIMIT 1'
        );
        
        if (activeSession.rows.length === 0) {
          return res.status(404).json({ error: 'No active session found' });
        }
        
        activeSessionId = activeSession.rows[0].id;
      }
      
      const result = await queueService.advanceQueue(activeSessionId);
      res.json(result);
    } catch (error) {
      console.error('Error advancing queue:', error);
      res.status(500).json({ error: 'Failed to advance queue' });
    }
  }
  
  // Remove delegate from queue
  async removeFromQueue(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const client = await getClient();
      try {
        await client.query('BEGIN');
        
        // Get queue item
        const queueItem = await client.query(
          'SELECT * FROM queue WHERE id = $1',
          [id]
        );
        
        if (queueItem.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Queue item not found' });
        }
        
        const item = queueItem.rows[0];
        
        // Delete from queue
        await client.query('DELETE FROM queue WHERE id = $1', [id]);
        
        // Reorder remaining items if needed
        if (item.status === 'waiting') {
          await queueService.reorderQueue(item.session_id, item.position);
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Removed from queue successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error removing from queue:', error);
      res.status(500).json({ error: 'Failed to remove from queue' });
    }
  }
  
  // Reorder queue manually
  async reorderQueue(req: Request, res: Response) {
    try {
      const { queue_items } = req.body;
      
      if (!Array.isArray(queue_items)) {
        return res.status(400).json({ error: 'queue_items must be an array' });
      }
      
      const client = await getClient();
      try {
        await client.query('BEGIN');
        
        // Update positions for each item
        for (const item of queue_items) {
          await client.query(
            'UPDATE queue SET position = $1 WHERE id = $2',
            [item.position, item.id]
          );
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Queue reordered successfully' });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error reordering queue:', error);
      res.status(500).json({ error: 'Failed to reorder queue' });
    }
  }
}

export default new QueueController();