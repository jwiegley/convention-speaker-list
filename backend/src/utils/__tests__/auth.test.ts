import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyToken,
  verifyRefreshToken,
  generateSecurePassword,
  extractTokenFromHeader,
  validatePasswordStrength,
  JWTPayload
} from '../auth';

describe('Auth Utilities', () => {
  describe('Password Hashing', () => {
    test('should hash a password successfully', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are typically 60 chars
    });

    test('should throw error for short passwords', async () => {
      const shortPassword = 'short';
      
      await expect(hashPassword(shortPassword)).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    test('should compare passwords correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      const isMatch = await comparePassword(password, hash);
      expect(isMatch).toBe(true);
      
      const isWrongMatch = await comparePassword('WrongPassword123!', hash);
      expect(isWrongMatch).toBe(false);
    });

    test('should return false for empty password comparison', async () => {
      const result = await comparePassword('', 'somehash');
      expect(result).toBe(false);
      
      const result2 = await comparePassword('password', '');
      expect(result2).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    const testPayload: JWTPayload = {
      userId: 'test-user-id',
      role: 'admin',
      sessionId: 'test-session-id'
    };

    test('should generate access token', () => {
      const token = generateAccessToken(testPayload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    test('should generate refresh token', () => {
      const token = generateRefreshToken(testPayload);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    test('should generate token pair', () => {
      const tokens = generateTokenPair(testPayload);
      
      expect(tokens).toBeDefined();
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });
  });

  describe('JWT Token Verification', () => {
    const testPayload: JWTPayload = {
      userId: 'test-user-id',
      role: 'spectator',
      sessionId: 'test-session-id'
    };

    test('should verify valid access token', () => {
      const token = generateAccessToken(testPayload);
      const decoded = verifyToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.role).toBe(testPayload.role);
      expect(decoded?.sessionId).toBe(testPayload.sessionId);
    });

    test('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = verifyToken(invalidToken);
      
      expect(decoded).toBeNull();
    });

    test('should verify valid refresh token', () => {
      const token = generateRefreshToken(testPayload);
      const decoded = verifyRefreshToken(token);
      
      expect(decoded).toBeDefined();
      expect(decoded?.userId).toBe(testPayload.userId);
      expect(decoded?.role).toBe(testPayload.role);
    });

    test('should reject access token as refresh token', () => {
      const accessToken = generateAccessToken(testPayload);
      const decoded = verifyRefreshToken(accessToken);
      
      expect(decoded).toBeNull();
    });
  });

  describe('Password Generation', () => {
    test('should generate secure password with default length', () => {
      const password = generateSecurePassword();
      
      expect(password).toBeDefined();
      expect(password.length).toBe(16);
      
      // Check for required character types
      expect(/[a-z]/.test(password)).toBe(true); // lowercase
      expect(/[A-Z]/.test(password)).toBe(true); // uppercase
      expect(/[0-9]/.test(password)).toBe(true); // number
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true); // special
    });

    test('should generate password with custom length', () => {
      const password = generateSecurePassword(24);
      
      expect(password.length).toBe(24);
    });
  });

  describe('Token Extraction', () => {
    test('should extract token from Bearer header', () => {
      const header = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const token = extractTokenFromHeader(header);
      
      expect(token).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });

    test('should return null for invalid header format', () => {
      expect(extractTokenFromHeader('InvalidHeader')).toBeNull();
      expect(extractTokenFromHeader('Basic auth')).toBeNull();
      expect(extractTokenFromHeader(undefined)).toBeNull();
      expect(extractTokenFromHeader('')).toBeNull();
    });
  });

  describe('Password Validation', () => {
    test('should validate strong password', () => {
      const result = validatePasswordStrength('StrongPass123!');
      
      expect(result.isValid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    test('should reject short password', () => {
      const result = validatePasswordStrength('Short1!');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('at least 8 characters');
    });

    test('should reject password without lowercase', () => {
      const result = validatePasswordStrength('UPPERCASE123!');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('lowercase letter');
    });

    test('should reject password without uppercase', () => {
      const result = validatePasswordStrength('lowercase123!');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('uppercase letter');
    });

    test('should reject password without number', () => {
      const result = validatePasswordStrength('NoNumbers!');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('number');
    });

    test('should reject password without special character', () => {
      const result = validatePasswordStrength('NoSpecial123');
      
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('special character');
    });
  });
});