import { db } from '#config/database.js';
import { users } from '#models/user.model.js';
import { companies } from '#models/company.model.js';
import { deal_stages } from '#models/deal-stage.model.js';
import { acquisitions } from '#models/acquisition.model.js';
import { hashPassword } from '#services/auth.service.js';
import { jwttoken } from '#utils/jwt.js';

export const assertTestDatabase = async () => {
  // 1. Guard environment
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      `FATAL: Refusing to perform database operation outside of test environment. NODE_ENV is "${process.env.NODE_ENV}" (must be "test").`
    );
  }

  // 2. Query PostgreSQL server directly for the active database name on the wire
  const result = await db.execute('SELECT current_database() as db_name');
  const activeDbName = result.rows?.[0]?.db_name || result?.[0]?.db_name;

  // 3. Verify that the active database is NOT the default/production database
  if (activeDbName === 'neondb' || activeDbName === 'postgres') {
    throw new Error(
      `FATAL SAFETY VIOLATION: Active database "${activeDbName}" appears to be development/production. Destructive operations aborted.`
    );
  }

  // 4. Verify active database name is explicitly identified as test
  const isTestDb =
    activeDbName &&
    (activeDbName.endsWith('_test') || activeDbName.includes('test'));
  if (!isTestDb) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Active database "${activeDbName}" is NOT identified as a test database. Refusing destructive operations.`
    );
  }

  return activeDbName;
};

export const cleanDatabase = async () => {
  try {
    // Verify target database is guaranteed to be a test database before any destructive query
    await assertTestDatabase();

    // Single atomic round-trip truncation across all tables
    await db.execute(
      'TRUNCATE TABLE acquisitions, companies, deal_stages, users CASCADE'
    );
  } catch (err) {
    console.error('Error cleaning test database:', err.message);
    throw err;
  }
};

export const createTestUser = async ({
  name = 'Test User',
  email,
  password = 'Password123!',
  role = 'user',
} = {}) => {
  const uniqueEmail =
    email ||
    `test-user-${Date.now()}-${Math.random().toString(36).substring(2, 7)}@example.test`;
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      name,
      email: uniqueEmail,
      password: passwordHash,
      role,
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      created_at: users.created_at,
    });

  return user;
};

export const createTestCompany = async ({
  name,
  description = 'A test company for automated tests',
  industry = 'Software',
  website = 'https://example.test',
} = {}) => {
  const uniqueName =
    name ||
    `Test Co ${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const [company] = await db
    .insert(companies)
    .values({
      name: uniqueName,
      description,
      industry,
      website,
    })
    .returning();

  return company;
};

export const createTestDealStage = async ({
  name,
  description = 'Test deal stage description',
  sequence = 0,
} = {}) => {
  const uniqueName =
    name || `Stage-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const [stage] = await db
    .insert(deal_stages)
    .values({
      name: uniqueName,
      description,
      sequence,
    })
    .returning();

  return stage;
};

export const seedDealStages = async () => {
  const stagesToSeed = [
    { name: 'Draft', description: 'Initial draft deal stage', sequence: 10 },
    { name: 'Review', description: 'Internal team review', sequence: 20 },
    {
      name: 'Due Diligence',
      description: 'Deep business/legal auditing',
      sequence: 30,
    },
    {
      name: 'Negotiation',
      description: 'Term sheet and pricing',
      sequence: 40,
    },
    { name: 'Approved', description: 'Board approval granted', sequence: 50 },
    {
      name: 'Closed',
      description: 'Deal fully signed and closed',
      sequence: 60,
    },
    {
      name: 'Rejected',
      description: 'Deal rejected or declined',
      sequence: 99,
    },
  ];

  // Batch insert in a single query
  const insertedStages = await db
    .insert(deal_stages)
    .values(stagesToSeed)
    .onConflictDoUpdate({
      target: deal_stages.name,
      set: {
        sequence: deal_stages.sequence,
        description: deal_stages.description,
      },
    })
    .returning();

  const seeded = {};
  for (const s of insertedStages) {
    const key = s.name.toLowerCase().replace(/\s+/g, '_');
    seeded[key] = s;
  }

  return seeded;
};

export const createTestAcquisition = async ({
  title,
  company_id,
  deal_stage_id,
  status = 'active',
  estimated_value = '1000000.00',
  target_close_date = null,
  created_by = null,
} = {}) => {
  const uniqueTitle =
    title ||
    `Test Acquisition ${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const [acquisition] = await db
    .insert(acquisitions)
    .values({
      title: uniqueTitle,
      company_id,
      deal_stage_id,
      status,
      estimated_value:
        estimated_value !== null ? String(estimated_value) : null,
      target_close_date: target_close_date ? new Date(target_close_date) : null,
      created_by,
    })
    .returning();

  return acquisition;
};

export const getAuthToken = user => {
  return jwttoken.sign({
    id: user.id,
    email: user.email,
    role: user.role,
  });
};
