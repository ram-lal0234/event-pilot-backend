const parseBody = (event) => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';

  const headers = normalizeHeaders(event.headers || {});
  const contentType = headers['content-type'] || '';

  if (!rawBody) {
    return {};
  }

  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody);
  }

  return Object.fromEntries(new URLSearchParams(rawBody));
};

const normalizeHeaders = (headers = {}) => Object.entries(headers).reduce((acc, [key, value]) => {
  acc[key.toLowerCase()] = value;
  return acc;
}, {});

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

const getPublicUrl = (event) => {
  const headers = normalizeHeaders(event.headers || {});
  const proto = headers['x-forwarded-proto'] || 'https';
  const host = headers.host || event.requestContext?.domainName;
  const path = event.rawPath || event.requestContext?.http?.path || '';
  const query = event.rawQueryString ? `?${event.rawQueryString}` : '';

  return `${proto}://${host}${path}${query}`;
};

module.exports = {
  parseBody,
  normalizeHeaders,
  response,
  getPublicUrl
};
