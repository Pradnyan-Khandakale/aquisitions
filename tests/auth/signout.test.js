import request from 'supertest';
import app from '#src/app.js';
import {
  cleanDatabase,
  createTestUser,
  createTestCompany,
  seedDealStages,
  createTestAcquisition,
} from '../helpers/db.helper.js';

describe('POST /api/auth/sign-out', () => {
  const userPassword = 'TestPassword123!';
  let seededUser;

  beforeEach(async () => {
    await cleanDatabase();
    seededUser = await createTestUser({
      name: 'Sign-out Tester',
      email: 'signout.tester@example.test',
      password: userPassword,
      role: 'user',
    });
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  it('should clear authentication cookie on sign-out', async () => {
    // 1. Sign in first
    const signinRes = await request(app).post('/api/auth/sign-in').send({
      email: seededUser.email,
      password: userPassword,
    });

    const cookie = signinRes.headers['set-cookie'];
    expect(cookie).toBeDefined();

    // 2. Sign out
    const signoutRes = await request(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie);

    expect(signoutRes.status).toBe(200);
    expect(signoutRes.body).toHaveProperty(
      'message',
      'User signed out successfully'
    );

    // 3. Verify cookie is expired / cleared
    const clearedCookies = signoutRes.headers['set-cookie'];
    expect(clearedCookies).toBeDefined();
    // Cleared cookies typically have max-age=0 or expires in the past
    const tokenCleared = clearedCookies.some(
      c =>
        c.includes('token=;') ||
        c.includes('Max-Age=0') ||
        c.includes('Expires=Thu, 01 Jan 1970')
    );
    expect(tokenCleared).toBe(true);
  });

  it('subsequent protected access should fail after clearing token', async () => {
    const stages = await seedDealStages();
    const company = await createTestCompany();
    const acq = await createTestAcquisition({
      title: 'Sign-out Protected Acq',
      company_id: company.id,
      deal_stage_id: stages.draft.id,
      created_by: seededUser.id,
    });

    // Attempting stage transition with cleared / empty cookie must fail with 401
    const res = await request(app)
      .patch(`/api/acquisitions/${acq.id}/stage`)
      .set('Cookie', 'token=;')
      .send({ targetStageId: stages.review.id });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });
});
