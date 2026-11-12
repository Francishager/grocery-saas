import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

test('clinic and pharmacy are routed as permission-checked sidebar subpages', () => {
  const app = readFileSync(sourceRoot + '/App.tsx', 'utf8');
  const sidebar = readFileSync(sourceRoot + '/components/layout/TenantLayout.tsx', 'utf8');
  for (const path of ['patients', 'appointments', 'encounters', 'prescriptions']) {
    assert.match(app, new RegExp(`clinic/${path}.*can(View|Create|Edit)Clinic`));
    assert.match(sidebar, new RegExp(`/tenant/clinic/${path}`));
  }
  for (const path of ['queue', 'catalogue', 'batches', 'history']) {
    assert.match(app, new RegExp(`pharmacy/${path}.*can(View|Manage|Dispense)Pharmacy`));
    assert.match(sidebar, new RegExp(`/tenant/pharmacy/${path}`));
  }
  assert.match(sidebar, /allFeatures:\s*\['clinic_management'\]/);
  assert.match(app, /<FeatureGuard feature="pharmacy_management"><FeatureGuard feature="clinic_management"/);
});

test('clinic and pharmacy pages load only the active subpage data, not every module dataset', () => {
  const clinic = readFileSync(sourceRoot + '/pages/ClinicManagementPage.tsx', 'utf8');
  const pharmacy = readFileSync(sourceRoot + '/pages/PharmacyManagementPage.tsx', 'utf8');
  assert.match(clinic, /sectionTabs\[section\]/);
  assert.doesNotMatch(clinic, /aria-label="Clinic sections"/);
  assert.match(clinic, /section === 'appointments'/);
  assert.match(clinic, /section === 'encounters'/);
  assert.match(clinic, /section === 'prescriptions'/);
  assert.match(pharmacy, /sectionTabs\[section\]/);
  assert.doesNotMatch(pharmacy, /aria-label="Pharmacy sections"/);
  assert.match(pharmacy, /section === 'queue'/);
  assert.match(pharmacy, /section === 'history'/);
  assert.match(pharmacy, /method: editingProductId \? 'PATCH' : 'POST'/);
  assert.match(pharmacy, /setInterval\(\(\) => \{ void refreshQueue\(\) \}, 60_000\)/);
  assert.match(pharmacy, /section !== 'queue'/);
});

test('clinic prescriptions support multiple medicines and row actions are permission-scoped menus', () => {
  const clinic = readFileSync(sourceRoot + '/pages/ClinicManagementPage.tsx', 'utf8');
  const pharmacy = readFileSync(sourceRoot + '/pages/PharmacyManagementPage.tsx', 'utf8');
  const salon = readFileSync(sourceRoot + '/pages/SalonStylistsPage.tsx', 'utf8');
  assert.match(clinic, /prescriptionForm\.items\.map\(\(item, index\)/);
  assert.match(clinic, /Add another medicine/);
  assert.match(clinic, /items: prescriptionForm\.items\.map/);
  assert.match(clinic, /<DropdownMenuItem onClick=\{\(\) => \{ setEditingPatientId/);
  assert.match(pharmacy, /<DropdownMenuItem onClick=\{\(\) => \{ setEditingProductId/);
  assert.match(salon, /<DropdownMenuItem onClick=\{\(\) => \{ setEditingId/);
  assert.match(salon, /Deactivate stylist/);
});

test('salon, bar, clinic, and pharmacy record actions use three-dot menus', () => {
  const service = readFileSync(sourceRoot + '/pages/ServiceBusinessPage.tsx', 'utf8');
  const salon = readFileSync(sourceRoot + '/pages/SalonPage.tsx', 'utf8');
  const salonTeam = readFileSync(sourceRoot + '/pages/SalonStylistsPage.tsx', 'utf8');
  const restaurant = readFileSync(sourceRoot + '/pages/RestaurantPage.tsx', 'utf8');
  const clinic = readFileSync(sourceRoot + '/pages/ClinicManagementPage.tsx', 'utf8');
  const pharmacy = readFileSync(sourceRoot + '/pages/PharmacyManagementPage.tsx', 'utf8');

  assert.match(service, /Appointment actions/);
  assert.match(salon, /Chair actions/);
  assert.match(salon, /commission.*DropdownMenu/s);
  assert.match(salonTeam, /Stylist actions/);
  assert.match(restaurant, /Order actions/);
  assert.match(restaurant, /Reservation actions/);
  assert.match(clinic, /Appointment actions/);
  assert.match(clinic, /Patient actions/);
  assert.match(pharmacy, /Medicine actions/);
  assert.match(pharmacy, /Prescription actions/);
  assert.match(pharmacy, /DropdownMenuItem disabled=\{saving\} onClick=\{\(\) => void dispense\(p\)\}>Save fulfillment/);
});
