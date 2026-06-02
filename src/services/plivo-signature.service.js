const crypto = require('crypto');
const env = require('../config/env');

const sign = (value, authToken) => crypto
  .createHmac('sha256', authToken)
  .update(value)
  .digest('base64');

const buildSortedQueryString = (searchParams) => {
  const entries = [...searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
};

const buildSortedPostParamString = (params = {}) => Object.keys(params)
  .sort()
  .map((key) => `${key}${params[key]}`)
  .join('');

/** Plivo v3 POST: {base}?{sorted_query}.{sorted_post_keyvalue}.{nonce} */
const buildPostSignaturePayload = (urlString, params, nonce) => {
  const parsed = new URL(urlString);
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  const queryString = buildSortedQueryString(parsed.searchParams);
  const postString = buildSortedPostParamString(params);

  let assembled = base;

  if (queryString) {
    assembled += `?${queryString}`;
  }

  if (postString) {
    assembled += `.${postString}`;
  }

  return `${assembled}.${nonce}`;
};

const signaturesMatch = (expected, headerValue = '') => headerValue
  .split(',')
  .map((signature) => signature.trim())
  .filter(Boolean)
  .some((signature) => {
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);

    return expectedBuffer.length === signatureBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  });

const validatePlivoSignature = ({ url, params, signature, mainAccountSignature, nonce }) => {
  if (!env.plivo.authToken) {
    throw new Error('PLIVO_AUTH_TOKEN is required to validate Plivo webhooks');
  }

  if (!signature && !mainAccountSignature) {
    return false;
  }

  if (!nonce) {
    return false;
  }

  const expected = sign(buildPostSignaturePayload(url, params, nonce), env.plivo.authToken);

  return signaturesMatch(expected, signature) || signaturesMatch(expected, mainAccountSignature);
};

module.exports = {
  validatePlivoSignature,
  buildPostSignaturePayload,
  buildSortedQueryString,
  buildSortedPostParamString
};
