import { Request, Response } from 'express';
import { query, getClient } from '../database';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';

export class DelegateController {
  // Get all delegates with pagination and filtering
  async getAllDelegates(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      
      // Build filter conditions
      const filters: string[] = [];
      const params: any[] = [];
      let paramCount = 1;
      
      if (req.query.gender) {
        filters.push(`gender = $${paramCount}`);
        params.push(req.query.gender);
        paramCount++;
      }
      
      if (req.query.age_bracket) {
        filters.push(`age_bracket = $${paramCount}`);
        params.push(req.query.age_bracket);
        paramCount++;
      }
      
      if (req.query.race_category) {
        filters.push(`race_category = $${paramCount}`);
        params.push(req.query.race_category);
        paramCount++;
      }
      
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      
      // Get total count
      const countResult = await query(
        `SELECT COUNT(*) FROM delegates ${whereClause}`,
        params
      );
      const totalCount = parseInt(countResult.rows[0].count);
      
      // Get paginated results
      params.push(limit);
      params.push(offset);
      const result = await query(
        `SELECT * FROM delegates ${whereClause} 
         ORDER BY number ASC 
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
      console.error('Error fetching delegates:', error);
      res.status(500).json({ error: 'Failed to fetch delegates' });
    }
  }
  
  // Get delegate by ID
  async getDelegateById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const result = await query(
        'SELECT * FROM delegates WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Delegate not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching delegate:', error);
      res.status(500).json({ error: 'Failed to fetch delegate' });
    }
  }
  
  // Create new delegate
  async createDelegate(req: Request, res: Response) {
    try {
      const {
        number,
        name,
        location,
        gender,
        age_bracket,
        race_category,
        position_in_queue,
        has_spoken_count
      } = req.body;
      
      // Validate required fields
      if (!number || !name || !location || !gender || !age_bracket || !race_category) {
        return res.status(400).json({ 
          error: 'Missing required fields: number, name, location, gender, age_bracket, race_category' 
        });
      }
      
      const result = await query(
        `INSERT INTO delegates (
          number, name, location, gender, age_bracket, race_category,
          position_in_queue, has_spoken_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          number,
          name,
          location,
          gender,
          age_bracket,
          race_category,
          position_in_queue || null,
          has_spoken_count || 0
        ]
      );
      
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      console.error('Error creating delegate:', error);
      if (error.code === '23505') { // Unique constraint violation
        res.status(409).json({ error: 'Delegate with this number already exists' });
      } else {
        res.status(500).json({ error: 'Failed to create delegate' });
      }
    }
  }
  
  // Update delegate
  async updateDelegate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Build dynamic update query
      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;
      
      for (const [key, value] of Object.entries(updates)) {
        if (key !== 'id' && key !== 'created_at') {
          fields.push(`${key} = $${paramCount}`);
          values.push(value);
          paramCount++;
        }
      }
      
      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }
      
      values.push(id);
      const result = await query(
        `UPDATE delegates 
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${paramCount}
         RETURNING *`,
        values
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Delegate not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error updating delegate:', error);
      res.status(500).json({ error: 'Failed to update delegate' });
    }
  }
  
  // Delete delegate
  async deleteDelegate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const client = await getClient();
      try {
        await client.query('BEGIN');
        
        // Remove from queue if present
        await client.query(
          'DELETE FROM queue WHERE delegate_id = $1',
          [id]
        );
        
        // Delete delegate
        const result = await client.query(
          'DELETE FROM delegates WHERE id = $1 RETURNING *',
          [id]
        );
        
        if (result.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Delegate not found' });
        }
        
        await client.query('COMMIT');
        res.json({ message: 'Delegate deleted successfully', delegate: result.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error deleting delegate:', error);
      res.status(500).json({ error: 'Failed to delete delegate' });
    }
  }
  
  // Bulk import delegates from CSV
  async bulkImport(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      const csvContent = req.file.buffer.toString('utf-8');
      const records: any[] = [];
      const errors: any[] = [];
      let rowNumber = 0;
      
      // Parse CSV
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      
      parser.on('readable', function() {
        let record;
        while ((record = parser.read()) !== null) {
          rowNumber++;
          // Validate required fields
          if (!record.number || !record.name || !record.location || 
              !record.gender || !record.age_bracket || !record.race_category) {
            errors.push({
              row: rowNumber,
              error: 'Missing required fields',
              data: record
            });
          } else {
            records.push({
              number: parseInt(record.number),
              name: record.name,
              location: record.location,
              gender: record.gender,
              age_bracket: record.age_bracket,
              race_category: record.race_category,
              position_in_queue: record.position_in_queue ? parseInt(record.position_in_queue) : null,
              has_spoken_count: record.has_spoken_count ? parseInt(record.has_spoken_count) : 0
            });
          }
        }
      });
      
      parser.on('error', (err) => {
        console.error('CSV parsing error:', err);
        return res.status(400).json({ error: 'Invalid CSV format' });
      });
      
      parser.on('end', async () => {
        if (records.length === 0) {
          return res.status(400).json({ 
            error: 'No valid records found',
            errors 
          });
        }
        
        const client = await getClient();
        const inserted: any[] = [];
        const failed: any[] = [];
        
        try {
          await client.query('BEGIN');
          
          for (const record of records) {
            try {
              const result = await client.query(
                `INSERT INTO delegates (
                  number, name, location, gender, age_bracket, race_category,
                  position_in_queue, has_spoken_count
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (number) DO UPDATE SET
                  name = EXCLUDED.name,
                  location = EXCLUDED.location,
                  gender = EXCLUDED.gender,
                  age_bracket = EXCLUDED.age_bracket,
                  race_category = EXCLUDED.race_category,
                  position_in_queue = EXCLUDED.position_in_queue,
                  has_spoken_count = EXCLUDED.has_spoken_count,
                  updated_at = CURRENT_TIMESTAMP
                RETURNING *`,
                [
                  record.number,
                  record.name,
                  record.location,
                  record.gender,
                  record.age_bracket,
                  record.race_category,
                  record.position_in_queue,
                  record.has_spoken_count
                ]
              );
              inserted.push(result.rows[0]);
            } catch (err: any) {
              failed.push({
                record,
                error: err.message
              });
            }
          }
          
          await client.query('COMMIT');
          
          res.json({
            success: true,
            summary: {
              total: records.length,
              inserted: inserted.length,
              failed: failed.length,
              parseErrors: errors.length
            },
            inserted,
            failed,
            parseErrors: errors
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      });
      
      parser.write(csvContent);
      parser.end();
    } catch (error) {
      console.error('Error in bulk import:', error);
      res.status(500).json({ error: 'Failed to import delegates' });
    }
  }
  
  // Export delegates to CSV
  async exportDelegates(req: Request, res: Response) {
    try {
      const result = await query(
        'SELECT * FROM delegates ORDER BY number ASC'
      );
      
      const stringifier = stringify({
        header: true,
        columns: [
          'number',
          'name',
          'location',
          'gender',
          'age_bracket',
          'race_category',
          'position_in_queue',
          'has_spoken_count',
          'created_at',
          'updated_at'
        ]
      });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="delegates.csv"');
      
      stringifier.pipe(res);
      
      for (const row of result.rows) {
        stringifier.write(row);
      }
      
      stringifier.end();
    } catch (error) {
      console.error('Error exporting delegates:', error);
      res.status(500).json({ error: 'Failed to export delegates' });
    }
  }
}

export default new DelegateController();