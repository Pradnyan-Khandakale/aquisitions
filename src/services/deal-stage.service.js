import { db } from '#config/database.js';
import { deal_stages } from '#models/deal-stage.model.js';
import { acquisitions } from '#models/acquisition.model.js';
import { eq, and, ne, asc, count } from 'drizzle-orm';
import logger from '#config/logger.js';

export const createDealStage = async ({ name, description, sequence = 0 }) => {
  try {
    const [existing] = await db
      .select({ id: deal_stages.id })
      .from(deal_stages)
      .where(eq(deal_stages.name, name))
      .limit(1);

    if (existing) {
      const err = new Error('Deal stage with this name already exists');
      err.code = 'CONFLICT';
      throw err;
    }

    const [newStage] = await db
      .insert(deal_stages)
      .values({
        name,
        description: description ?? null,
        sequence: sequence ?? 0,
      })
      .returning();

    logger.info(
      `Deal stage created successfully: ${newStage.name} (id: ${newStage.id})`
    );
    return newStage;
  } catch (err) {
    logger.error('Error creating deal stage:', err);
    throw err;
  }
};

export const getAllDealStages = async () => {
  try {
    const list = await db
      .select()
      .from(deal_stages)
      .orderBy(asc(deal_stages.sequence), asc(deal_stages.id));

    return list;
  } catch (err) {
    logger.error('Error fetching deal stages:', err);
    throw err;
  }
};

export const getDealStageById = async id => {
  try {
    const [stage] = await db
      .select()
      .from(deal_stages)
      .where(eq(deal_stages.id, id))
      .limit(1);

    return stage || null;
  } catch (err) {
    logger.error(`Error fetching deal stage ${id}:`, err);
    throw err;
  }
};

export const updateDealStage = async (id, updateData) => {
  try {
    const [existing] = await db
      .select()
      .from(deal_stages)
      .where(eq(deal_stages.id, id))
      .limit(1);

    if (!existing) {
      return null;
    }

    if (updateData.name && updateData.name !== existing.name) {
      const [nameConflict] = await db
        .select({ id: deal_stages.id })
        .from(deal_stages)
        .where(
          and(eq(deal_stages.name, updateData.name), ne(deal_stages.id, id))
        )
        .limit(1);

      if (nameConflict) {
        const err = new Error('Deal stage with this name already exists');
        err.code = 'CONFLICT';
        throw err;
      }
    }

    const [updated] = await db
      .update(deal_stages)
      .set({
        ...updateData,
        updated_at: new Date(),
      })
      .where(eq(deal_stages.id, id))
      .returning();

    logger.info(
      `Deal stage updated successfully: ${updated.name} (id: ${updated.id})`
    );
    return updated;
  } catch (err) {
    logger.error(`Error updating deal stage ${id}:`, err);
    throw err;
  }
};

export const deleteDealStage = async id => {
  try {
    const [existing] = await db
      .select({ id: deal_stages.id })
      .from(deal_stages)
      .where(eq(deal_stages.id, id))
      .limit(1);

    if (!existing) {
      return null; // Not found
    }

    // Check if stage is in use
    const [usage] = await db
      .select({ count: count() })
      .from(acquisitions)
      .where(eq(acquisitions.deal_stage_id, id));

    if (usage && usage.count > 0) {
      const err = new Error(
        'Cannot delete deal stage that is currently in use by acquisitions'
      );
      err.code = 'IN_USE';
      throw err;
    }

    await db.delete(deal_stages).where(eq(deal_stages.id, id));
    logger.info(`Deal stage deleted successfully (id: ${id})`);
    return true;
  } catch (err) {
    logger.error(`Error deleting deal stage ${id}:`, err);
    throw err;
  }
};
