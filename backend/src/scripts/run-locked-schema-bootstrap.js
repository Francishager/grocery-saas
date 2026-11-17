import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { withPostgresAdvisoryLock } from '../utils/postgresAdvisoryLock.js';
import { runSchemaGroup } from '../utils/runtimeSchemaBootstrap.js';

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
  'ensure-customer-wallet-schema.js',
  'ensure-customer-alternate-phone-schema.js',
  'ensure-user-theme-schema.js',
  'ensure-fractional-product-stock-schema.js',
  'ensure-inventory-line-unit-snapshots-schema.js',
  'ensure-advisor-daily-tip-content-schema.js',
  'ensure-salon-spa-schema.js',
  'ensure-tenant-memberships-schema.js',
  'ensure-tenant-contact-email-nonunique.js',
  'ensure-bar-feature.js',
  'ensure-clinic-pharmacy-schema.js',
  'ensure-business-messaging-schema.js',
  'ensure-jibu-network-schema.js',
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

await withPostgresAdvisoryLock({
  key: 73110402,
  wait: true,
  task: async ({ client }) => {
    console.log('Acquired exclusive runtime schema preparation lock.');
    const runGroup = (scripts, optional = false) => runSchemaGroup({
      client,
      scripts,
      optional,
      runScript,
      readScript: (script) => readFile(new URL(`./${script}`, import.meta.url)),
    });
    await runGroup(requiredScripts);
    await runGroup(optionalScripts, true);
  },
});
