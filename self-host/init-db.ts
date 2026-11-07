import { readFile } from 'node:fs/promises';
import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before initializing the database.');
const schema = await readFile(new URL('../../self-host/schema.sql', import.meta.url), 'utf8');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(schema);
  process.stdout.write('Feedback database tables are ready. No existing rows were deleted.\n');
} finally {
  await pool.end();
}
