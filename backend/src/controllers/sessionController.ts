import { Request, Response } from 'express';
import { query, getClient } from '../database';

export class SessionController {
  // Start a new session
  async startSession(req: Request, res: Response) {
    try {
      const { name, initial_garden_state } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Session name is required' });
      }
      
      const client = await getClient();
      try {
        await client.query('BEGIN');
        
        // Check for active sessions
        const activeCheck = await client.query(
          'SELECT id FROM sessions WHERE ended_at IS NULL'
        );
        
        if (activeCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ 
            error: 'Another session is already active. Please end it before starting a new one.' 
          });
        }
        
        // Create new session
        const result = await client.query(
          `INSERT INTO sessions (name, started_at, initial_garden_state) 
           VALUES ($1, CURRENT_TIMESTAMP, $2)
           RETURNING *`,
          [name, initial_garden_state || 'garden']
        );
        
        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error starting session:', error);
      res.status(500).json({ error: 'Failed to start session' });
    }
  }
  
  // End a session
  async endSession(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const result = await query(
        `UPDATE sessions 
         SET ended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND ended_at IS NULL
         RETURNING *`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ 
          error: 'Session not found or already ended' 
        });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error ending session:', error);
      res.status(500).json({ error: 'Failed to end session' });
    }
  }
  
  // Get current active session
  async getCurrentSession(req: Request, res: Response) {
    try {
      const result = await query(
        `SELECT s.*, 
         COUNT(DISTINCT si.id) as total_speakers,
         COUNT(DISTINCT CASE WHEN si.ended_at IS NOT NULL THEN si.id END) as completed_speakers
         FROM sessions s
         LEFT JOIN speaking_instances si ON si.session_id = s.id
         WHERE s.ended_at IS NULL
         GROUP BY s.id`
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'No active session found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching current session:', error);
      res.status(500).json({ error: 'Failed to fetch current session' });
    }
  }
  
  // Get all sessions with filtering
  async getAllSessions(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      
      // Build filter conditions
      const filters: string[] = [];
      const params: any[] = [];
      let paramCount = 1;
      
      if (req.query.start_date) {
        filters.push(`started_at >= $${paramCount}`);
        params.push(req.query.start_date);
        paramCount++;
      }
      
      if (req.query.end_date) {
        filters.push(`started_at <= $${paramCount}`);
        params.push(req.query.end_date);
        paramCount++;
      }
      
      if (req.query.status === 'active') {
        filters.push('ended_at IS NULL');
      } else if (req.query.status === 'completed') {
        filters.push('ended_at IS NOT NULL');
      }
      
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      
      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) FROM sessions ${whereClause}`,
        params
      );
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Get paginated results with statistics
      params.push(limit);
      params.push(offset);
      const result = await query(
        `SELECT s.*, 
         COUNT(DISTINCT si.id) as total_speakers,
         COUNT(DISTINCT CASE WHEN si.ended_at IS NOT NULL THEN si.id END) as completed_speakers,
         AVG(EXTRACT(EPOCH FROM (si.ended_at - si.started_at))) as avg_speaking_time_seconds
         FROM sessions s
         LEFT JOIN speaking_instances si ON si.session_id = s.id
         ${whereClause}
         GROUP BY s.id
         ORDER BY s.started_at DESC
         LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
        params
      );
      
      res.json({
        data: result.rows,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching sessions:', error);
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  }
  
  // Get session by ID with full details
  async getSessionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const sessionResult = await query(
        `SELECT s.*, 
         COUNT(DISTINCT si.id) as total_speakers,
         COUNT(DISTINCT CASE WHEN si.ended_at IS NOT NULL THEN si.id END) as completed_speakers,
         AVG(EXTRACT(EPOCH FROM (si.ended_at - si.started_at))) as avg_speaking_time_seconds
         FROM sessions s
         LEFT JOIN speaking_instances si ON si.session_id = s.id
         WHERE s.id = $1
         GROUP BY s.id`,
        [id]
      );
      
      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Get speaking instances for this session
      const speakersResult = await query(
        `SELECT si.*, d.name, d.number, d.location 
         FROM speaking_instances si
         JOIN delegates d ON si.delegate_id = d.id
         WHERE si.session_id = $1
         ORDER BY si.started_at`,
        [id]
      );
      
      res.json({
        ...sessionResult.rows[0],
        speakers: speakersResult.rows
      });
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({ error: 'Failed to fetch session' });
    }
  }
}

export default new SessionController();