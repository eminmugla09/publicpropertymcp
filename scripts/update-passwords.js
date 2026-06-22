import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 1000,
  max: 1
});

async function updatePasswords() {
  try {
    const password = 'password123';
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1', [hash]);
    console.log('All user passwords updated to: password123');
  } catch (error) {
    console.error('Error updating passwords:', error);
    process.exit(1);
  } finally {
    try {
      await pool.end();
    } catch (err) {
      // ignore pool end errors
    }
    setTimeout(() => process.exit(0), 100);
  }
}

updatePasswords();
