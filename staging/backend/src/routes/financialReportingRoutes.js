/**
 * Financial Reporting Routes - Phase 3 Financial Management
 * Endpoints for financial statements, account queries, and GL operations
 */

import express from 'express';
import { requireAuth, requirePermission, requireTenant } from '../middleware/auth.js';
import generalLedgerService from '../services/generalLedgerService.js';
import journalEntryService from '../services/journalEntryService.js';
import reconciliationService from '../services/reconciliationService.js';
import financialStatementService from '../services/financialStatementService.js';

const router = express.Router();
router.use(requireAuth);
router.use(requireTenant);

// ========== General Ledger Accounts ==========

/**
 * POST /api/financial/gl/accounts
 * Create GL account
 */
router.post('/accounts', requirePermission('GL_MANAGE'), async (req, res) => {
  try {
    const account = await generalLedgerService.createAccount(req.tenant.id, req.body);
    res.json({ success: true, data: account, message: 'GL account created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/gl/accounts
 * List all GL accounts
 */
router.get('/accounts', requirePermission('GL_VIEW'), async (req, res) => {
  try {
    const accounts = await generalLedgerService.getAccounts(req.tenant.id, req.query);
    res.json({ success: true, data: accounts });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/gl/accounts/:id
 * Get GL account with balance
 */
router.get('/accounts/:id', requirePermission('GL_VIEW'), async (req, res) => {
  try {
    const account = await generalLedgerService.getAccountWithBalance(
      req.tenant.id,
      req.params.id,
      req.query.asOfDate
    );
    res.json({ success: true, data: account });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/financial/gl/accounts/:id
 * Update GL account
 */
router.put('/accounts/:id', requirePermission('GL_MANAGE'), async (req, res) => {
  try {
    const account = await generalLedgerService.updateAccount(
      req.tenant.id,
      req.params.id,
      req.body
    );
    res.json({ success: true, data: account, message: 'Account updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/financial/gl/accounts/:id
 * Deactivate GL account
 */
router.delete('/accounts/:id', requirePermission('GL_MANAGE'), async (req, res) => {
  try {
    const account = await generalLedgerService.deactivateAccount(
      req.tenant.id,
      req.params.id
    );
    res.json({ success: true, data: account, message: 'Account deactivated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/gl/chart-of-accounts
 * Get chart of accounts (hierarchical)
 */
router.get('/chart-of-accounts', requirePermission('GL_VIEW'), async (req, res) => {
  try {
    const chart = await generalLedgerService.getChartOfAccounts(req.tenant.id);
    res.json({ success: true, data: chart });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Journal Entries ==========

/**
 * POST /api/financial/journal/entries
 * Create journal entry
 */
router.post('/entries', requirePermission('JE_CREATE'), async (req, res) => {
  try {
    const entry = await journalEntryService.createEntry(
      req.tenant.id,
      { ...req.body, createdBy: req.user.id }
    );
    res.json({ success: true, data: entry, message: 'Journal entry created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/journal/entries
 * List journal entries
 */
router.get('/entries', requirePermission('JE_VIEW'), async (req, res) => {
  try {
    const entries = await journalEntryService.getEntries(req.tenant.id, req.query);
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/journal/entries/:id
 * Get journal entry details
 */
router.get('/entries/:id', requirePermission('JE_VIEW'), async (req, res) => {
  try {
    const entry = await journalEntryService.getEntryById(req.tenant.id, req.params.id);
    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/financial/journal/entries/:id
 * Update journal entry (draft only)
 */
router.put('/entries/:id', requirePermission('JE_CREATE'), async (req, res) => {
  try {
    const entry = await journalEntryService.updateEntry(req.tenant.id, req.params.id, req.body);
    res.json({ success: true, data: entry, message: 'Entry updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/financial/journal/entries/:id/post
 * Post journal entry
 */
router.post('/entries/:id/post', requirePermission('JE_POST'), async (req, res) => {
  try {
    const entry = await journalEntryService.postEntry(req.tenant.id, req.params.id, req.user.id);
    res.json({ success: true, data: entry, message: 'Entry posted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/financial/journal/entries/:id/reverse
 * Reverse journal entry
 */
router.post('/entries/:id/reverse', requirePermission('JE_POST'), async (req, res) => {
  try {
    const entry = await journalEntryService.reverseEntry(
      req.tenant.id,
      req.params.id,
      req.body.reversalReason,
      req.user.id
    );
    res.json({ success: true, data: entry, message: 'Entry reversed' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * DELETE /api/financial/journal/entries/:id
 * Delete journal entry (draft only)
 */
router.delete('/entries/:id', requirePermission('JE_CREATE'), async (req, res) => {
  try {
    const result = await journalEntryService.deleteEntry(req.tenant.id, req.params.id);
    res.json({ success: true, data: result, message: 'Entry deleted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Financial Statements ==========

/**
 * GET /api/financial/reporting/income-statement
 * Generate income statement
 */
router.get('/income-statement', requirePermission('FR_VIEW'), async (req, res) => {
  try {
    const statement = await financialStatementService.generateIncomeStatement(
      req.tenant.id,
      req.query.startDate,
      req.query.endDate
    );
    res.json({ success: true, data: statement });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/reporting/balance-sheet
 * Generate balance sheet
 */
router.get('/balance-sheet', requirePermission('FR_VIEW'), async (req, res) => {
  try {
    const statement = await financialStatementService.generateBalanceSheet(
      req.tenant.id,
      req.query.asOfDate
    );
    res.json({ success: true, data: statement });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/reporting/cash-flow
 * Generate cash flow statement
 */
router.get('/cash-flow', requirePermission('FR_VIEW'), async (req, res) => {
  try {
    const statement = await financialStatementService.generateCashFlow(
      req.tenant.id,
      req.query.startDate,
      req.query.endDate
    );
    res.json({ success: true, data: statement });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/reporting/financial-ratios
 * Calculate financial ratios
 */
router.get('/financial-ratios', requirePermission('FR_VIEW'), async (req, res) => {
  try {
    const ratios = await financialStatementService.calculateRatios(
      req.tenant.id,
      req.query.asOfDate
    );
    res.json({ success: true, data: ratios });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Account Reconciliation ==========

/**
 * POST /api/financial/reporting/reconciliation
 * Create account reconciliation
 */
router.post('/reconciliation', requirePermission('RECONCILE'), async (req, res) => {
  try {
    const recon = await reconciliationService.createReconciliation(
      req.tenant.id,
      req.body
    );
    res.json({ success: true, data: recon, message: 'Reconciliation created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/financial/reporting/reconciliation/:id
 * Get reconciliation details
 */
router.get('/reconciliation/:id', requirePermission('RECONCILE'), async (req, res) => {
  try {
    const recon = await reconciliationService.getReconciliation(req.tenant.id, req.params.id);
    res.json({ success: true, data: recon });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/financial/reporting/reconciliation/:id/approve
 * Approve reconciliation
 */
router.post('/reconciliation/:id/approve', requirePermission('RECONCILE'), async (req, res) => {
  try {
    const recon = await reconciliationService.approveReconciliation(
      req.tenant.id,
      req.params.id,
      req.user.id
    );
    res.json({ success: true, data: recon, message: 'Reconciliation approved' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
