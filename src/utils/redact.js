const SENSITIVE_KEY_REGEX =
  /^(password|pass|newpassword|currentpassword|passwd|secret|jwt_secret|token|accesstoken|refreshtoken|cookie|authorization|apikey|api_key|arcjet_key|arcjetkey|database_url|db_password|credential|sessionsecret|credentials)$/i;

const STRING_PATTERNS = [
  // PostgreSQL / Database URLs with user:password
  {
    regex: /postgres(?:ql)?:\/\/([^:@\s]+):([^@\s]+)@([^\s"'<>]+)/gi,
    replacement: 'postgresql://$1:[REDACTED]@$3',
  },
  // JWT tokens (eyJ...)
  {
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\b/g,
    replacement: '[REDACTED_JWT]',
  },
  // Arcjet keys
  {
    regex: /\bajkey_[A-Za-z0-9_-]+\b/g,
    replacement: '[REDACTED_ARCJET_KEY]',
  },
  // Bearer tokens
  {
    regex: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
    replacement: 'Bearer [REDACTED]',
  },
  // Cookie values
  {
    regex: /\btoken=[^;\s]+/gi,
    replacement: 'token=[REDACTED]',
  },
  // Bcrypt password hashes
  {
    regex: /\$2[aby]\$[0-9]{2}\$[A-Za-z0-9./]{53}/g,
    replacement: '[REDACTED_HASH]',
  },
];

/**
 * Sanitizes sensitive strings matching known secret patterns.
 * @param {string} str
 * @returns {string}
 */
export const redactString = str => {
  if (typeof str !== 'string') return str;
  let result = str;
  for (const { regex, replacement } of STRING_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
};

/**
 * Recursively redacts sensitive values from objects, arrays, and errors.
 * Handles circular references safely and never mutates input.
 * @param {unknown} value
 * @param {WeakSet<object>} seen
 * @returns {unknown}
 */
export const redact = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return redactString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  // Handle Error instances specially
  if (value instanceof Error) {
    const errorCopy = {
      name: value.name,
      message: redactString(value.message),
      ...(value.stack ? { stack: redactString(value.stack) } : {}),
      ...(value.code ? { code: value.code } : {}),
      ...(value.status ? { status: value.status } : {}),
      ...(value.statusCode ? { statusCode: value.statusCode } : {}),
    };

    // Copy any custom enumerable properties
    for (const key of Object.keys(value)) {
      if (!(key in errorCopy)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
          errorCopy[key] = '[REDACTED]';
        } else {
          errorCopy[key] = redact(value[key], seen);
        }
      }
    }
    return errorCopy;
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map(item => redact(item, seen));
  }

  // Handle plain objects
  const redactedObj = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      redactedObj[key] = '[REDACTED]';
    } else {
      redactedObj[key] = redact(val, seen);
    }
  }

  // Preserve object Symbol properties (essential for Winston metadata/formatting symbols)
  for (const sym of Object.getOwnPropertySymbols(value)) {
    redactedObj[sym] = value[sym];
  }

  return redactedObj;
};

export default redact;
