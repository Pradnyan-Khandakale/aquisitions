import { db } from '#config/database.js';
import { companies } from '#models/company.model.js';
import { eq, and, ne, desc } from 'drizzle-orm';
import logger from '#config/logger.js';

export const createCompany = async ({
  name,
  description,
  industry,
  website,
}) => {
  try {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.name, name))
      .limit(1);

    if (existing) {
      const err = new Error('Company with this name already exists');
      err.code = 'CONFLICT';
      throw err;
    }

    const [newCompany] = await db
      .insert(companies)
      .values({
        name,
        description: description ?? null,
        industry: industry ?? null,
        website: website ?? null,
      })
      .returning();

    logger.info(
      `Company created successfully: ${newCompany.name} (id: ${newCompany.id})`
    );
    return newCompany;
  } catch (err) {
    logger.error('Error creating company:', err);
    throw err;
  }
};

export const getAllCompanies = async () => {
  try {
    const list = await db
      .select()
      .from(companies)
      .orderBy(desc(companies.created_at));

    return list;
  } catch (err) {
    logger.error('Error fetching companies:', err);
    throw err;
  }
};

export const getCompanyById = async id => {
  try {
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    return company || null;
  } catch (err) {
    logger.error(`Error fetching company ${id}:`, err);
    throw err;
  }
};

export const updateCompany = async (id, updateData) => {
  try {
    const [existing] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!existing) {
      return null;
    }

    if (updateData.name && updateData.name !== existing.name) {
      const [nameConflict] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.name, updateData.name), ne(companies.id, id)))
        .limit(1);

      if (nameConflict) {
        const err = new Error('Company with this name already exists');
        err.code = 'CONFLICT';
        throw err;
      }
    }

    const [updated] = await db
      .update(companies)
      .set({
        ...updateData,
        updated_at: new Date(),
      })
      .where(eq(companies.id, id))
      .returning();

    logger.info(
      `Company updated successfully: ${updated.name} (id: ${updated.id})`
    );
    return updated;
  } catch (err) {
    logger.error(`Error updating company ${id}:`, err);
    throw err;
  }
};

export const deleteCompany = async id => {
  try {
    const [existing] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.id, id))
      .limit(1);

    if (!existing) {
      return false;
    }

    await db.delete(companies).where(eq(companies.id, id));
    logger.info(`Company deleted successfully (id: ${id})`);
    return true;
  } catch (err) {
    logger.error(`Error deleting company ${id}:`, err);
    throw err;
  }
};
