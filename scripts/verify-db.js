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

async function verifyDatabase() {
  try {
    // Check users
    const usersResult = await pool.query('SELECT email, full_name FROM users');
    console.log('Users in database:');
    console.table(usersResult.rows);

    // Check property records
    const propertiesResult = await pool.query(`
      SELECT owner_name, address, city, county, parcel_id, utility_provider 
      FROM property_records 
      ORDER BY recording_date DESC
    `);
    console.log('\nProperty records in database:');
    console.table(propertiesResult.rows);

    console.log('\nDatabase verification successful!');

  } catch (error) {
    console.error('Error verifying database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyDatabase();
