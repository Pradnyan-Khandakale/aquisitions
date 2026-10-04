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

describe('Acquisition Lifecycle & Stage Transition Endpoints', () => {
  let owner;
  let ownerToken;
  let admin;
  let adminToken;
  let otherUser;
  let otherToken;
  let stages;
  let company;

  beforeEach(async () => {
    await cleanDatabase();
    stages = await seedDealStages();
    company = await createTestCompany({ name: 'Lifecycle Test Corp' });

    owner = await createTestUser({
      name: 'Deal Owner',
      email: 'owner@example.test',
      role: 'user',
    });
    ownerToken = getAuthToken(owner);

    admin = await createTestUser({
      name: 'System Admin',
      email: 'admin@example.test',
      role: 'admin',
    });
    adminToken = getAuthToken(admin);

    otherUser = await createTestUser({
      name: 'Other Regular User',
      email: 'other@example.test',
      role: 'user',
    });
    otherToken = getAuthToken(otherUser);
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('PATCH /api/acquisitions/:id/stage', () => {
    it('should allow deal owner to transition sequentially (Draft -> Review)', async () => {
      const acq = await createTestAcquisition({
        title: 'Sequential Forward Deal',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: owner.id,
        estimated_value: 1000000,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          targetStageId: stages.review.id,
          notes: 'Moving from Draft to Review stage',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deal_stage.id).toBe(stages.review.id);
      expect(res.body.data.deal_stage.name).toBe('Review');
      expect(res.body.transition.from_stage.name).toBe('Draft');
      expect(res.body.transition.to_stage.name).toBe('Review');
      expect(res.body.transition.transitioned_by.id).toBe(owner.id);
      expect(res.body.transition.notes).toBe(
        'Moving from Draft to Review stage'
      );

      // Verify in DB
      const [updated] = await db
        .select()
        .from(acquisitions)
        .where(eq(acquisitions.id, acq.id));
      expect(updated.deal_stage_id).toBe(stages.review.id);
    });

    it('should allow admin to transition any acquisition', async () => {
      const acq = await createTestAcquisition({
        title: 'Admin Transition Deal',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: owner.id,
        estimated_value: 2000000,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          target_stage_id: stages.review.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.deal_stage.id).toBe(stages.review.id);
      expect(res.body.transition.transitioned_by.id).toBe(admin.id);
    });

    it('should reject unauthenticated transition with 401 Unauthorized', async () => {
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

    it('should reject non-owner/non-admin user with 403 Forbidden', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: owner.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ targetStageId: stages.review.id });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('error', 'Forbidden');
      expect(res.body.message).toMatch(/not authorized/i);
    });

    it('should reject invalid jump (Draft -> Negotiation skipping Review & Due Diligence) with 409', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: owner.id,
        estimated_value: 1000000,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: stages.negotiation.id });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(
        /cannot jump from 'draft' to 'negotiation'/i
      );
    });

    it('should reject backward transition (Review -> Draft) with 409', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.review.id,
        created_by: owner.id,
        estimated_value: 1000000,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: stages.draft.id });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(/backward transition.*not permitted/i);
    });

    it('should allow rejection transition from any active stage directly to Rejected stage', async () => {
      const acq = await createTestAcquisition({
        title: 'Deal to be Rejected',
        company_id: company.id,
        deal_stage_id: stages.review.id,
        created_by: owner.id,
        status: 'active',
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          targetStageId: stages.rejected.id,
          notes: 'Found critical legal risks during review',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.deal_stage.name).toBe('Rejected');
      expect(res.body.data.status).toBe('lost');
    });

    it('should reject transitioning away from a terminal stage (Rejected or Closed) with 409', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.rejected.id,
        created_by: owner.id,
        status: 'lost',
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: stages.review.id });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(
        /cannot transition acquisition from terminal stage/i
      );
    });

    it('should reject same-stage transition with 409 Conflict', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.review.id,
        created_by: owner.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: stages.review.id });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(/already in stage/i);
    });

    it('should reject transition to closing/approval stage when estimated valuation is missing or 0 with 422', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.negotiation.id,
        created_by: owner.id,
        estimated_value: null,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: stages.approved.id });

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('error', 'Unprocessable Entity');
      expect(res.body.message).toMatch(/without a valid estimated valuation/i);
    });

    it('should return 404 when target stage does not exist', async () => {
      const acq = await createTestAcquisition({
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: owner.id,
      });

      const res = await request(app)
        .patch(`/api/acquisitions/${acq.id}/stage`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: 9999999 });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 404 when acquisition does not exist', async () => {
      const res = await request(app)
        .patch('/api/acquisitions/9999999/stage')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ targetStageId: stages.review.id });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });
  });

  describe('Critical Bypass Test (Section 17)', () => {
    it('should block attempts to bypass lifecycle validation via generic PATCH /api/acquisitions/:id', async () => {
      const acq = await createTestAcquisition({
        title: 'Bypass Attempt Deal',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
        created_by: owner.id,
      });

      // Attempt generic update with deal_stage_id
      const res1 = await request(app)
        .patch(`/api/acquisitions/${acq.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          deal_stage_id: stages.closed.id,
        });

      expect(res1.status).toBe(400);
      expect(res1.body).toHaveProperty('error', 'Bad Request');
      expect(res1.body.message).toMatch(
        /Stage changes cannot be performed via generic update/i
      );

      // Attempt generic update with dealStageId
      const res2 = await request(app)
        .patch(`/api/acquisitions/${acq.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          dealStageId: stages.closed.id,
        });

      expect(res2.status).toBe(400);
      expect(res2.body).toHaveProperty('error', 'Bad Request');
      expect(res2.body.message).toMatch(
        /Stage changes cannot be performed via generic update/i
      );

      // Verify stage remained unchanged in database
      const [dbAcq] = await db
        .select()
        .from(acquisitions)
        .where(eq(acquisitions.id, acq.id));

      expect(dbAcq.deal_stage_id).toBe(stages.draft.id);
    });
  });
});
