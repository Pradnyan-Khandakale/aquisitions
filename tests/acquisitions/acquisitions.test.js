import request from 'supertest';
import app from '#src/app.js';
import { db } from '#config/database.js';
import { acquisitions } from '#models/acquisition.model.js';
import { eq } from 'drizzle-orm';
import {
  cleanDatabase,
  createTestUser,
  createTestCompany,
  seedDealStages,
  createTestAcquisition,
  getAuthToken,
} from '../helpers/db.helper.js';

describe('Acquisition API Endpoints', () => {
  let user;
  let authToken;
  let stages;
  let company;

  beforeEach(async () => {
    await cleanDatabase();
    stages = await seedDealStages();
    company = await createTestCompany({ name: 'Acquisition Test Corp' });
    user = await createTestUser({
      name: 'Deal Maker',
      email: 'dealmaker@example.test',
      role: 'user',
    });
    authToken = getAuthToken(user);
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('POST /api/acquisitions', () => {
    it('should create an acquisition when authenticated with valid payload (201)', async () => {
      const payload = {
        title: 'Project Phoenix Acquisition',
        description: 'Acquisition of cloud logistics platform',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        estimated_value: 5000000,
        target_close_date: '2027-12-31T00:00:00.000Z',
      };

      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${authToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toBe('Project Phoenix Acquisition');
      expect(res.body.data.company.id).toBe(company.id);
      expect(res.body.data.deal_stage.id).toBe(stages.draft.id);
      expect(res.body.data.creator.id).toBe(user.id);
      expect(res.body.data.creator.email).toBe(user.email);
    });

    it('should reject non-existent company ID with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Orphan Acquisition',
          company_id: 9999999,
          deal_stage_id: stages.draft.id,
        });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('error', 'Unprocessable Entity');
      expect(res.body.message).toMatch(
        /company with ID 9999999 does not exist/i
      );
    });

    it('should reject non-existent deal stage ID with 422 Unprocessable Entity', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Missing Stage Acquisition',
          company_id: company.id,
          deal_stage_id: 9999999,
        });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('error', 'Unprocessable Entity');
      expect(res.body.message).toMatch(
        /deal stage with ID 9999999 does not exist/i
      );
    });

    it('should reject missing required title or relations with 400', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          description: 'No title or company provided',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('should reject negative estimated value with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Negative Valuation',
          company_id: company.id,
          deal_stage_id: stages.draft.id,
          estimated_value: -500,
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('should reject invalid date format with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/acquisitions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Bad Date Acquisition',
          company_id: company.id,
          deal_stage_id: stages.draft.id,
          target_close_date: 'not-a-valid-date-string',
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    describe('Critical Ownership Invariant (Section 16)', () => {
      it('should ignore client-provided created_by and bind to authenticated user identity', async () => {
        const untrustedCreatorId = 999999;

        const res = await request(app)
          .post('/api/acquisitions')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: 'Ownership Spoofing Attempt',
            company_id: company.id,
            deal_stage_id: stages.draft.id,
            created_by: untrustedCreatorId,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.creator).toBeDefined();
        // Identity MUST match authenticated user, NOT the untrusted spoofed ID
        expect(res.body.data.creator.id).toBe(user.id);
        expect(res.body.data.creator.id).not.toBe(untrustedCreatorId);

        // Verify directly in database
        const [dbAcq] = await db
          .select()
          .from(acquisitions)
          .where(eq(acquisitions.id, res.body.data.id));

        expect(dbAcq.created_by).toBe(user.id);
        expect(dbAcq.created_by).not.toBe(untrustedCreatorId);
      });
    });
  });

  describe('GET /api/acquisitions', () => {
    it('should return a list of acquisitions with joined relational data (200)', async () => {
      await createTestAcquisition({
        title: 'Listed Deal 1',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: user.id,
      });

      const res = await request(app).get('/api/acquisitions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(1);

      const item = res.body.data.find(a => a.title === 'Listed Deal 1');
      expect(item).toBeDefined();
      expect(item.company).toHaveProperty('name', company.name);
      expect(item.deal_stage).toHaveProperty('name', 'Draft');
      expect(item.creator).toHaveProperty('email', user.email);
    });
  });

  describe('GET /api/acquisitions/:id', () => {
    it('should return acquisition by ID with relational data (200)', async () => {
      const acq = await createTestAcquisition({
        title: 'Single Acq Lookup',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: user.id,
      });

      const res = await request(app).get(`/api/acquisitions/${acq.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(acq.id);
      expect(res.body.data.title).toBe('Single Acq Lookup');
      expect(res.body.data.company.id).toBe(company.id);
      expect(res.body.data.deal_stage.id).toBe(stages.draft.id);
    });

    it('should return 404 for non-existent acquisition ID', async () => {
      const res = await request(app).get('/api/acquisitions/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 400 for invalid ID parameter format', async () => {
      const res = await request(app).get('/api/acquisitions/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('PATCH /api/acquisitions/:id', () => {
    it('should update acquisition metadata successfully (200)', async () => {
      const acq = await createTestAcquisition({
        title: 'Pre-update Acquisition',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        estimated_value: 1000000,
      });

      const res = await request(app).patch(`/api/acquisitions/${acq.id}`).send({
        title: 'Post-update Acquisition',
        estimated_value: 2500000,
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Post-update Acquisition');
      expect(Number(res.body.data.estimated_value)).toBe(2500000);
    });

    it('should return 404 when updating non-existent acquisition', async () => {
      const res = await request(app)
        .patch('/api/acquisitions/9999999')
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 422 when updating to a non-existent company ID', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}`)
        .send({ company_id: 9999999 });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('error', 'Unprocessable Entity');
    });

    it('should return 400 when update body is empty', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('DELETE /api/acquisitions/:id', () => {
    it('should delete existing acquisition (200)', async () => {
      const acq = await createTestAcquisition({
        title: 'To Be Deleted Acquisition',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
      });

      const res = await request(app).delete(`/api/acquisitions/${acq.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Acquisition deleted successfully');

      const [dbAcq] = await db
        .select()
        .from(acquisitions)
        .where(eq(acquisitions.id, acq.id));

      expect(dbAcq).toBeUndefined();
    });

    it('should return 404 when deleting non-existent acquisition', async () => {
      const res = await request(app).delete('/api/acquisitions/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });
  });
});
