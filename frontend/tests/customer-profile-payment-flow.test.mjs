import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const profilePage = source('../src/pages/receivables/CustomerProfilePage.tsx');
const paymentDialog = source('../src/components/customer/CustomerPaymentDialog.tsx');
const receivablesPage = source('../src/pages/receivables/ReceivablesPage.tsx');
const historyDialog = source('../src/components/customer/CustomerTransactionHistoryDialog.tsx');
const transactionReceipt = source('../src/lib/transactionReceipt.ts');
const transactionReceiptButton = source('../src/components/TransactionReceiptButton.tsx');
const receiptViewer = source('../src/components/ReceiptViewer.tsx');
const receiptPdf = source('../src/lib/receiptPdf.ts');
const thermalPrinter = source('../src/lib/thermalPrinter.ts');
const createCustomerModal = source('../src/components/modals/CreateCustomerModal.tsx');
const saasFeatures = source('../src/pages/SaaSAdmin/FeaturesPage.tsx');
const saasPlans = source('../src/pages/SaaSAdmin/PlansPage.tsx');
const receiptSettings = source('../src/pages/ReceiptSettingsPage.tsx');
const browserReceiptPrint = source('../src/lib/receiptPrint.ts');
const backendReceivables = source('../../backend/routes/receivables.js');
const backendReceipts = source('../../backend/src/routes/receipts.js');
const mobileApp = source('../../mobile/src/app/index.tsx');

