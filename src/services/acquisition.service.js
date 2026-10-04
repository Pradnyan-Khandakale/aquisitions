import { db } from '#config/database.js';
import { acquisitions } from '#models/acquisition.model.js';
import { companies } from '#models/company.model.js';
import { deal_stages } from '#models/deal-stage.model.js';
import { users } from '#models/user.model.js';
import { eq, desc } from 'drizzle-orm';
import logger from '#config/logger.js';

export const createAcquisition = async ({
  title,
  description,
  company_id,
  deal_stage_id,
  status = 'active',
  estimated_value,
  target_close_date,
  created_by,
}) => {
  try {
    // Relational existence validation
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, company_id))
      .limit(1);

    if (!company) {
      const err = new Error(
        `Referenced company with ID ${company_id} does not exist`
      );
      err.code = 'RELATION_NOT_FOUND';
      throw err;
    }

    const [stage] = await db
      .select({ id: deal_stages.id })
      .from(deal_stages)
      .where(eq(deal_stages.id, deal_stage_id))
      .limit(1);

    if (!stage) {
      const err = new Error(
        `Referenced deal stage with ID ${deal_stage_id} does not exist`
      );
      err.code = 'RELATION_NOT_FOUND';
      throw err;
    }

    let validCreatorId = null;
    if (created_by) {
      const [creator] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, created_by))
        .limit(1);

      if (creator) {
        validCreatorId = creator.id;
      }
    }

    const [inserted] = await db
      .insert(acquisitions)
      .values({
        title,
        description: description ?? null,
        company_id,
        deal_stage_id,
        status: status || 'active',
        estimated_value:
          estimated_value !== null && estimated_value !== undefined
            ? String(estimated_value)
            : null,
        target_close_date: target_close_date
          ? new Date(target_close_date)
          : null,
        created_by: validCreatorId,
      })
      .returning();

    logger.info(
      `Acquisition created successfully: ${inserted.title} (id: ${inserted.id})`
    );
    return await getAcquisitionById(inserted.id);
  } catch (err) {
    logger.error('Error creating acquisition:', err);
    throw err;
  }
};

export const getAllAcquisitions = async () => {
  try {
    const rows = await db
      .select({
        id: acquisitions.id,
        title: acquisitions.title,
        description: acquisitions.description,
        status: acquisitions.status,
        estimated_value: acquisitions.estimated_value,
        target_close_date: acquisitions.target_close_date,
        created_at: acquisitions.created_at,
        updated_at: acquisitions.updated_at,
        company: {
          id: companies.id,
          name: companies.name,
          industry: companies.industry,
          website: companies.website,
        },
        deal_stage: {
          id: deal_stages.id,
          name: deal_stages.name,
          sequence: deal_stages.sequence,
        },
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(acquisitions)
      .leftJoin(companies, eq(acquisitions.company_id, companies.id))
      .leftJoin(deal_stages, eq(acquisitions.deal_stage_id, deal_stages.id))
      .leftJoin(users, eq(acquisitions.created_by, users.id))
      .orderBy(desc(acquisitions.created_at));

    return rows;
  } catch (err) {
    logger.error('Error fetching acquisitions:', err);
    throw err;
  }
};

export const getAcquisitionById = async id => {
  try {
    const [row] = await db
      .select({
        id: acquisitions.id,
        title: acquisitions.title,
        description: acquisitions.description,
        status: acquisitions.status,
        estimated_value: acquisitions.estimated_value,
        target_close_date: acquisitions.target_close_date,
        created_at: acquisitions.created_at,
        updated_at: acquisitions.updated_at,
        company: {
          id: companies.id,
          name: companies.name,
          industry: companies.industry,
          website: companies.website,
        },
        deal_stage: {
          id: deal_stages.id,
          name: deal_stages.name,
          sequence: deal_stages.sequence,
        },
        creator: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(acquisitions)
      .leftJoin(companies, eq(acquisitions.company_id, companies.id))
      .leftJoin(deal_stages, eq(acquisitions.deal_stage_id, deal_stages.id))
      .leftJoin(users, eq(acquisitions.created_by, users.id))
      .where(eq(acquisitions.id, id))
      .limit(1);

    return row || null;
  } catch (err) {
    logger.error(`Error fetching acquisition ${id}:`, err);
    throw err;
  }
};

export const updateAcquisition = async (id, updateData) => {
  try {
    const [existing] = await db
      .select({ id: acquisitions.id })
      .from(acquisitions)
      .where(eq(acquisitions.id, id))
      .limit(1);

    if (!existing) {
      return null;
    }

    if (updateData.company_id) {
      const [company] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, updateData.company_id))
        .limit(1);

      if (!company) {
        const err = new Error(
          `Referenced company with ID ${updateData.company_id} does not exist`
        );
        err.code = 'RELATION_NOT_FOUND';
        throw err;
      }
    }

    if (updateData.deal_stage_id) {
      const [stage] = await db
        .select({ id: deal_stages.id })
        .from(deal_stages)
        .where(eq(deal_stages.id, updateData.deal_stage_id))
        .limit(1);

      if (!stage) {
        const err = new Error(
          `Referenced deal stage with ID ${updateData.deal_stage_id} does not exist`
        );
        err.code = 'RELATION_NOT_FOUND';
        throw err;
      }
    }

    const payload = { ...updateData, updated_at: new Date() };
    if (payload.estimated_value !== undefined) {
      payload.estimated_value =
        payload.estimated_value !== null
          ? String(payload.estimated_value)
          : null;
    }
    if (payload.target_close_date !== undefined) {
      payload.target_close_date =
        payload.target_close_date !== null
          ? new Date(payload.target_close_date)
          : null;
    }

    await db.update(acquisitions).set(payload).where(eq(acquisitions.id, id));

    logger.info(`Acquisition updated successfully (id: ${id})`);
    return await getAcquisitionById(id);
  } catch (err) {
    logger.error(`Error updating acquisition ${id}:`, err);
    throw err;
  }
};

export const deleteAcquisition = async id => {
  try {
    const [existing] = await db
      .select({ id: acquisitions.id })
      .from(acquisitions)
      .where(eq(acquisitions.id, id))
      .limit(1);

    if (!existing) {
      return false;
    }

    await db.delete(acquisitions).where(eq(acquisitions.id, id));
    logger.info(`Acquisition deleted successfully (id: ${id})`);
    return true;
  } catch (err) {
    logger.error(`Error deleting acquisition ${id}:`, err);
    throw err;
  }
};
