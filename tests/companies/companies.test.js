import request from 'supertest';
import app from '#src/app.js';
import { db } from '#config/database.js';
import { companies } from '#models/company.model.js';
import { acquisitions } from '#models/acquisition.model.js';
import { eq } from 'drizzle-orm';
import {
  cleanDatabase,
  createTestCompany,
  seedDealStages,
  createTestAcquisition,
} from '../helpers/db.helper.js';

describe('Company API Endpoints', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
  });

  describe('POST /api/companies', () => {
    it('should create a new company with valid payload (201)', async () => {
      const payload = {
        name: 'Acme Holdings Corp',
        description: 'Global enterprise software conglomerate',
        industry: 'Enterprise Software',
        website: 'https://acmeholdings.test',
      };

      const res = await request(app).post('/api/companies').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Company created successfully');
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Acme Holdings Corp');
      expect(res.body.data.industry).toBe('Enterprise Software');
    });

    it('should fail with 400 when name is missing', async () => {
      const res = await request(app).post('/api/companies').send({
        description: 'No name provided',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
      expect(res.body).toHaveProperty('details');
    });

    it('should fail with 409 when company name is duplicate', async () => {
      await createTestCompany({ name: 'Unique Name Co' });

      const res = await request(app).post('/api/companies').send({
        name: 'Unique Name Co',
        industry: 'Finance',
      });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should fail with 400 when field format is invalid (oversized string)', async () => {
      const oversizedName = 'A'.repeat(300);

      const res = await request(app).post('/api/companies').send({
        name: oversizedName,
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('GET /api/companies', () => {
    it('should return a list of companies with count (200)', async () => {
      await createTestCompany({ name: 'Alpha Tech' });
      await createTestCompany({ name: 'Beta Cloud' });

      const res = await request(app).get('/api/companies');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some(c => c.name === 'Alpha Tech')).toBe(true);
      expect(res.body.data.some(c => c.name === 'Beta Cloud')).toBe(true);
    });
  });

  describe('GET /api/companies/:id', () => {
    it('should return company details for existing ID (200)', async () => {
      const company = await createTestCompany({ name: 'Target Details Co' });

      const res = await request(app).get(`/api/companies/${company.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(company.id);
      expect(res.body.data.name).toBe('Target Details Co');
    });

    it('should return 404 for non-existent company ID', async () => {
      const res = await request(app).get('/api/companies/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 400 for invalid ID parameter format', async () => {
      const res = await request(app).get('/api/companies/abc-invalid');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });
  });

  describe('PATCH /api/companies/:id', () => {
    it('should partially update an existing company (200)', async () => {
      const company = await createTestCompany({
        name: 'Original Name',
        industry: 'Logistics',
      });

      const res = await request(app)
        .patch(`/api/companies/${company.id}`)
        .send({
          industry: 'Modern Logistics',
          website: 'https://modernlogistics.test',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Original Name');
      expect(res.body.data.industry).toBe('Modern Logistics');
      expect(res.body.data.website).toBe('https://modernlogistics.test');
    });

    it('should return 400 when update payload is empty', async () => {
      const company = await createTestCompany({ name: 'Empty Payload Co' });

      const res = await request(app)
        .patch(`/api/companies/${company.id}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error', 'Validation failed');
    });

    it('should return 404 when updating non-existent company', async () => {
      const res = await request(app)
        .patch('/api/companies/9999999')
        .send({ name: 'Does Not Exist' });

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should return 409 when update causes duplicate company name', async () => {
      await createTestCompany({ name: 'Existing Co A' });
      const companyB = await createTestCompany({ name: 'Existing Co B' });

      const res = await request(app)
        .patch(`/api/companies/${companyB.id}`)
        .send({ name: 'Existing Co A' });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error', 'Conflict');
    });
  });

  describe('DELETE /api/companies/:id', () => {
    it('should delete an existing company (200)', async () => {
      const company = await createTestCompany({ name: 'To Be Deleted Co' });

      const res = await request(app).delete(`/api/companies/${company.id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Company deleted successfully');

      // Verify deletion in database
      const [dbCompany] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, company.id));

      expect(dbCompany).toBeUndefined();
    });

    it('should return 404 when deleting non-existent company', async () => {
      const res = await request(app).delete('/api/companies/9999999');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error', 'Not Found');
    });

    it('should cascade delete associated acquisitions when company is deleted', async () => {
      const stages = await seedDealStages();
      const company = await createTestCompany({ name: 'Cascade Parent Co' });

      const acq = await createTestAcquisition({
        title: 'Acquisition Under Cascade Co',
        company_id: company.id,
        deal_stage_id: stages.draft.id,
      });

      // Verify acquisition exists
      const [beforeAcq] = await db
        .select()
        .from(acquisitions)
        .where(eq(acquisitions.id, acq.id));
      expect(beforeAcq).toBeDefined();

      // Delete the company
      const res = await request(app).delete(`/api/companies/${company.id}`);
      expect(res.status).toBe(200);

      // Verify acquisition was cascade deleted
      const [afterAcq] = await db
        .select()
        .from(acquisitions)
        .where(eq(acquisitions.id, acq.id));
      expect(afterAcq).toBeUndefined();
    });
  });
});
