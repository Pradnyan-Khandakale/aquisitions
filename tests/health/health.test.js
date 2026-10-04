import { jest } from '@jest/globals';
import request from 'supertest';
import app from '#src/app.js';
import { db } from '#config/database.js';

describe('Health Probe Endpoints', () => {
  describe('GET /health/live', () => {
    it('should return 200 OK with liveness probe payload', async () => {
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'OK');
      expect(res.body).toHaveProperty('uptime');
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /health', () => {
    it('should return 200 OK for backward-compatible health alias', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'OK');
      expect(res.body).toHaveProperty('uptime');
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 READY when database is connected', async () => {
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'READY');
      expect(res.body).toHaveProperty('database', 'connected');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return 503 NOT_READY when database connection fails', async () => {
      // Mock db.execute to simulate a database outage
      const dbSpy = jest
        .spyOn(db, 'execute')
        .mockRejectedValueOnce(new Error('Connection lost'));

      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toHaveProperty('status', 'NOT_READY');
      expect(res.body).toHaveProperty('database', 'disconnected');
      expect(res.body).toHaveProperty('error', 'Connection lost');

      dbSpy.mockRestore();
    });
  });
});
