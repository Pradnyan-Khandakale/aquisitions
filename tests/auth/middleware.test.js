import {
  authenticate,
  optionalAuthenticate,
} from '#middleware/auth.middleware.js';
import { jwttoken } from '#utils/jwt.js';
import jwt from 'jsonwebtoken';

describe('Auth Middleware Tests', () => {
  const secret =
    process.env.JWT_SECRET || 'test-jwt-secret-key-for-automated-tests';

  describe('authenticate() middleware', () => {
    it('should return 401 if no token is provided', () => {
      const req = {
        cookies: {},
        headers: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: expect.stringContaining('Authentication required'),
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is invalid/tampered', () => {
      const req = {
        cookies: { token: 'invalid.tampered.token' },
        headers: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 if token is expired', () => {
      const expiredToken = jwt.sign(
        { id: 1, email: 'expired@example.test', role: 'user' },
        secret,
        { expiresIn: '-1s' }
      );

      const req = {
        cookies: { token: expiredToken },
        headers: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should populate req.user and call next() when valid token is in cookie', () => {
      const validToken = jwttoken.sign({
        id: 42,
        email: 'cookie.user@example.test',
        role: 'user',
      });

      const req = {
        cookies: { token: validToken },
        headers: {},
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(42);
      expect(req.user.email).toBe('cookie.user@example.test');
      expect(req.user.role).toBe('user');
    });

    it('should populate req.user and call next() when valid token is in Authorization: Bearer header', () => {
      const validToken = jwttoken.sign({
        id: 99,
        email: 'bearer.user@example.test',
        role: 'admin',
      });

      const req = {
        cookies: {},
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(99);
      expect(req.user.email).toBe('bearer.user@example.test');
      expect(req.user.role).toBe('admin');
    });
  });

  describe('optionalAuthenticate() middleware', () => {
    it('should call next() without setting req.user when no token is present', () => {
      const req = {
        cookies: {},
        headers: {},
      };
      const res = {};
      const next = jest.fn();

      optionalAuthenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeUndefined();
    });

    it('should call next() without setting req.user when token is invalid', () => {
      const req = {
        cookies: { token: 'bogus.invalid.jwt' },
        headers: {},
      };
      const res = {};
      const next = jest.fn();

      optionalAuthenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeUndefined();
    });

    it('should populate req.user when a valid token is provided', () => {
      const validToken = jwttoken.sign({
        id: 15,
        email: 'optional@example.test',
        role: 'user',
      });

      const req = {
        cookies: {},
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      };
      const res = {};
      const next = jest.fn();

      optionalAuthenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(15);
      expect(req.user.email).toBe('optional@example.test');
    });
  });
});
