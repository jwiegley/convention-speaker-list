import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { config } from '../config';
import { authenticate, requireAdmin } from '../middleware/auth';
import { auditMiddleware } from '../services/AuditService';
import logger from '../utils/logger';

const router = Router();
const pool = new Pool({
  connectionString: config.database.url,
});

/**
 * GET /api/v1/recovery/checkpoints
 * List available recovery checkpoints
 */
router.get('/checkpoints', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
          id,
          checkpoint_type,
          created_at,
          created_by,
          description,
          data_hash,
          size_bytes
        FROM recovery_checkpoints
        ORDER BY created_at DESC
        LIMIT 50`
    );

    res.json({
      checkpoints: result.rows,
      count: result.rowCount,
    });
  } catch (error) {
    logger.error('Failed to fetch recovery checkpoints:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch recovery checkpoints',
    });
  }
});

/**
 * POST /api/v1/recovery/checkpoint
 * Create a new recovery checkpoint
 */
router.post(
  '/checkpoint',
  authenticate,
  requireAdmin,
  auditMiddleware('CREATE_CHECKPOINT', 'recovery'),
  async (req: Request, res: Response) => {
    try {
      const { description } = req.body;
      const userId = (req as any).user.userId;

      // Begin transaction
      await pool.query('BEGIN');

      // Create checkpoint record
      const checkpointResult = await pool.query(
        `INSERT INTO recovery_checkpoints 
        (checkpoint_type, created_by, description, data_hash, size_bytes)
        VALUES ('manual', $1, $2, '', 0)
        RETURNING id`,
        [userId, description || 'Manual checkpoint']
      );

      const checkpointId = checkpointResult.rows[0].id;

      // Snapshot current queue state
      await pool.query(
        `INSERT INTO queue_snapshots 
        (checkpoint_id, queue_data, delegates_data, settings_data)
        SELECT 
          $1,
          json_agg(q.*) FILTER (WHERE q.id IS NOT NULL),
          json_agg(d.*) FILTER (WHERE d.id IS NOT NULL),
          json_build_object('time_limit', MAX(s.time_limit), 'auto_advance', MAX(s.auto_advance))
        FROM queue q
        FULL OUTER JOIN delegates d ON true
        FULL OUTER JOIN settings s ON true`,
        [checkpointId]
      );

      // Calculate data hash and size
      const dataResult = await pool.query(
        `SELECT 
          pg_size_pretty(pg_column_size(queue_data) + pg_column_size(delegates_data) + pg_column_size(settings_data)) as size,
          md5(queue_data::text || delegates_data::text || settings_data::text) as hash
        FROM queue_snapshots
        WHERE checkpoint_id = $1`,
        [checkpointId]
      );

      // Update checkpoint with hash and size
      await pool.query(
        `UPDATE recovery_checkpoints 
        SET data_hash = $1, size_bytes = $2
        WHERE id = $3`,
        [dataResult.rows[0].hash, dataResult.rows[0].size, checkpointId]
      );

      await pool.query('COMMIT');

      logger.info(`Recovery checkpoint created: ${checkpointId}`);
      res.status(201).json({
        message: 'Recovery checkpoint created successfully',
        checkpointId,
        hash: dataResult.rows[0].hash,
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      logger.error('Failed to create recovery checkpoint:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create recovery checkpoint',
      });
    }
  }
);

/**
 * POST /api/v1/recovery/restore/:checkpointId
 * Restore from a specific checkpoint
 */
router.post(
  '/restore/:checkpointId',
  authenticate,
  requireAdmin,
  auditMiddleware('RESTORE_CHECKPOINT', 'recovery'),
  async (req: Request, res: Response) => {
    try {
      const { checkpointId } = req.params;
      const { createBackup = true } = req.body;

      // Verify checkpoint exists
      const checkpointResult = await pool.query(
        'SELECT * FROM recovery_checkpoints WHERE id = $1',
        [checkpointId]
      );

      if (checkpointResult.rows.length === 0) {
        res.status(404).json({
          error: 'Not found',
          message: 'Checkpoint not found',
        });
        return;
      }

      // Begin transaction
      await pool.query('BEGIN');

      // Create backup of current state if requested
      if (createBackup) {
        await pool.query(
          `INSERT INTO recovery_checkpoints 
          (checkpoint_type, created_by, description)
          VALUES ('pre_restore', $1, $2)`,
          [(req as any).user.userId, `Backup before restore from checkpoint ${checkpointId}`]
        );
      }

      // Get snapshot data
      const snapshotResult = await pool.query(
        'SELECT * FROM queue_snapshots WHERE checkpoint_id = $1',
        [checkpointId]
      );

      if (snapshotResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        res.status(404).json({
          error: 'Not found',
          message: 'Snapshot data not found for checkpoint',
        });
        return;
      }

      const snapshot = snapshotResult.rows[0];

      // Clear current data
      await pool.query('DELETE FROM queue');
      await pool.query('DELETE FROM delegates');
      await pool.query('DELETE FROM settings');

      // Restore queue data
      if (snapshot.queue_data) {
        for (const item of snapshot.queue_data) {
          await pool.query(
            `INSERT INTO queue (id, delegate_id, position, joined_at, speaking_time)
            VALUES ($1, $2, $3, $4, $5)`,
            [item.id, item.delegate_id, item.position, item.joined_at, item.speaking_time]
          );
        }
      }

      // Restore delegates data
      if (snapshot.delegates_data) {
        for (const delegate of snapshot.delegates_data) {
          await pool.query(
            `INSERT INTO delegates (id, name, country, organization, role, location, personal_notes, email, phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              delegate.id,
              delegate.name,
              delegate.country,
              delegate.organization,
              delegate.role,
              delegate.location,
              delegate.personal_notes,
              delegate.email,
              delegate.phone,
            ]
          );
        }
      }

      // Restore settings
      if (snapshot.settings_data) {
        await pool.query(
          `INSERT INTO settings (id, time_limit, auto_advance)
          VALUES (1, $1, $2)`,
          [snapshot.settings_data.time_limit, snapshot.settings_data.auto_advance]
        );
      }

      await pool.query('COMMIT');

      logger.info(`System restored from checkpoint: ${checkpointId}`);
      res.json({
        message: 'System restored successfully',
        checkpointId,
        restoredAt: new Date().toISOString(),
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      logger.error('Failed to restore from checkpoint:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to restore from checkpoint',
      });
    }
  }
);

