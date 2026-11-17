import { createHash } from 'node:crypto';

const BOOTSTRAP_TABLE = 'jibusales_runtime_schema_steps';

export async function runSchemaGroup({
  client,
  scripts,
  runScript,
  readScript,
  optional = false,
  logger = console,
  deploymentId = process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_GIT_COMMIT_SHA || null,
}) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${BOOTSTRAP_TABLE} (
      script text PRIMARY KEY,
      checksum text NOT NULL,
      status text NOT NULL DEFAULT 'succeeded',
      deployment_id text,
      completed_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query(`ALTER TABLE ${BOOTSTRAP_TABLE} ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'succeeded'`);
  await client.query(`ALTER TABLE ${BOOTSTRAP_TABLE} ADD COLUMN IF NOT EXISTS deployment_id text`);

  for (const script of scripts) {
    const checksum = createHash('sha256').update(await readScript(script)).digest('hex');
    const existing = await client.query(
      `SELECT checksum, status, deployment_id FROM ${BOOTSTRAP_TABLE} WHERE script = $1`,
      [script],
    );
    const previous = existing.rows[0];
    const completed = previous?.checksum === checksum && previous.status === 'succeeded';
    const alreadyFailedThisDeployment = optional
      && deploymentId
      && previous?.checksum === checksum
      && previous.status === 'failed'
      && previous.deployment_id === deploymentId;
    if (completed || alreadyFailedThisDeployment) {
      logger.log(`=== Schema already ready: ${script} ===`);
      continue;
    }

    try {
      logger.log(`=== Preparing schema: ${script} ===`);
      await runScript(script);
      await client.query(`
        INSERT INTO ${BOOTSTRAP_TABLE} (script, checksum, status, deployment_id, completed_at)
        VALUES ($1, $2, 'succeeded', $3, now())
        ON CONFLICT (script) DO UPDATE
        SET checksum = EXCLUDED.checksum, status = EXCLUDED.status,
            deployment_id = EXCLUDED.deployment_id, completed_at = EXCLUDED.completed_at
      `, [script, checksum, deploymentId]);
      logger.log(`=== Schema ready: ${script} ===`);
    } catch (error) {
      if (!optional) throw error;
      if (deploymentId) {
        await client.query(`
          INSERT INTO ${BOOTSTRAP_TABLE} (script, checksum, status, deployment_id, completed_at)
          VALUES ($1, $2, 'failed', $3, now())
          ON CONFLICT (script) DO UPDATE
          SET checksum = EXCLUDED.checksum, status = EXCLUDED.status,
              deployment_id = EXCLUDED.deployment_id, completed_at = EXCLUDED.completed_at
        `, [script, checksum, deploymentId]);
      }
      logger.warn(`WARNING: optional schema step ${script} failed; continuing: ${error.message}`);
    }
  }
}
