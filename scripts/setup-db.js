import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runSchema() {
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running schema.sql...');
    await pool.query(schema);
    console.log('Schema created successfully');

    const seedPath = path.join(__dirname, '..', 'seed-data.sql');
    const seed = fs.readFileSync(seedPath, 'utf8');

    console.log('Running seed-data.sql...');
    await pool.query(seed);
    console.log('Seed data inserted successfully');

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
    console.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSchema();
