import * as fs from 'fs';
import * as path from 'path';
import { config } from './index';

interface SSLOptions {
  key?: Buffer;
  cert?: Buffer;
  ca?: Buffer;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

interface HTTPSConfig {
  enabled: boolean;
  options?: SSLOptions;
  port: number;
  redirectHTTP: boolean;
}

/**
 * Get HTTPS configuration
 * In production, certificates should be mounted or provided via environment variables
 */
export function getHTTPSConfig(): HTTPSConfig {
  const httpsEnabled = process.env.HTTPS_ENABLED === 'true';
  const httpsPort = parseInt(process.env.HTTPS_PORT || '3443', 10);
  const redirectHTTP = process.env.REDIRECT_HTTP === 'true';

  if (!httpsEnabled) {
    return {
      enabled: false,
      port: httpsPort,
      redirectHTTP: false,
    };
  }

  // Certificate paths - can be configured via environment variables
  const certPath = process.env.SSL_CERT_PATH || path.join(process.cwd(), 'certs', 'server.crt');
  const keyPath = process.env.SSL_KEY_PATH || path.join(process.cwd(), 'certs', 'server.key');
  const caPath = process.env.SSL_CA_PATH || path.join(process.cwd(), 'certs', 'ca.crt');

  let sslOptions: SSLOptions | undefined;

  try {
    // Check if certificate files exist
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      sslOptions = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      };

      // Add CA certificate if it exists
      if (fs.existsSync(caPath)) {
        sslOptions.ca = fs.readFileSync(caPath);
      }

      // Additional SSL options for production
      if (config.env === 'production') {
        sslOptions.requestCert = false;
        sslOptions.rejectUnauthorized = true;
      }

      console.log('SSL certificates loaded successfully');
    } else {
      console.warn('SSL certificates not found. HTTPS will not be enabled.');
      return {
        enabled: false,
        port: httpsPort,
        redirectHTTP: false,
      };
    }
  } catch (error) {
    console.error('Error loading SSL certificates:', error);
    return {
      enabled: false,
      port: httpsPort,
      redirectHTTP: false,
    };
  }

  return {
    enabled: true,
    options: sslOptions,
    port: httpsPort,
    redirectHTTP,
  };
}

/**
 * Generate self-signed certificates for development
 * WARNING: Only use in development environment
 */
export async function generateSelfSignedCert(): Promise<void> {
  if (config.env === 'production') {
    throw new Error('Cannot generate self-signed certificates in production');
  }

  const { execSync } = await import('child_process');
  const certsDir = path.join(process.cwd(), 'certs');

  // Create certs directory if it doesn't exist
  if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
  }

  const certPath = path.join(certsDir, 'server.crt');
  const keyPath = path.join(certsDir, 'server.key');

  // Check if certificates already exist
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('Self-signed certificates already exist');
    return;
  }

  try {
    // Generate self-signed certificate using OpenSSL
    const command = `openssl req -x509 -newkey rsa:4096 -keyout ${keyPath} -out ${certPath} -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"`;

    execSync(command, { stdio: 'inherit' });

    console.log('Self-signed certificates generated successfully');
    console.log(`Certificate: ${certPath}`);
    console.log(`Private Key: ${keyPath}`);
  } catch (error) {
    console.error('Error generating self-signed certificates:', error);
    throw error;
  }
}

/**
 * Security headers configuration
 */
export const securityHeaders = {
  // Strict Transport Security
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Adjust for your needs
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },

  // Other security headers
  referrerPolicy: 'no-referrer',
  xContentTypeOptions: 'nosniff',
  xFrameOptions: 'DENY',
  xXssProtection: '1; mode=block',

  // Permissions Policy
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
      payment: ["'none'"],
    },
  },
};

/**
 * Certificate renewal reminder
 */
export function setupCertificateRenewalReminder(): void {
  if (config.env !== 'production') {
    return;
  }

  const certPath = process.env.SSL_CERT_PATH || path.join(process.cwd(), 'certs', 'server.crt');

  try {
    const certContent = fs.readFileSync(certPath, 'utf8');

    // Parse certificate expiration (basic implementation)
    // In production, use a proper certificate parser library
    const expirationMatch = certContent.match(/Not After\s*:\s*(.+)/);
    if (expirationMatch) {
      const expirationDate = new Date(expirationMatch[1]);
      const daysUntilExpiration = Math.floor(
        (expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      if (daysUntilExpiration < 30) {
        console.warn(
          `⚠️  SSL certificate expires in ${daysUntilExpiration} days. Please renew soon!`
        );
      } else {
        console.log(`SSL certificate valid for ${daysUntilExpiration} more days`);
      }

      // Set up daily check
      setInterval(
        () => {
          const now = Date.now();
          const remaining = Math.floor((expirationDate.getTime() - now) / (1000 * 60 * 60 * 24));
          if (remaining < 30) {
            console.warn(`⚠️  SSL certificate expires in ${remaining} days. Please renew!`);
          }
        },
        24 * 60 * 60 * 1000
      ); // Check daily
    }
  } catch (error) {
    console.error('Error checking certificate expiration:', error);
  }
}
