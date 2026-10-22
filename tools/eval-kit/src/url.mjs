const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.+\.localhost|(.+\.)?127\.0\.0\.1\.(nip|sslip)\.io)$/;

export class LoginError extends Error {
  constructor(step, message) {
    super(`${step}: ${message}`);
    this.step = step;
  }
}

export function checkUrl(url, step = 'url') {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new LoginError(step, `not a URL: ${url}`);
  }
  if (u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOST.test(u.hostname.toLowerCase()))) return u;
  throw new LoginError(step, `use https, or http only for a local host: ${url}`);
}