/**
 * POST /api/v1/recovery/merge
 * Merge offline changes with current state
 */
router.post(
  '/merge',
  authenticate,
  auditMiddleware('MERGE_CHANGES', 'recovery'),
  async (req: Request, res: Response) => {
    try {
      const { changes, conflictResolution = 'server' } = req.body;

      if (!changes || !Array.isArray(changes)) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Changes array is required',
        });
        return;
      }

      const results = {
        applied: 0,
        conflicts: 0,
        errors: 0,
        details: [] as any[],
      };

      // Process each change
      for (const change of changes) {
        try {
          const result = await applyChange(change, conflictResolution);
          if (result.success) {
            results.applied++;
          } else if (result.conflict) {
            results.conflicts++;
          } else {
            results.errors++;
          }
          results.details.push(result);
        } catch (error) {
          results.errors++;
          results.details.push({
            changeId: change.id,
            success: false,
            error: (error as Error).message,
          });
        }
      }

      logger.info(
        `Merge completed: ${results.applied} applied, ${results.conflicts} conflicts, ${results.errors} errors`
      );
      res.json(results);
    } catch (error) {
      logger.error('Failed to merge changes:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to merge changes',
      });
    }
  }
);

/**
 * GET /api/v1/recovery/export
 * Export current system state
 */
router.get('/export', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    // Get all data
    const [queue, delegates, settings, speakingInstances] = await Promise.all([
      pool.query('SELECT * FROM queue ORDER BY position'),
      pool.query('SELECT * FROM delegates ORDER BY name'),
      pool.query('SELECT * FROM settings'),
      pool.query('SELECT * FROM speaking_instances ORDER BY started_at DESC LIMIT 100'),
    ]);

    const exportData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      exportedBy: (req as any).user.userId,
      data: {
        queue: queue.rows,
        delegates: delegates.rows,
        settings: settings.rows[0] || {},
        speakingInstances: speakingInstances.rows,
      },
      metadata: {
        queueCount: queue.rowCount,
        delegateCount: delegates.rowCount,
        instanceCount: speakingInstances.rowCount,
      },
    };

    // Set response headers for file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="speaker-list-export-${Date.now()}.json"`
    );

    res.json(exportData);
  } catch (error) {
    logger.error('Failed to export data:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to export data',
    });
  }
});

