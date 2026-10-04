import request from 'supertest';
import app from '#src/app.js';
import { db } from '#config/database.js';
import { deal_stages } from '#models/deal-stage.model.js';
import { eq } from 'drizzle-orm';
import {
  cleanDatabase,
  createTestDealStage,
  createTestCompany,
  createTestAcquisition,
} from '../helpers/db.helper.js';

describe('Deal Stage API Endpoints', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('POST /api/deal-stages', () => {
    it('should create a new deal stage with valid payload (201)', async () => {
      const payload = {
        name: 'Initial Contact',
        description: 'First discussion with founders',
        sequence: 5,
      };

      const res = await request(app).post('/api/deal-stages').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Deal stage created successfully');
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Initial Contact');
      expect(res.body.data.sequence).toBe(5);
    });

    it('should reject duplicate stage name with 409 Conflict', async () => {
      await createTestDealStage({ name: 'Unique Stage', sequence: 10 });

      const res = await request(app).post('/api/deal-stages').send({
        name: 'Unique Stage',
        sequence: 20,
      });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject missing name with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/deal-stages')
        .send({ sequence: 10 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('GET /api/deal-stages', () => {
    it('should return deal stages ordered by sequence ascending (200)', async () => {
      await createTestDealStage({ name: 'Stage 30', sequence: 30 });
      await createTestDealStage({ name: 'Stage 10', sequence: 10 });
      await createTestDealStage({ name: 'Stage 20', sequence: 20 });

      const res = await request(app).get('/api/deal-stages');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(3);

      const seqs = res.body.data.map(s => s.sequence);
      for (let i = 1; i < seqs.length; i++) {
        expect(seqs[i]).toBeGreaterThanOrEqual(seqs[i - 1]);
      }
    });
  });

  describe('GET /api/deal-stages/:id', () => {
    it('should return stage details for an existing ID (200)', async () => {
      const stage = await createTestDealStage({
        name: 'Single Stage',
        sequence: 15,
      });

      const res = await request(app).get(`/api/deal-stages/${stage.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(stage.id);
      expect(res.body.data.name).toBe('Single Stage');
    });

    it('should return 404 for non-existent stage ID', async () => {
      const res = await request(app).get('/api/deal-stages/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 400 for invalid ID format', async () => {
      const res = await request(app).get('/api/deal-stages/not-a-number');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('PATCH /api/deal-stages/:id', () => {
    it('should update stage sequence and description (200)', async () => {
      const stage = await createTestDealStage({
        name: 'Editable Stage',
        sequence: 10,
      });

      const res = await request(app)
        .patch(`/api/deal-stages/${stage.id}`)
        .send({
          description: 'Updated description for stage',
          sequence: 12,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sequence).toBe(12);
      expect(res.body.data.description).toBe('Updated description for stage');
    });

    it('should return 409 when update creates duplicate name conflict', async () => {
      await createTestDealStage({ name: 'Existing Stage One' });
      const stageTwo = await createTestDealStage({
        name: 'Existing Stage Two',
      });

      const res = await request(app)
        .patch(`/api/deal-stages/${stageTwo.id}`)
        .send({ name: 'Existing Stage One' });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
    });

    it('should return 404 when updating non-existent stage', async () => {
      const res = await request(app)
        .patch('/api/deal-stages/9999999')
        .send({ name: 'Ghost Stage' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 400 when update payload is empty', async () => {
      const stage = await createTestDealStage({ name: 'No Update Stage' });

      const res = await request(app)
        .patch(`/api/deal-stages/${stage.id}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('DELETE /api/deal-stages/:id', () => {
    it('should delete an unused deal stage (200)', async () => {
      const stage = await createTestDealStage({ name: 'Unused Stage' });

      const res = await request(app).delete(`/api/deal-stages/${stage.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Deal stage deleted successfully');

      const [dbStage] = await db
        .select()
        .from(deal_stages)
        .where(eq(deal_stages.id, stage.id));

      expect(dbStage).toBeUndefined();
    });

    it('should return 404 when deleting non-existent deal stage', async () => {
      const res = await request(app).delete('/api/deal-stages/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should protect against deleting a stage currently in use by an acquisition (409)', async () => {
      const company = await createTestCompany();
      const inUseStage = await createTestDealStage({
        name: 'In Use Stage',
        sequence: 25,
      });

      await createTestAcquisition({
        title: 'Active Deal In Stage',
        company_id: company.id,
        deal_stage_id: inUseStage.id,
      });

      const res = await request(app).delete(
        `/api/deal-stages/${inUseStage.id}`
      );

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(/currently in use/i);

      // Verify deal stage was NOT deleted
      const [stillExisting] = await db
        .select()
        .from(deal_stages)
        .where(eq(deal_stages.id, inUseStage.id));

      expect(stillExisting).toBeDefined();
    });
  });
});
