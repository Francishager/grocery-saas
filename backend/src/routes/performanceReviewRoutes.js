/**
 * Performance Review Routes - Phase 5 Performance Management
 * Endpoints for performance reviews, ratings, feedback, and appraisals
 */

import express from 'express';
import { requireAuth, requirePermission, requireTenant } from '../middleware/auth.js';
import performanceReviewService from '../services/performanceReviewService.js';
import goalSettingService from '../services/goalSettingService.js';

const router = express.Router();
router.use(requireAuth);
router.use(requireTenant);

// ========== Performance Reviews ==========

/**
 * POST /api/performance/reviews
 * Create performance review
 */
router.post('/reviews', requirePermission('REVIEW_CREATE'), async (req, res) => {
  try {
    const review = await performanceReviewService.createReview(req.tenant.id, req.body);
    res.json({ success: true, data: review, message: 'Performance review created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/performance/reviews/:id
 * Get review details
 */
router.get('/reviews/:id', requirePermission('REVIEW_VIEW'), async (req, res) => {
  try {
    const review = await performanceReviewService.getReview(req.tenant.id, req.params.id);
    res.json({ success: true, data: review });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/performance/reviews/employee/:employeeId
 * Get review history for employee
 */
router.get('/reviews/employee/:employeeId', requirePermission('REVIEW_VIEW'), async (req, res) => {
  try {
    const history = await performanceReviewService.getEmployeeReviewHistory(
      req.tenant.id,
      req.params.employeeId
    );
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/performance/pending-reviews
 * Get pending reviews for current reviewer
 */
router.get('/pending-reviews', requirePermission('REVIEW_APPROVE'), async (req, res) => {
  try {
    const reviews = await performanceReviewService.getPendingReviews(
      req.tenant.id,
      req.user.id
    );
    res.json({ success: true, data: reviews });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Review Ratings ==========

/**
 * POST /api/performance/reviews/:id/ratings
 * Add rating to review
 */
router.post('/reviews/:id/ratings', requirePermission('REVIEW_CREATE'), async (req, res) => {
  try {
    const { criterionId, rating, comment } = req.body;
    if (!criterionId || rating === undefined) {
      throw new Error('Criterion ID and rating required');
    }

    const ratingRecord = await performanceReviewService.addRating(
      req.tenant.id,
      req.params.id,
      criterionId,
      rating,
      comment
    );
    res.json({ success: true, data: ratingRecord, message: 'Rating added' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Review Feedback (360 Degree) ==========

/**
 * POST /api/performance/reviews/:id/feedback
 * Add 360-degree feedback
 */
router.post('/reviews/:id/feedback', requirePermission('REVIEW_FEEDBACK'), async (req, res) => {
  try {
    const { feedbackFrom, feedbackType, feedback } = req.body;
    if (!feedbackFrom || !feedbackType || !feedback) {
      throw new Error('Feedback from, type, and content required');
    }

    const feedbackRecord = await performanceReviewService.addFeedback(
      req.tenant.id,
      req.params.id,
      feedbackFrom,
      feedbackType,
      feedback
    );
    res.json({ success: true, data: feedbackRecord, message: 'Feedback submitted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Submit Review ==========

/**
 * POST /api/performance/reviews/:id/submit
 * Submit review for completion
 */
router.post('/reviews/:id/submit', requirePermission('REVIEW_CREATE'), async (req, res) => {
  try {
    const review = await performanceReviewService.submitReview(req.tenant.id, req.params.id);
    res.json({ success: true, data: review, message: 'Review submitted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Performance Appraisals ==========

/**
 * POST /api/performance/appraisals
 * Create performance appraisal from review
 */
router.post('/appraisals', requirePermission('APPRAISAL_CREATE'), async (req, res) => {
  try {
    const { reviewId, recommendation, developmentAreas } = req.body;
    if (!reviewId || !recommendation) {
      throw new Error('Review ID and recommendation required');
    }

    const appraisal = await performanceReviewService.createAppraisal(
      req.tenant.id,
      reviewId,
      recommendation,
      developmentAreas || {},
      req.user.id
    );
    res.json({ success: true, data: appraisal, message: 'Appraisal created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/performance/appraisals/:employeeId/:year
 * Get employee appraisals
 */
router.get('/appraisals/:employeeId/:year', requirePermission('APPRAISAL_VIEW'), async (req, res) => {
  try {
    const appraisals = await db.performanceAppraisal.findMany({
      where: {
        tenantId: req.tenant.id,
        employeeId: req.params.employeeId,
      },
    });
    res.json({ success: true, data: appraisals });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Goal Setting ==========

/**
 * POST /api/performance/goals
 * Create SMART goal
 */
router.post('/goals', requirePermission('GOAL_CREATE'), async (req, res) => {
  try {
    const goal = await goalSettingService.createGoal(req.tenant.id, {
      ...req.body,
      createdBy: req.user.id,
    });
    res.json({ success: true, data: goal, message: 'Goal created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/performance/goals/:employeeId
 * Get employee goals
 */
router.get('/goals/:employeeId', requirePermission('GOAL_VIEW'), async (req, res) => {
  try {
    const goals = await db.goalSetting.findMany({
      where: {
        tenantId: req.tenant.id,
        employeeId: req.params.employeeId,
      },
      include: {
        progress: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: goals });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * PUT /api/performance/goals/:goalId
 * Update goal
 */
router.put('/goals/:goalId', requirePermission('GOAL_CREATE'), async (req, res) => {
  try {
    const goal = await db.goalSetting.update({
      where: { id: req.params.goalId },
      data: req.body,
    });
    res.json({ success: true, data: goal, message: 'Goal updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/performance/goals/:goalId/progress
 * Update goal progress
 */
router.post('/goals/:goalId/progress', requirePermission('GOAL_CREATE'), async (req, res) => {
  try {
    const { completionPercent, notes } = req.body;
    if (completionPercent === undefined) throw new Error('Completion percent required');

    const progress = await db.goalProgress.create({
      data: {
        goalId: req.params.goalId,
        completionPercent,
        notes,
      },
    });
    res.json({ success: true, data: progress, message: 'Progress recorded' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== KPI Tracking ==========

/**
 * POST /api/performance/kpi-targets
 * Create KPI target for employee
 */
router.post('/kpi-targets', requirePermission('KPI_MANAGE'), async (req, res) => {
  try {
    const target = await db.kPITarget.create({
      data: {
        tenantId: req.tenant.id,
        employeeId: req.body.employeeId,
        performanceIndicatorId: req.body.performanceIndicatorId,
        period: req.body.period,
        targetValue: req.body.targetValue,
      },
    });
    res.json({ success: true, data: target, message: 'KPI target created' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/performance/kpi-targets/:employeeId/:period
 * Get employee KPI targets
 */
router.get('/kpi-targets/:employeeId/:period', requirePermission('KPI_VIEW'), async (req, res) => {
  try {
    const targets = await db.kPITarget.findMany({
      where: {
        tenantId: req.tenant.id,
        employeeId: req.params.employeeId,
        period: req.params.period,
      },
      include: {
        performanceIndicator: true,
      },
    });
    res.json({ success: true, data: targets });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/performance/kpi-actual
 * Record actual KPI value
 */
router.post('/kpi-actual', requirePermission('KPI_RECORD'), async (req, res) => {
  try {
    const actual = await db.kPIActual.create({
      data: {
        tenantId: req.tenant.id,
        employeeId: req.body.employeeId,
        performanceIndicatorId: req.body.performanceIndicatorId,
        period: req.body.period,
        value: req.body.value,
        recordedBy: req.user.id,
        notes: req.body.notes,
      },
    });
    res.json({ success: true, data: actual, message: 'KPI actual recorded' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ========== Review Cycle ==========

/**
 * GET /api/performance/cycle-summary/:cycle
 * Get cycle summary
 */
router.get('/cycle-summary/:cycle', requirePermission('REVIEW_VIEW'), async (req, res) => {
  try {
    const summary = await performanceReviewService.getCycleSummary(
      req.tenant.id,
      req.params.cycle
    );
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
