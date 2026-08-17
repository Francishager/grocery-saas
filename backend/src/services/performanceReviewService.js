/**
 * Performance Review Service - Phase 5 Performance Management
 * Handles performance reviews, 360-degree feedback, ratings, and appraisals
 */

class PerformanceReviewService {
  // Create new performance review
  async createReview(tenantId, data) {
    try {
      const { employeeId, cycle, period, reviewer, reviewType } = data;

      if (!employeeId || !cycle) {
        throw new Error('Employee ID and cycle are required');
      }

      // Check if review already exists for this cycle
      const existing = await db.performanceReview.findUnique({
        where: {
          employeeId_cycle: {
            employeeId,
            cycle,
          },
        },
      });

      if (existing) {
        throw new Error('Review already exists for this cycle');
      }

      const review = await db.performanceReview.create({
        data: {
          tenantId,
          employeeId,
          cycle,
          period: period || new Date().toISOString().split('T')[0],
          reviewer,
          selfReview: reviewType === 'self',
          status: 'draft',
        },
      });

      return review;
    } catch (error) {
      throw new Error(`Failed to create performance review: ${error.message}`);
    }
  }

  // Add rating to review
  async addRating(tenantId, reviewId, criterionId, rating, comment) {
    try {
      const review = await db.performanceReview.findUnique({
        where: { id: reviewId, tenantId },
      });

      if (!review) throw new Error('Review not found');

      const existingRating = await db.reviewRating.findUnique({
        where: {
          reviewId_criterionId: {
            reviewId,
            criterionId,
          },
        },
      });

      if (existingRating) {
        // Update existing rating
        return await db.reviewRating.update({
          where: {
            reviewId_criterionId: {
              reviewId,
              criterionId,
            },
          },
          data: {
            rating,
            comment,
          },
        });
      }

      // Create new rating
      const newRating = await db.reviewRating.create({
        data: {
          reviewId,
          criterionId,
          rating,
          comment,
        },
      });

      return newRating;
    } catch (error) {
      throw new Error(`Failed to add rating: ${error.message}`);
    }
  }

  // Submit review for approval
  async submitReview(tenantId, reviewId) {
    try {
      const review = await db.performanceReview.findUnique({
        where: { id: reviewId, tenantId },
        include: { ratings: true },
      });

      if (!review) throw new Error('Review not found');
      if (review.status !== 'draft') throw new Error('Only draft reviews can be submitted');

      // Calculate overall rating from criteria
      let totalRating = 0;
      if (review.ratings.length > 0) {
        totalRating = review.ratings.reduce((sum, r) => sum + r.rating, 0) / review.ratings.length;
      }

      const updated = await db.performanceReview.update({
        where: { id: reviewId },
        data: {
          status: 'completed',
          overallRating: totalRating,
          submittedAt: new Date(),
        },
      });

      return updated;
    } catch (error) {
      throw new Error(`Failed to submit review: ${error.message}`);
    }
  }

  // Add 360 feedback
  async addFeedback(tenantId, reviewId, feedbackFrom, feedbackType, feedback) {
    try {
      const review = await db.performanceReview.findUnique({
        where: { id: reviewId, tenantId },
      });

      if (!review) throw new Error('Review not found');

      const feedbackRecord = await db.reviewFeedback.create({
        data: {
          reviewId,
          feedbackFrom,
          feedbackType, // upward, downward, peer, self
          feedback,
        },
      });

      return feedbackRecord;
    } catch (error) {
      throw new Error(`Failed to add feedback: ${error.message}`);
    }
  }

  // Get review details
  async getReview(tenantId, reviewId) {
    try {
      const review = await db.performanceReview.findUnique({
        where: { id: reviewId, tenantId },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeId: true,
              department: true,
            },
          },
          ratings: {
            include: {
              criterion: true,
            },
          },
          feedback: true,
        },
      });

      if (!review) throw new Error('Review not found');
      return review;
    } catch (error) {
      throw new Error(`Failed to fetch review: ${error.message}`);
    }
  }

  // Get pending reviews for reviewer
  async getPendingReviews(tenantId, reviewerId) {
    try {
      const reviews = await db.performanceReview.findMany({
        where: {
          tenantId,
          reviewer: reviewerId,
          status: {
            in: ['draft', 'in_progress'],
          },
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return reviews;
    } catch (error) {
      throw new Error(`Failed to fetch pending reviews: ${error.message}`);
    }
  }

  // Create performance appraisal from review
  async createAppraisal(tenantId, reviewId, recommendation, developmentAreas, createdBy) {
    try {
      const review = await db.performanceReview.findUnique({
        where: { id: reviewId, tenantId },
        include: { ratings: true },
      });

      if (!review) throw new Error('Review not found');
      if (review.status !== 'completed') {
        throw new Error('Review must be completed before appraisal');
      }

      const appraisal = await db.performanceAppraisal.create({
        data: {
          tenantId,
          employeeId: review.employeeId,
          reviewId,
          overallScore: review.overallRating || 0,
          recommendation, // Promotion, Retain, Improvement needed
          developmentAreas,
          strengths: {},
          status: 'draft',
        },
      });

      return appraisal;
    } catch (error) {
      throw new Error(`Failed to create appraisal: ${error.message}`);
    }
  }

  // Get review history for employee
  async getEmployeeReviewHistory(tenantId, employeeId) {
    try {
      const reviews = await db.performanceReview.findMany({
        where: {
          tenantId,
          employeeId,
          status: 'completed',
        },
        include: {
          ratings: true,
        },
        orderBy: { submittedAt: 'desc' },
      });

      return reviews;
    } catch (error) {
      throw new Error(`Failed to fetch review history: ${error.message}`);
    }
  }

  // Get cycle reviews summary
  async getCycleSummary(tenantId, cycle) {
    try {
      const reviews = await db.performanceReview.findMany({
        where: {
          tenantId,
          cycle,
        },
      });

      const summary = {
        totalReviews: reviews.length,
        completedReviews: reviews.filter(r => r.status === 'completed').length,
        pendingReviews: reviews.filter(r => r.status !== 'completed').length,
        averageRating: 0,
        ratingDistribution: {},
      };

      const ratings = reviews
        .filter(r => r.overallRating)
        .map(r => r.overallRating);

      if (ratings.length > 0) {
        summary.averageRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      }

      return summary;
    } catch (error) {
      throw new Error(`Failed to get cycle summary: ${error.message}`);
    }
  }
}

module.exports = new PerformanceReviewService();
