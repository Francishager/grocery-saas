import express from "express";
import prisma from "../db.js";
import { authenticateToken } from "../middleware/index.js";

const router = express.Router();

/**
 * POST /api/onboarding/complete
 * Mark onboarding guide as completed for the current user
 */
router.post("/complete", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        hasCompletedOnboarding: true,
        onboardingCompletedAt: new Date(),
      },
    });

    res.json({ message: "Onboarding completed", success: true });
  } catch (err) {
    console.error("Complete onboarding error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/onboarding/status
 * Get current user's onboarding status
 */
router.get("/status", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        hasCompletedOnboarding: true,
        onboardingCompletedAt: true,
      },
    });

    res.json({
      completed: user?.hasCompletedOnboarding || false,
      completedAt: user?.onboardingCompletedAt || null,
    });
  } catch (err) {
    console.error("Get onboarding status error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/onboarding/reset
 * Reset onboarding for a user (for re-onboarding)
 */
router.post("/reset", authenticateToken, async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        hasCompletedOnboarding: false,
        onboardingCompletedAt: null,
      },
    });

    res.json({ message: "Onboarding reset", success: true });
  } catch (err) {
    console.error("Reset onboarding error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