/**
 * POST /api/v1/recovery/import
 * Import system state from export
 */
router.post(
  '/import',
  authenticate,
  requireAdmin,
  auditMiddleware('IMPORT_DATA', 'recovery'),
  async (req: Request, res: Response) => {
    try {
      const { data, mergeMode = 'replace' } = req.body;

      if (!data || !data.data) {
        res.status(400).json({
          error: 'Bad request',
          message: 'Invalid import data format',
        });
        return;
      }

      // Begin transaction
      await pool.query('BEGIN');

      // Create backup checkpoint before import
      await pool.query(
        `INSERT INTO recovery_checkpoints 
        (checkpoint_type, created_by, description)
        VALUES ('pre_import', $1, $2)`,
        [(req as any).user.userId, 'Backup before data import']
      );

      if (mergeMode === 'replace') {
        // Clear existing data
        await pool.query('DELETE FROM speaking_instances');
        await pool.query('DELETE FROM queue');
        await pool.query('DELETE FROM delegates');
        await pool.query('DELETE FROM settings');
      }

      // Import delegates
      if (data.data.delegates) {
        for (const delegate of data.data.delegates) {
          await pool.query(
            `INSERT INTO delegates (id, name, country, organization, role, location, personal_notes, email, phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              country = EXCLUDED.country,
              organization = EXCLUDED.organization,
              role = EXCLUDED.role`,
            [
              delegate.id,
              delegate.name,
              delegate.country,
              delegate.organization,
              delegate.role,
              delegate.location,
              delegate.personal_notes,
              delegate.email,
              delegate.phone,
            ]
          );
        }
      }

      // Import queue
      if (data.data.queue) {
        for (const item of data.data.queue) {
          await pool.query(
            `INSERT INTO queue (id, delegate_id, position, joined_at, speaking_time)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET
              position = EXCLUDED.position,
              speaking_time = EXCLUDED.speaking_time`,
            [item.id, item.delegate_id, item.position, item.joined_at, item.speaking_time]
          );
        }
      }

      // Import settings
      if (data.data.settings) {
        await pool.query(
          `INSERT INTO settings (id, time_limit, auto_advance)
          VALUES (1, $1, $2)
          ON CONFLICT (id) DO UPDATE SET
            time_limit = EXCLUDED.time_limit,
            auto_advance = EXCLUDED.auto_advance`,
          [data.data.settings.time_limit, data.data.settings.auto_advance]
        );
      }

      await pool.query('COMMIT');

      logger.info('Data import completed successfully');
      res.json({
        message: 'Data imported successfully',
        imported: {
          delegates: data.data.delegates?.length || 0,
          queueItems: data.data.queue?.length || 0,
          settings: data.data.settings ? 1 : 0,
        },
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      logger.error('Failed to import data:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to import data',
      });
    }
  }
);

/**
 * Helper function to apply a single change
 */
async function applyChange(change: any, conflictResolution: string): Promise<any> {
  try {
    // Check for conflicts
    if (change.type === 'queue' && change.action === 'update') {
      const current = await pool.query('SELECT * FROM queue WHERE id = $1', [change.entityId]);

      if (current.rows.length > 0) {
        const currentData = current.rows[0];

        // Simple timestamp-based conflict detection
        if (currentData.updated_at > change.timestamp) {
          if (conflictResolution === 'client') {
            // Apply client change
            await pool.query('UPDATE queue SET position = $1, speaking_time = $2 WHERE id = $3', [
              change.data.position,
              change.data.speaking_time,
              change.entityId,
            ]);
            return { changeId: change.id, success: true, conflict: true, resolved: 'client' };
          } else {
            // Keep server version
            return { changeId: change.id, success: false, conflict: true, resolved: 'server' };
          }
        }
      }
    }

    // Apply change based on type and action
    // ... (implement specific change application logic)

    return { changeId: change.id, success: true };
  } catch (error) {
    return { changeId: change.id, success: false, error: (error as Error).message };
  }
}

export default router;
