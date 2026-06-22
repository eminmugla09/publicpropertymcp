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

async function addOAuthTables() {
  try {
    console.log('Adding OAuth tables...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_codes (
        code TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_challenge TEXT,
        code_challenge_method TEXT,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS client_id TEXT`);
    await pool.query(`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS code_challenge TEXT`);
    await pool.query(`ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS code_challenge_method TEXT`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        refresh_token TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        revoked BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS client_id TEXT`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id TEXT PRIMARY KEY,
        client_secret TEXT,
        client_name TEXT,
        redirect_uris JSONB NOT NULL,
        grant_types JSONB NOT NULL,
        response_types JSONB NOT NULL,
        token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('OAuth tables created successfully');

    // Ensure OAuth client exists
    const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'chatgpt-fpl-agent';
    const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET || '';
    
    console.log('Ensuring OAuth client exists...');
    const clientResult = await pool.query(
      'SELECT client_id FROM oauth_clients WHERE client_id = $1',
      [OAUTH_CLIENT_ID]
    );
    
    if (clientResult.rows.length === 0) {
      await pool.query(
        `INSERT INTO oauth_clients (client_id, client_secret, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          OAUTH_CLIENT_ID,
          OAUTH_CLIENT_SECRET || null,
          'Property Records MCP',
          JSON.stringify(['http://localhost:3000/callback', 'https://publicproperty.up.railway.app/callback']),
          JSON.stringify(['authorization_code']),
          JSON.stringify(['code']),
          OAUTH_CLIENT_SECRET ? 'client_secret_post' : 'none'
        ]
      );
      console.log('OAuth client created');
    } else {
      console.log('OAuth client already exists');
    }

  } catch (error) {
    console.error('Error adding OAuth tables:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addOAuthTables();
