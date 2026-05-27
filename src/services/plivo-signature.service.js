const crypto = require('crypto');
const env = require('../config/env');

const sign = (value, authToken) => crypto
  .createHmac('sha256', authToken)
  .update(value)
  .digest('base64');

const buildPostSignaturePayload = (url, params, nonce) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');

  return `${url}.${sortedParams}.${nonce}`;
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
  validatePlivoSignature
};
