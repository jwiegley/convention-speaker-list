import crypto from 'crypto';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Encryption Service
 * Provides AES-256-GCM encryption/decryption for sensitive data fields
 */
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private keyLength = 32; // 256 bits
  private ivLength = 16; // 128 bits
  private tagLength = 16; // 128 bits
  private saltLength = 64; // 512 bits
  private iterations = 100000;
  private encryptionKey: Buffer;

  constructor() {
    // Get encryption key from environment or generate one
    const masterKey = process.env.ENCRYPTION_MASTER_KEY || config.security?.encryptionKey;

    if (!masterKey) {
      logger.error('ENCRYPTION_MASTER_KEY not set in environment');
      throw new Error('Encryption key not configured');
    }

    // Derive encryption key from master key
    this.encryptionKey = this.deriveKey(masterKey);
  }

  /**
   * Derive encryption key from master key using PBKDF2
   */
  private deriveKey(masterKey: string): Buffer {
    const salt = Buffer.from(
      process.env.ENCRYPTION_SALT || 'convention-speaker-list-salt-2024',
      'utf8'
    );
    return crypto.pbkdf2Sync(masterKey, salt, this.iterations, this.keyLength, 'sha256');
  }

  /**
   * Encrypt a string value
   * Returns base64 encoded string containing: salt + iv + tag + encrypted data
   */
  public encrypt(plaintext: string | null | undefined): string | null {
    if (!plaintext) {
      return null;
    }

    try {
      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      ) as crypto.CipherGCM;

      // Encrypt the data
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

      // Get the authentication tag
      const tag = cipher.getAuthTag();

      // Combine iv + tag + encrypted data
      const combined = Buffer.concat([iv, tag, encrypted]);

      // Return base64 encoded
      return combined.toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt a string value
   * Expects base64 encoded string containing: iv + tag + encrypted data
   */
  public decrypt(encryptedData: string | null | undefined): string | null {
    if (!encryptedData) {
      return null;
    }

    try {
      // Decode from base64
      const combined = Buffer.from(encryptedData, 'base64');

      // Extract components
      const iv = combined.slice(0, this.ivLength);
      const tag = combined.slice(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = combined.slice(this.ivLength + this.tagLength);

      // Create decipher
      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      ) as crypto.DecipherGCM;
      decipher.setAuthTag(tag);

      // Decrypt the data
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt an object's specified fields
   */
  public encryptFields<T extends Record<string, any>>(obj: T, fields: readonly (keyof T)[]): T {
    const encrypted = { ...obj };

    for (const field of fields) {
      if (encrypted[field] !== null && encrypted[field] !== undefined) {
        encrypted[field] = this.encrypt(String(encrypted[field])) as any;
      }
    }

    return encrypted;
  }

  /**
   * Decrypt an object's specified fields
   */
  public decryptFields<T extends Record<string, any>>(obj: T, fields: readonly (keyof T)[]): T {
    const decrypted = { ...obj };

    for (const field of fields) {
      if (decrypted[field] !== null && decrypted[field] !== undefined) {
        decrypted[field] = this.decrypt(String(decrypted[field])) as any;
      }
    }

    return decrypted;
  }

  /**
   * Batch encrypt multiple values
   */
  public encryptBatch(values: (string | null | undefined)[]): (string | null)[] {
    return values.map((value) => this.encrypt(value));
  }

  /**
   * Batch decrypt multiple values
   */
  public decryptBatch(values: (string | null | undefined)[]): (string | null)[] {
    return values.map((value) => this.decrypt(value));
  }

  /**
   * Generate a new encryption key (for key rotation)
   */
  public static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Rotate encryption key - re-encrypt all data with new key
   * This would typically be called during maintenance
   */
  public async rotateKey(
    newMasterKey: string,
    reencryptCallback: (
      oldService: EncryptionService,
      newService: EncryptionService
    ) => Promise<void>
  ): Promise<void> {
    logger.info('Starting encryption key rotation...');

    // Create new service with new key
    const newService = new EncryptionService();
    newService.encryptionKey = newService.deriveKey(newMasterKey);

    // Call the callback to re-encrypt all data
    await reencryptCallback(this, newService);

    // Update this service to use the new key
    this.encryptionKey = newService.encryptionKey;

    logger.info('Encryption key rotation completed');
  }

  /**
   * Verify encryption is working correctly
   */
  public selfTest(): boolean {
    try {
      const testData = 'test-encryption-data-' + Date.now();
      const encrypted = this.encrypt(testData);
      const decrypted = this.decrypt(encrypted);

      if (decrypted !== testData) {
        logger.error('Encryption self-test failed: decrypted data does not match original');
        return false;
      }

      logger.info('Encryption self-test passed');
      return true;
    } catch (error) {
      logger.error('Encryption self-test failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export default new EncryptionService();

// Export fields that should be encrypted
export const ENCRYPTED_FIELDS = {
  delegates: ['location', 'personal_notes', 'email', 'phone'] as const,
  speaking_instances: ['notes'] as const,
  audit_logs: [] as const, // Audit logs should not be encrypted
};
