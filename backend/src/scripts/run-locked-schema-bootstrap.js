import { spawn } from 'node:child_process';
import { withPostgresAdvisoryLock } from '../utils/postgresAdvisoryLock.js';

const requiredScripts = [
  'ensure-user-security-schema.js',
  'ensure-sale-tax-schema.js',
  'ensure-branch-attendance-schema.js',
  'ensure-trash-schema.js',
  'ensure-property-management-feature.js',
  'ensure-property-tenancy-alternate-phone-schema.js',
  'ensure-property-rent-rate-history-schema.js',
  'ensure-property-rent-promises-schema.js',
  'ensure-property-tenant-notes-schema.js',
  'ensure-payment-permissions-and-rent-mobile-schema.js',
  'ensure-customer-credit-applications-schema.js',
  'ensure-customer-alternate-phone-schema.js',
  'ensure-user-theme-schema.js',
  'ensure-fractional-product-stock-schema.js',
  'ensure-salon-spa-schema.js',
  'ensure-tenant-memberships-schema.js',
  'ensure-tenant-contact-email-nonunique.js',
  'ensure-bar-feature.js',
  'ensure-clinic-pharmacy-schema.js',
];

const optionalScripts = [
  'ensure-rental-runtime-schema.js',
  'ensure-rental-mixed-booking-schema.js',
  'ensure-rental-historical-entry-schema.js',
  'ensure-rental-credit-notes-schema.js',
  'ensure-rental-credit-note-permissions-schema.js',
  'ensure-rental-cancellation-schema.js',
];

function runScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`src/scripts/${script}`], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolve();
      const error = new Error(`${script} exited with ${signal ? `signal ${signal}` : `status ${code}`}`);
      error.exitCode = code || 1;
      reject(error);
    });
  });
}

async function runGroup(scripts, { optional = false } = {}) {
  for (const script of scripts) {
    try {
      console.log(`=== Preparing schema: ${script} ===`);
      await runScript(script);
      console.log(`=== Schema ready: ${script} ===`);
    } catch (error) {
      if (!optional) throw error;
      console.warn(`WARNING: optional schema step ${script} failed; continuing: ${error.message}`);
    }
  }
}

await withPostgresAdvisoryLock({
  key: 73110402,
  wait: true,
  task: async () => {
    console.log('Acquired exclusive runtime schema preparation lock.');
    await runGroup(requiredScripts);
    await runGroup(optionalScripts, { optional: true });
  },
});
