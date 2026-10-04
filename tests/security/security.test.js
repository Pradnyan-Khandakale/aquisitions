import request from 'supertest';
import app from '#src/app.js';
import {
  cleanDatabase,
  createTestUser,
  createTestCompany,
  seedDealStages,
  createTestAcquisition,
  getAuthToken,
} from '../helpers/db.helper.js';

describe('Security Regression, Validation & Error Handling Tests', () => {
  let user;
  let userToken;
  let stages;
  let company;

  beforeEach(async () => {
    await cleanDatabase();
    stages = await seedDealStages();
    company = await createTestCompany({ name: 'Security Test Co' });
    user = await createTestUser({
      name: 'Security User',
      email: 'secuser@example.test',
      role: 'user',
    });
    userToken = getAuthToken(user);
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('Security Regression Matrix (Section 22)', () => {
    it('[Invariant 1] public user cannot self-assign admin role during signup', async () => {
      const res = await request(app).post('/api/auth/sign-up').send({
        name: 'Hacker User',
        email: 'hacker@example.test',
        password: 'Password123!',
        role: 'admin',
      });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('user');
      expect(res.body.user.role).not.toBe('admin');
    });

    it('[Invariant 2] unauthenticated user cannot access protected functionality', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .send({ targetStageId: stages.review.id });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Unauthorized');
    });

    it('[Invariant 3] invalid or tampered JWT is rejected', async () => {
      const tamperedToken = `${userToken}tampered`;

      const res = await request(app)
        .patch('/api/acquisitions/1/stage')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .send({ targetStageId: stages.review.id });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error', 'Unauthorized');
      expect(res.body.message).toMatch(/invalid or expired/i);
    });

    it('[Invariant 4] arbitrary client created_by cannot override authenticated user identity', async () => {
      const spoofedId = 1337;

      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Spoof Creator Test',
          company_id: company.id,
          deal_stage_id: stages.draft.id,
          created_by: spoofedId,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.creator.id).toBe(user.id);
      expect(res.body.data.creator.id).not.toBe(spoofedId);
    });

    it('[Invariant 5] acquisition lifecycle cannot be bypassed through generic PATCH', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: user.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          deal_stage_id: stages.closed.id,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Bad Request');
    });

    it('[Invariant 6] sensitive values like passwords, hashes, and secrets are not returned in API responses', async () => {
      const res = await request(app).post('/api/auth/sign-in').send({
        email: user.email,
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.user).not.toHaveProperty('password');
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(JSON.stringify(res.body)).not.toMatch(/Password123!/);
      expect(JSON.stringify(res.body)).not.toMatch(/bcrypt/);
    });

    it('[Invariant 7] malformed input cannot reach unsafe database operations or leak internals', async () => {
      // Attempt SQL injection via ID parameter
      const res = await request(app).get('/api/companies/1\' OR \'1\'=\'1\'');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
      expect(JSON.stringify(res.body)).not.toMatch(/SELECT/i);
      expect(JSON.stringify(res.body)).not.toMatch(/pg_/i);
      expect(JSON.stringify(res.body)).not.toMatch(/drizzle/i);
    });
  });

  describe('Validation & Error Response Safety (Section 20 & 21)', () => {
    it('should return sanitized error without stack traces or paths on 404', async () => {
      const res = await request(app).get('/api/non-existent-route-for-testing');

      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toMatch(/node_modules/i);
      expect(JSON.stringify(res.body)).not.toMatch(/src[\\/]/i);
      expect(JSON.stringify(res.body)).not.toMatch(/at /i); // stack trace pattern
    });

    it('should reject invalid numbers and unsupported enum values with 400', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Invalid Enum Acquisition',
          company_id: company.id,
          deal_stage_id: stages.draft.id,
          status: 'invalid-status-enum-value',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
      expect(res.body.details).toBeDefined();
    });

    it('should reject oversized strings (> 255 chars in title) with 400', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Z'.repeat(300),
          company_id: company.id,
          deal_stage_id: stages.draft.id,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });
});
