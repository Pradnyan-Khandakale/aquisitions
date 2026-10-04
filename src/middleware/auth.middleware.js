import { jwttoken } from '#utils/jwt.js';
import { cookies } from '#utils/cookies.js';

export const authenticate = (req, res, next) => {
  try {
    const token =
      cookies.get(req, 'token') ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in or provide a Bearer token.',
      });
    }

    const decoded = jwttoken.verify(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
};

export const optionalAuthenticate = (req, res, next) => {
  try {
    const token =
      cookies.get(req, 'token') ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.split(' ')[1]
        : null);

    if (token) {
      const decoded = jwttoken.verify(token);
      req.user = decoded;
    }
  } catch (err) {
    // If token is invalid or expired, continue without setting req.user
  }
  next();
};
