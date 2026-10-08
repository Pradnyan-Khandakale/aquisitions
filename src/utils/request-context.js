import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

// Regular expression to validate incoming request/correlation IDs
// Safe alphanumeric, hyphen, and underscore characters between 1 and 64 bytes
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

export const asyncLocalStorage = new AsyncLocalStorage();

/**
 * Validates whether a given request ID string is safe and valid.
 * @param {unknown} id
 * @returns {boolean}
 */
export const isValidRequestId = id => {
  return typeof id === 'string' && SAFE_REQUEST_ID_REGEX.test(id.trim());
};

/**
 * Generates a new RFC 4122 UUID v4 request ID.
 * @returns {string}
 */
export const generateRequestId = () => {
  return crypto.randomUUID();
};

/**
 * Resolves the request ID from an Express request:
 * Honors a valid incoming x-request-id or x-correlation-id header,
 * otherwise generates a new UUID.
 * @param {import('express').Request} req
 * @returns {string}
 */
export const resolveRequestId = req => {
  const incoming =
    req.headers?.[REQUEST_ID_HEADER] || req.headers?.[CORRELATION_ID_HEADER];

  if (typeof incoming === 'string' && isValidRequestId(incoming)) {
    return incoming.trim();
  }

  return generateRequestId();
};

/**
 * Retrieves the current request ID from AsyncLocalStorage store if active.
 * @returns {string | undefined}
 */
export const getRequestId = () => {
  const store = asyncLocalStorage.getStore();
  return store?.requestId;
};
