import encryptionService, { ENCRYPTED_FIELDS } from '../services/EncryptionService';
import logger from '../utils/logger';

/**
 * Database Encryption Middleware
 * Provides transparent encryption/decryption for sensitive fields
 */

/**
 * Encrypt delegate data before saving to database
 */
export function encryptDelegateData(delegate: any): any {
  if (!delegate) return delegate;
  
  try {
    return encryptionService.encryptFields(delegate, ENCRYPTED_FIELDS.delegates);
  } catch (error) {
    logger.error('Failed to encrypt delegate data:', error);
    throw error;
  }
}

/**
 * Decrypt delegate data after reading from database
 */
export function decryptDelegateData(delegate: any): any {
  if (!delegate) return delegate;
  
  try {
    return encryptionService.decryptFields(delegate, ENCRYPTED_FIELDS.delegates);
  } catch (error) {
    logger.error('Failed to decrypt delegate data:', error);
    throw error;
  }
}

/**
 * Encrypt speaking instance data before saving to database
 */
export function encryptSpeakingInstanceData(instance: any): any {
  if (!instance) return instance;
  
  try {
    return encryptionService.encryptFields(instance, ENCRYPTED_FIELDS.speaking_instances);
  } catch (error) {
    logger.error('Failed to encrypt speaking instance data:', error);
    throw error;
  }
}

/**
 * Decrypt speaking instance data after reading from database
 */
export function decryptSpeakingInstanceData(instance: any): any {
  if (!instance) return instance;
  
  try {
    return encryptionService.decryptFields(instance, ENCRYPTED_FIELDS.speaking_instances);
  } catch (error) {
    logger.error('Failed to decrypt speaking instance data:', error);
    throw error;
  }
}

/**
 * Process query results to decrypt sensitive fields
 */
export function decryptQueryResults(rows: any[], tableName: string): any[] {
  if (!rows || rows.length === 0) return rows;
  
  switch (tableName) {
    case 'delegates':
      return rows.map(decryptDelegateData);
    case 'speaking_instances':
      return rows.map(decryptSpeakingInstanceData);
    default:
      return rows;
  }
}

/**
 * Process data before insert/update to encrypt sensitive fields
 */
export function encryptBeforeWrite(data: any, tableName: string): any {
  if (!data) return data;
  
  switch (tableName) {
    case 'delegates':
      return encryptDelegateData(data);
    case 'speaking_instances':
      return encryptSpeakingInstanceData(data);
    default:
      return data;
  }
}

/**
 * Middleware for database queries with automatic encryption/decryption
 */
export function createEncryptedQuery(pool: any) {
  return {
    /**
     * Execute a query with automatic decryption of results
     */
    async query(text: string, params?: any[]): Promise<any> {
      const result = await pool.query(text, params);
      
      // Determine table name from query
      const tableMatch = text.match(/FROM\s+(\w+)/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        result.rows = decryptQueryResults(result.rows, tableName);
      }
      
      return result;
    },
    
    /**
     * Insert with automatic encryption
     */
    async insert(tableName: string, data: any): Promise<any> {
      const encryptedData = encryptBeforeWrite(data, tableName);
      
      const columns = Object.keys(encryptedData);
      const values = columns.map((_, i) => `$${i + 1}`);
      const params = columns.map(col => encryptedData[col]);
      
      const query = `
        INSERT INTO ${tableName} (${columns.join(', ')})
        VALUES (${values.join(', ')})
        RETURNING *
      `;
      
      const result = await pool.query(query, params);
      result.rows = decryptQueryResults(result.rows, tableName);
      return result;
    },
    
    /**
     * Update with automatic encryption
     */
    async update(tableName: string, id: string | number, data: any): Promise<any> {
      const encryptedData = encryptBeforeWrite(data, tableName);
      
      const columns = Object.keys(encryptedData);
      const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
      const params = [id, ...columns.map(col => encryptedData[col])];
      
      const query = `
        UPDATE ${tableName}
        SET ${setClause}
        WHERE id = $1
        RETURNING *
      `;
      
      const result = await pool.query(query, params);
      result.rows = decryptQueryResults(result.rows, tableName);
      return result;
    }
  };
}

/**
 * Migration helper to encrypt existing unencrypted data
 */
export async function migrateUnencryptedData(pool: any): Promise<void> {
  logger.info('Starting migration of unencrypted data...');
  
  try {
    // Migrate delegates
    const delegates = await pool.query('SELECT * FROM delegates');
    for (const delegate of delegates.rows) {
      const encrypted = encryptDelegateData(delegate);
      await pool.query(
        `UPDATE delegates 
         SET location = $1, personal_notes = $2, email = $3, phone = $4
         WHERE id = $5`,
        [encrypted.location, encrypted.personal_notes, encrypted.email, encrypted.phone, delegate.id]
      );
    }
    logger.info(`Encrypted ${delegates.rows.length} delegate records`);
    
    // Migrate speaking instances
    const instances = await pool.query('SELECT * FROM speaking_instances');
    for (const instance of instances.rows) {
      const encrypted = encryptSpeakingInstanceData(instance);
      await pool.query(
        `UPDATE speaking_instances 
         SET notes = $1
         WHERE id = $2`,
        [encrypted.notes, instance.id]
      );
    }
    logger.info(`Encrypted ${instances.rows.length} speaking instance records`);
    
    logger.info('Migration of unencrypted data completed');
  } catch (error) {
    logger.error('Failed to migrate unencrypted data:', error);
    throw error;
  }
}

export default {
  encryptDelegateData,
  decryptDelegateData,
  encryptSpeakingInstanceData,
  decryptSpeakingInstanceData,
  decryptQueryResults,
  encryptBeforeWrite,
  createEncryptedQuery,
  migrateUnencryptedData
};