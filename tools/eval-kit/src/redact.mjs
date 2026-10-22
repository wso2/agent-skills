const JWT = /eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
const TOKEN_FIELD = /("?(?:access|refresh|id)_?token"?\s*[:=]\s*"?)[A-Za-z0-9._~+/=-]{8,}/gi;

export function redact(value) {
  const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return text.replace(JWT, '[REDACTED-JWT]').replace(BEARER, '$1[REDACTED]').replace(TOKEN_FIELD, '$1[REDACTED]');
}

export function clip(value, limit, full = false) {
  const text = redact(value);
  return full || text.length <= limit ? text : `${text.slice(0, limit)}... [${text.length - limit} more]`;
}
