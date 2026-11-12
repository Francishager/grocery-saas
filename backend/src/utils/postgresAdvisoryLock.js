function databaseUrl() {
  return process.env.DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.POSTGRES_PRISMA_URL
    || process.env.POSTGRES_URL;
}

export async function withPostgresAdvisoryLock({
  key,
  wait = false,
  task,
  createClient = async () => {
    const { Client } = await import('pg');
    return new Client({
      connectionString: databaseUrl(),
      connectionTimeoutMillis: 10000,
      application_name: 'jibusales-coordination',
    });
  },
}) {
  if (!databaseUrl()) throw new Error('A PostgreSQL connection URL is required for coordination.');
  if (!Number.isSafeInteger(key)) throw new TypeError('Advisory lock key must be a safe integer.');
  if (typeof task !== 'function') throw new TypeError('Advisory lock task must be a function.');

  const client = await createClient();
  let connected = false;
  let acquired = false;

  try {
    await client.connect();
    connected = true;
    if (wait) {
      await client.query('SELECT pg_advisory_lock($1::bigint)', [key]);
      acquired = true;
    } else {
      const result = await client.query('SELECT pg_try_advisory_lock($1::bigint) AS acquired', [key]);
      acquired = result.rows[0]?.acquired === true;
    }
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await task() };
  } finally {
    if (connected) {
      try {
        if (acquired) await client.query('SELECT pg_advisory_unlock($1::bigint)', [key]);
      } finally {
        await client.end();
      }
    }
  }
}
