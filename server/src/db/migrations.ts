import pg from 'pg';
import { fileURLToPath } from 'node:url';

// Register global pg parser for NUMERIC (OID 1700) to return JavaScript number
pg.types.setTypeParser(1700, (val: string) => parseFloat(val));

export interface Migration {
  name: string;
  up: (client: pg.PoolClient) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    name: '001_raw_points_numeric',
    up: async (client: pg.PoolClient) => {
      // Safely convert raw_points in aiocc_decisions from INT to NUMERIC(10, 2)
      // Preserves existing integer-valued scores exactly (e.g. 2 -> 2.00, -2 -> -2.00)
      // and allows fractional scores such as -0.50 without database rejection.
      await client.query(`
        ALTER TABLE aiocc_decisions 
        ALTER COLUMN raw_points TYPE NUMERIC(10, 2) 
        USING raw_points::NUMERIC(10, 2);
      `);
    }
  }
];

/**
 * Executes versioned, idempotent, transactional migrations with PostgreSQL advisory locking.
 * The transaction-level advisory lock guarantees that concurrent serverless cold starts
 * do not execute competing DDL operations simultaneously.
 */
export async function runMigrations(pool: pg.Pool): Promise<{ applied: string[]; alreadyApplied: string[] }> {
  const client = await pool.connect();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  try {
    await client.query('BEGIN');

    // PostgreSQL Transactional Advisory Lock (Key partition 74291845)
    await client.query('SELECT pg_advisory_xact_lock(74291845);');

    // Ensure migrations ledger exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS aiocc_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(128) UNIQUE NOT NULL,
        applied_at BIGINT NOT NULL
      );
    `);

    const existingRes = await client.query('SELECT migration_name FROM aiocc_migrations;');
    const appliedSet = new Set(existingRes.rows.map((r: any) => r.migration_name));

    for (const m of MIGRATIONS) {
      if (appliedSet.has(m.name)) {
        alreadyApplied.push(m.name);
      } else {
        await m.up(client);
        await client.query(
          'INSERT INTO aiocc_migrations (migration_name, applied_at) VALUES ($1, $2);',
          [m.name, Date.now()]
        );
        applied.push(m.name);
      }
    }

    await client.query('COMMIT');
    return { applied, alreadyApplied };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Standalone CLI runner execution
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dbUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/aiocc';
  console.log(`[MIGRATION RUNNER] Connecting to PostgreSQL at ${dbUrl.replace(/:[^:@]+@/, ':****@')}`);
  const pool = new pg.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });

  runMigrations(pool)
    .then((result) => {
      console.log('[MIGRATION RUNNER] Migration run complete.');
      console.log('  Applied:', result.applied);
      console.log('  Already applied:', result.alreadyApplied);
      return pool.end();
    })
    .catch((err) => {
      console.error('[MIGRATION RUNNER] Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}
