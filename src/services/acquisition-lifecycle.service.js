import { db } from '#config/database.js';
import { acquisitions } from '#models/acquisition.model.js';
import { deal_stages } from '#models/deal-stage.model.js';
import { getAcquisitionById } from '#services/acquisition.service.js';
import { eq, and, asc } from 'drizzle-orm';
import logger from '#config/logger.js';

const TERMINAL_STAGE_REGEX = /^(closed|closed won|closed lost|rejected|cancelled|abandoned)$/i;
const REJECTION_STAGE_REGEX = /^(rejected|cancelled|abandoned|closed lost)$/i;

export const transitionAcquisitionStage = async ({
  acquisitionId,
  targetStageId,
  user,
  notes,
}) => {
  try {
    // 1. Authentication check
    if (!user) {
      const err = new Error('Authentication required to transition an acquisition stage');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }

    // 2. Fetch acquisition
    const [acquisition] = await db
      .select()
      .from(acquisitions)
      .where(eq(acquisitions.id, acquisitionId))
      .limit(1);

    if (!acquisition) {
      const err = new Error(`Acquisition with ID ${acquisitionId} not found`);
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // 3. Authorization check (admin or owner/creator)
    const isAdmin = user.role === 'admin';
    const isOwner = acquisition.created_by === null || acquisition.created_by === user.id;

    if (!isAdmin && !isOwner) {
      const err = new Error('Not authorized to transition this acquisition');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    // 4. Fetch target stage
    const [targetStage] = await db
      .select()
      .from(deal_stages)
      .where(eq(deal_stages.id, targetStageId))
      .limit(1);

    if (!targetStage) {
      const err = new Error(`Target deal stage with ID ${targetStageId} not found`);
      err.code = 'STAGE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // 5. Fetch current stage
    const [currentStage] = await db
      .select()
      .from(deal_stages)
      .where(eq(deal_stages.id, acquisition.deal_stage_id))
      .limit(1);

    if (!currentStage) {
      const err = new Error('Current acquisition deal stage record is corrupted or missing');
      err.code = 'INTERNAL_ERROR';
      err.status = 500;
      throw err;
    }

    // 6. Evaluate transition rules

    // 6a. Same-stage check
    if (currentStage.id === targetStage.id) {
      const err = new Error(`Acquisition is already in stage '${currentStage.name}'`);
      err.code = 'SAME_STAGE';
      err.status = 409;
      throw err;
    }

    // 6b. Terminal stage check (once Closed/Rejected, cannot transition away)
    if (TERMINAL_STAGE_REGEX.test(currentStage.name)) {
      const err = new Error(
        `Cannot transition acquisition from terminal stage '${currentStage.name}'`
      );
      err.code = 'TERMINAL_STAGE';
      err.status = 409;
      throw err;
    }

    // 6c. Rejection/Cancellation path (allowed from any active non-terminal stage)
    const isTargetRejection = REJECTION_STAGE_REGEX.test(targetStage.name);

    if (!isTargetRejection) {
      // 6d. Sequential forward progression evaluation
      const allStages = await db
        .select()
        .from(deal_stages)
        .orderBy(asc(deal_stages.sequence), asc(deal_stages.id));

      const currentIndex = allStages.findIndex(s => s.id === currentStage.id);
      const targetIndex = allStages.findIndex(s => s.id === targetStage.id);

      if (targetIndex < currentIndex) {
        const err = new Error(
          `Backward transition from '${currentStage.name}' to '${targetStage.name}' is not permitted`
        );
        err.code = 'BACKWARD_TRANSITION';
        err.status = 409;
        throw err;
      }

      if (targetIndex > currentIndex + 1) {
        const expectedNext = allStages[currentIndex + 1]?.name || 'next sequential stage';
        const err = new Error(
          `Invalid stage transition: Cannot jump from '${currentStage.name}' to '${targetStage.name}'. Next allowed stage is '${expectedNext}'`
        );
        err.code = 'INVALID_JUMP';
        err.status = 409;
        throw err;
      }
    }

    // 7. Business gates / prerequisites validation
    const isClosingStage = /^(approved|closed|closed won)$/i.test(targetStage.name);
    if (isClosingStage && (!acquisition.estimated_value || Number(acquisition.estimated_value) <= 0)) {
      const err = new Error(
        `Cannot advance acquisition to '${targetStage.name}' without a valid estimated valuation`
      );
      err.code = 'PREREQUISITE_FAILED';
      err.status = 422;
      throw err;
    }

    // 8. Determine updated acquisition status based on target stage
    let nextStatus = acquisition.status;
    if (isTargetRejection) {
      nextStatus = 'lost';
    } else if (/^(closed|closed won)$/i.test(targetStage.name)) {
      nextStatus = 'won';
    } else if (acquisition.status === 'lost') {
      nextStatus = 'active';
    }

    // 9. Atomic conditional update (concurrency protection against race conditions)
    const [updated] = await db
      .update(acquisitions)
      .set({
        deal_stage_id: targetStage.id,
        status: nextStatus,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(acquisitions.id, acquisitionId),
          eq(acquisitions.deal_stage_id, currentStage.id)
        )
      )
      .returning();

    if (!updated) {
      const err = new Error(
        'Concurrent modification detected. The acquisition stage was modified by another operation.'
      );
      err.code = 'CONCURRENCY_CONFLICT';
      err.status = 409;
      throw err;
    }

    logger.info(
      `Acquisition ${acquisitionId} transitioned: '${currentStage.name}' -> '${targetStage.name}' by user ${user.id} (${user.email})`
    );

    // 10. Fetch and return complete joined record with transition metadata
    const fullRecord = await getAcquisitionById(acquisitionId);

    return {
      acquisition: fullRecord,
      transition: {
        from_stage: {
          id: currentStage.id,
          name: currentStage.name,
          sequence: currentStage.sequence,
        },
        to_stage: {
          id: targetStage.id,
          name: targetStage.name,
          sequence: targetStage.sequence,
        },
        transitioned_by: {
          id: user.id,
          email: user.email,
        },
        notes: notes ?? null,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    logger.error(`Stage transition error for acquisition ${acquisitionId}:`, err);
    throw err;
  }
};