test('record payment opens over the profile without navigating to the receivables table', () => {
  assert.match(profilePage, /onRecordPayment=\{\(customer\) => setPaymentCustomer\(customer\)\}/);
  assert.match(profilePage, /<CustomerPaymentDialog/);
  assert.doesNotMatch(profilePage, /onRecordPayment=\{\(customer\) => navigate\('\/tenant\/receivables\/customers'/);
});

test('profile payment posts through the permission-checked receivables endpoint with branch and idempotency', () => {
  assert.match(paymentDialog, /apiFetch\('\/api\/receivables\/payments'/);
  assert.match(paymentDialog, /branchId: customer\.branchId/);
  assert.match(paymentDialog, /'Idempotency-Key': idempotencyKey/);
  assert.match(paymentDialog, /canUseOwnCashAccount|canUseSafeAccount|canUseBankAccount/);
});

test('payment-method and account selectors cannot dismiss the payment dialog through their portals', () => {
  assert.match(paymentDialog, /onInteractOutside=\{\(event\) => \{/);
  assert.match(paymentDialog, /event\.preventDefault\(\)/);
  assert.match(paymentDialog, /className="z-\[110\]/);
  assert.doesNotMatch(paymentDialog, /onEscapeKeyDown=\{\(event\) => event\.preventDefault\(\)\}/);
});

test('mobile-money payments require and submit provider, phone, and transaction reference', () => {
  assert.match(paymentDialog, /mobileProvider: method === 'mobile_money' \? mobileProvider/);
  assert.match(paymentDialog, /phoneNumber: method === 'mobile_money' \? phoneNumber/);
  assert.match(paymentDialog, /transactionId: \['mobile_money', 'card'\]\.includes\(method\)/);
  assert.match(paymentDialog, /provider, phone number, and transaction ID/);
});

test('receivables payment modal scrolls on mobile and saves the entered note', () => {
  assert.match(receivablesPage, /max-h-\[calc\(100dvh-1rem\)\].*overflow-y-auto.*overscroll-contain/);
  assert.match(receivablesPage, /<Textarea[\s\S]*?id="customerPaymentNotes"[\s\S]*?value=\{paymentNotes\}/);
  assert.match(receivablesPage, /notes: paymentNotes\.trim\(\) \|\| 'Payment recorded via dashboard'/);
});

test('customer-profile payment dialog stays above its overlay and records an optional note', () => {
  assert.match(paymentDialog, /className="z-\[110\]/);
  assert.match(paymentDialog, /<Textarea id="profilePaymentNotes"[\s\S]*?value=\{notes\}/);
  assert.match(paymentDialog, /notes: notes\.trim\(\) \|\| 'Payment recorded from customer profile'/);
});

test('customer payment notes flow into profile receipt and reprint details', () => {
  assert.match(historyDialog, /notes\?: string \| null/);
  assert.match(historyDialog, /isPayment && row\.notes \? \[\{ label: 'Note', value: row\.notes \}\]/);
});

test('customer receipts include payment method and any mobile-money details', () => {
  for (const detail of ['Payment method', 'Mobile money provider', 'Mobile money number', 'Transaction ID']) {
    assert.ok(historyDialog.includes(`label: '${detail}'`));
    assert.ok(receivablesPage.includes(`label: '${detail}'`));
  }
  assert.match(historyDialog, /isPayment && row\.mobileProvider/);
  assert.match(historyDialog, /isPayment && row\.phoneNumber/);
});

test('renter profile receipts include mobile-money provider, number, and transaction reference', () => {
  assert.match(historyDialog, /mobileProvider\?: string \| null; phoneNumber\?: string \| null/);
  assert.match(historyDialog, /label: 'Mobile money provider', value: row\.mobileProvider/);
  assert.match(historyDialog, /label: 'Mobile money number', value: row\.phoneNumber/);
});

test('customer and renter reprints use the shared browser receipt print window', () => {
  assert.match(transactionReceiptButton, /<ReceiptViewer receiptNo=\{data\.reference\} transactionData=\{data\} triggerLabel=\{label\} previewOnTrigger/);
  assert.match(receiptViewer, /printReceiptInBrowser\(loadReceiptForPrint, receiptNo\)/);
  assert.match(receiptViewer, /Browser Print \/ Save as PDF/);
});

test('customer and renter reprints open an in-app preview with close, browser print, and direct PDF actions', () => {
  assert.match(receiptViewer, /aria-label="Close receipt"/);
  assert.match(receiptViewer, /const result = await downloadReceiptPreviewPdf\(await loadReceiptForPrint\(\), receiptNo\)/);
  assert.doesNotMatch(receiptViewer, /link\.href = pdfUrl/);
  assert.match(receiptViewer, /type="button"[^>]*onClick=\{event => \{ event\.preventDefault\(\); event\.stopPropagation\(\); void handleDownloadPdf\(\) \}\}/);
  assert.match(receiptPdf, /pdf\.output\('blob'\)/);
  assert.match(receiptPdf, /window\.JibuNativeFile\?\.savePdf/);
  assert.match(receiptPdf, /window\.ReactNativeWebView/);
  assert.match(receiptPdf, /if \(!result\?\.saved\) throw new Error/);
  assert.match(receiptPdf, /link\.download = filename/);
  assert.match(receiptPdf, /receipt\.business\.receiptFooter\?\.trim\(\) \|\| 'Thank you for your purchase!'/);
  assert.match(mobileApp, /Directory\.pickDirectoryAsync\(\)/);
  assert.match(mobileApp, /directory\.createFile\(filename, 'application\/pdf'\)/);
  assert.doesNotMatch(mobileApp, /file\.create\(\{ overwrite: true \}\)/);
  assert.match(mobileApp, /file\.write\(request\.base64, \{ encoding: 'base64' \}\)/);
  assert.match(mobileApp, /if \(!fileInfo\.exists \|\| !fileInfo\.size\)/);
  assert.match(mobileApp, /injectedJavaScriptBeforeContentLoaded=\{NATIVE_BRIDGE_SCRIPT\}/);
  assert.match(mobileApp, /injectedJavaScript=\{NATIVE_BRIDGE_SCRIPT\}/);
  assert.match(mobileApp, /webView\.current\?\.injectJavaScript\(NATIVE_BRIDGE_SCRIPT\)/);
  assert.match(mobileApp, /nativeEvent\.url && getOrigin\(nativeEvent\.url\) !== BRIDGE_ORIGIN/);
  assert.match(receiptViewer, /handleNativePrinterChoice/);
  assert.match(receiptViewer, /previewOnTrigger \? \(\) => setShowPreview\(true\)/);
  assert.match(thermalPrinter, /export function buildEscPosReceiptCommands\(receipt: ReceiptPreview\)/);
});

test('customer credit limits are feature-gated and use separate create/edit permissions', () => {
  assert.match(createCustomerModal, /hasPermission\('canCreateCustomerCreditLimit'\)/);
  assert.match(createCustomerModal, /hasPermission\('canEditCustomerCreditLimit'\)/);
  assert.match(createCustomerModal, /Credit limit <span aria-hidden="true">\*<\/span>/);
  assert.match(createCustomerModal, /md:grid-cols-2/);
  assert.match(receivablesPage, /hasPermission\('canEditCustomerCreditLimit'\)/);
  assert.match(backendReceivables, /requirePermission\('canEditCustomerCreditLimit'\)/);
  assert.match(saasFeatures, /customers\.credit_limits/);
  assert.match(saasPlans, /customers\.credit_limits/);
  assert.match(backendReceivables, /hasFeatureAccess\(features, 'customers\.credit_limits'\)/);
});

test('property-management businesses do not get the trade customer-create action in receivables', () => {
  assert.match(receivablesPage, /propertyManagementBusiness = hasFeature\('property_management\.landlord'\) \|\| hasFeature\('property_management\.agent'\)/);
  assert.match(receivablesPage, /tab === 'customers' && !propertyManagementBusiness/);
});

test('customer tenancy agreements require property-management access, not the separate rentals feature', () => {
  assert.match(historyDialog, /const canLoadRentalProfile = propertyManagementEnabled && hasPermission\('canViewPropertyStatements'\)/);
  assert.match(historyDialog, /const canViewTenancyAgreements = canViewRent/);
  assert.doesNotMatch(historyDialog, /canViewRentalAgreements|hasFeature\('rentals'\)|\/api\/rentals\?customerId=/);
});

test('configured receipt footer replaces the default text in preview, browser and server printouts', () => {
  for (const sourceText of [receiptSettings, receiptViewer, browserReceiptPrint]) {
    assert.match(sourceText, /receiptFooter\?\.trim\(\) \|\| 'Thank you for your purchase!'/);
  }
  assert.equal((backendReceipts.match(/receiptFooter\?\.trim\(\) \|\| "Thank you for your purchase!"/g) || []).length, 2);
});
