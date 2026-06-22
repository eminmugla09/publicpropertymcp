import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 30000,
  max: 20
});

async function checkOAuthCodes() {
  try {
    const result = await pool.query(
      'SELECT code, client_id, user_id, email, redirect_uri, expires_at, used FROM oauth_codes ORDER BY created_at DESC LIMIT 5'
    );
    
    console.log('Recent OAuth codes:');
    console.table(result.rows);
    
    const clientResult = await pool.query(
      'SELECT client_id, client_secret, client_name, redirect_uris FROM oauth_clients'
    );
    
    console.log('\nOAuth clients:');
    console.table(clientResult.rows);

  } catch (error) {
    console.error('Error checking OAuth codes:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkOAuthCodes();
