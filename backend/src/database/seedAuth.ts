import { Pool } from 'pg';
import { config } from '../config';
import { hashPassword, generateSecurePassword } from '../utils/auth';

const pool = new Pool({
  connectionString: config.database.url,
});

/**
 * Seeds initial authentication data
 */
async function seedAuth() {
  console.log('Seeding authentication data...');

  try {
    // Check if users already exist
    const existingUsers = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(existingUsers.rows[0].count) > 0) {
      console.log('Users already exist, skipping auth seed');
      return;
    }

    // Generate secure passwords
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || generateSecurePassword();
    const spectatorPassword = process.env.INITIAL_SPECTATOR_PASSWORD || generateSecurePassword();

    // Hash passwords
    const adminHash = await hashPassword(adminPassword);
    const spectatorHash = await hashPassword(spectatorPassword);

    // Insert admin user
    const adminResult = await pool.query(
      `INSERT INTO users (username, password_hash, role) 
       VALUES ($1, $2, $3) 
       RETURNING id, username, role`,
      ['admin', adminHash, 'admin']
    );

    // Insert spectator user
    const spectatorResult = await pool.query(
      `INSERT INTO users (username, password_hash, role) 
       VALUES ($1, $2, $3) 
       RETURNING id, username, role`,
      ['spectator', spectatorHash, 'spectator']
    );

    console.log('Authentication data seeded successfully!');
    console.log('\n==========================================');
    console.log('IMPORTANT: Save these credentials securely');
    console.log('==========================================');
    console.log(`Admin User:`);
    console.log(`  Username: ${adminResult.rows[0].username}`);
    console.log(`  Password: ${adminPassword}`);
    console.log(`\nSpectator User:`);
    console.log(`  Username: ${spectatorResult.rows[0].username}`);
    console.log(`  Password: ${spectatorPassword}`);
    console.log('==========================================\n');

    // If not using environment variables, write to a secure file
    if (!process.env.INITIAL_ADMIN_PASSWORD) {
      const fs = await import('fs');
      const path = await import('path');

      const credentialsPath = path.join(process.cwd(), '..', '.credentials');
      const credentials = {
        admin: {
          username: 'admin',
          password: adminPassword,
        },
        spectator: {
          username: 'spectator',
          password: spectatorPassword,
        },
        created_at: new Date().toISOString(),
        warning: 'DELETE THIS FILE AFTER SAVING CREDENTIALS SECURELY',
      };

      fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
      console.log(`Credentials saved to ${credentialsPath}`);
      console.log('WARNING: Delete .credentials file after saving passwords securely!');
    }
  } catch (error) {
    console.error('Error seeding authentication data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  seedAuth()
    .then(() => {
      console.log('Auth seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Auth seed failed:', error);
      process.exit(1);
    });
}

export default seedAuth;
