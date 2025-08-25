import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';

// Salt rounds for bcrypt hashing
const SALT_ROUNDS = 10;

// JWT token configuration
const JWT_SECRET = config.jwt.secret;
const JWT_EXPIRES_IN = '30m'; // 30 minutes
const REFRESH_TOKEN_EXPIRES_IN = '7d'; // 7 days

/**
 * Interface for JWT payload
 */
export interface JWTPayload {
  userId: string;
  role: 'admin' | 'spectator';
  sessionId?: string;
}

/**
 * Interface for token pair
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Hash a plaintext password using bcrypt
 * @param password - The plaintext password to hash
 * @returns Promise resolving to the hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }
  
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  return hashedPassword;
}

/**
 * Compare a plaintext password with a hashed password
 * @param password - The plaintext password to compare
 * @param hashedPassword - The hashed password to compare against
 * @returns Promise resolving to true if passwords match, false otherwise
 */
export async function comparePassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  if (!password || !hashedPassword) {
    return false;
  }
  
  const isMatch = await bcrypt.compare(password, hashedPassword);
  return isMatch;
}

/**
 * Generate a JWT access token
 * @param payload - The payload to include in the token
 * @returns The signed JWT token
 */
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'convention-speaker-list',
    audience: payload.role
  });
}

/**
 * Generate a JWT refresh token
 * @param payload - The payload to include in the token
 * @returns The signed JWT refresh token
 */
export function generateRefreshToken(payload: JWTPayload): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    JWT_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      issuer: 'convention-speaker-list',
      audience: payload.role
    }
  );
}

/**
 * Generate both access and refresh tokens
 * @param payload - The payload to include in the tokens
 * @returns Object containing both tokens
 */
export function generateTokenPair(payload: JWTPayload): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
}

/**
 * Verify and decode a JWT token
 * @param token - The JWT token to verify
 * @returns The decoded payload if valid, null otherwise
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'convention-speaker-list'
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Verify a refresh token specifically
 * @param refreshToken - The refresh token to verify
 * @returns The decoded payload if valid, null otherwise
 */
export function verifyRefreshToken(refreshToken: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET, {
      issuer: 'convention-speaker-list'
    }) as JWTPayload & { type?: string };
    
    // Ensure this is actually a refresh token
    if (decoded.type !== 'refresh') {
      return null;
    }
    
    // Remove the type field before returning
    const { type, ...payload } = decoded;
    return payload as JWTPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Generate a secure random password
 * @param length - The length of the password (default: 16)
 * @returns A randomly generated password
 */
export function generateSecurePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let password = '';
  
  // Ensure at least one of each type
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += charset[Math.floor(Math.random() * charset.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Extract token from Authorization header
 * @param authHeader - The Authorization header value
 * @returns The extracted token or null
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
}

/**
 * Validate password strength
 * @param password - The password to validate
 * @returns Object with validation result and message
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  message?: string;
} {
  if (!password || password.length < 8) {
    return {
      isValid: false,
      message: 'Password must be at least 8 characters long'
    };
  }
  
  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one lowercase letter'
    };
  }
  
  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one uppercase letter'
    };
  }
  
  if (!/[0-9]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one number'
    };
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    return {
      isValid: false,
      message: 'Password must contain at least one special character'
    };
  }
  
  return { isValid: true };
}