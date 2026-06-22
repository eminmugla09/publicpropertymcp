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

  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSchema();
