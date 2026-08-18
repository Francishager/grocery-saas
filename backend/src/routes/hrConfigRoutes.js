/**
 * HR Configuration Routes
 * Handles HR accounting configuration and account mappings
 */

import { Router } from "express";
import hrConfigurationService from "../services/hrConfigurationService.js";
import { authenticateToken, requirePermission, requireTenant } from "../../middleware/auth.js";

// Check authentication and tenant
const router = Router();
const tenantIdFromRequest = (req) => req.user.tenantId || req.user.tenant_id || req.user.business_id || req.tenantId;
const userIdFromRequest = (req) => req.user.id || req.user.userId;

router.use(authenticateToken, requireTenant, requirePermission("canManageHRPayroll"));

/**
 * GET /api/hr/config
 * Get current HR configuration
 */
router.get("/", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);

    const config = await hrConfigurationService.getHRConfig(tenantId);

    res.json({
      config,
      isConfigured: config.isConfigured,
    });
  } catch (error) {
    console.error("Error fetching HR configuration:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/config/status
 * Check HR configuration status
 */
router.get("/status", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);

    const status = await hrConfigurationService.checkHRConfiguration(tenantId);

    res.json(status);
  } catch (error) {
    console.error("Error checking HR configuration status:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/hr/config/available-accounts
 * Get available accounts grouped by type for mapping
 */
router.get("/available-accounts", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);

    const accounts =
      await hrConfigurationService.getAvailableAccountsByType(tenantId);

    res.json({
      expenseAccounts: accounts.expenseAccounts,
      liabilityAccounts: accounts.liabilityAccounts,
      assetAccounts: accounts.assetAccounts,
    });
  } catch (error) {
    console.error("Error fetching available accounts:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/config/mapping
 * Update HR accounting account mappings
 */
router.post("/mapping", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const userId = userIdFromRequest(req);
    const {
      salaryExpenseAccountId,
      salaryPayableAccountId,
      salaryAdvanceAccountId,
      payeTaxAccountId,
      socialSecurityAccountId,
    } = req.body;

    const result = await hrConfigurationService.updateHRAccountMapping({
      tenantId,
      salaryExpenseAccountId,
      salaryPayableAccountId,
      salaryAdvanceAccountId,
      payeTaxAccountId,
      socialSecurityAccountId,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
        validation: result.validation,
      });
    }

    res.json({
      success: true,
      config: result.config,
    });
  } catch (error) {
    console.error("Error updating HR account mapping:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/hr/config/initialize-accounts
 * Initialize default HR accounts for first-time setup
 */
router.post("/initialize-accounts", async (req, res) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    const userId = userIdFromRequest(req);
    const { branchId } = req.body;

    const result = await hrConfigurationService.initializeDefaultHRAccounts({
      tenantId,
      branchId,
      userId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      accounts: result.accounts,
      config: result.config,
      message:
        "Default HR accounts created successfully. Please review and confirm the configuration.",
    });
  } catch (error) {
    console.error("Error initializing HR accounts:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
