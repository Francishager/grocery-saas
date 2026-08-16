/**
 * HR Configuration Routes
 * Handles HR accounting configuration and account mappings
 */

const express = require("express");
const router = express.Router();
const hrConfigurationService = require("../services/hrConfigurationService");
const { requireAuth, requireTenant } = require("../middleware/auth");

// Check authentication and tenant
router.use(requireAuth, requireTenant);

/**
 * GET /api/hr/config
 * Get current HR configuration
 */
router.get("/", async (req, res) => {
  try {
    const { tenantId } = req.user;

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
    const { tenantId } = req.user;

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
    const { tenantId } = req.user;

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
    const { tenantId, userId } = req.user;
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
    const { tenantId, userId } = req.user;
    const { branchId } = req.body;

    if (!branchId) {
      return res.status(400).json({
        error: "branchId is required",
      });
    }

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

module.exports = router;
