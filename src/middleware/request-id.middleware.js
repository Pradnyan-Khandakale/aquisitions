import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  asyncLocalStorage,
} from '#utils/request-context.js';

/**
 * Middleware that establishes request correlation for every inbound request.
 * - Extracts valid incoming x-request-id or x-correlation-id, or generates a UUID.
 * - Sets the x-request-id response header.
 * - Attaches id to req.id and res.locals.requestId.
 * - Enters AsyncLocalStorage context so downstream logs automatically inherit the request ID.
 */
export const requestIdMiddleware = (req, res, next) => {
  const requestId = resolveRequestId(req);

  req.id = requestId;
  res.locals.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);

  asyncLocalStorage.run({ requestId }, () => {
    next();
  });
};

export default requestIdMiddleware;
