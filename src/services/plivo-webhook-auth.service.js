const env = require('../config/env');
const { validatePlivoSignature } = require('./plivo-signature.service');
const logger = require('../utils/logger');

const normalizeHeaders = (headers = {}) => Object.entries(headers).reduce((acc, [key, value]) => {
  acc[key.toLowerCase()] = value;
  return acc;
}, {});

const headerPreview = (value, visible = 10) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  if (value.length <= visible) {
    return `[len=${value.length}]`;
  }

  return `${value.slice(0, visible)}…[len=${value.length}]`;
};

const isPlivoPlatformEventPayload = (body = {}) => Boolean(
  body?.created_at && body?.data && body?.id
);

/** Routes that receive Plivo-managed event callbacks (often cannot set custom headers). */
const PLATFORM_CALLBACK_ROUTES = new Set(['ai/hangup', 'ai/transcript', 'ai/error']);

const normalizeAuthValue = (value) => {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim().replace(/^["']|["']$/g, '');
};

const getVoiceWebhookHeader = (headers = {}, query = {}) => {
  const normalized = normalizeHeaders(headers);

  const headerValue = normalized['x-eventpilot-voice-secret']
    || normalized['x-eventpilot-voi']
    || Object.entries(normalized).find(([key]) => key.startsWith('x-eventpilot-voi'))?.[1];

  return headerValue || query.voice_secret || query.voiceSecret || null;
};

const canUsePlatformCallbackAuth = ({ route, body }) => (
  PLATFORM_CALLBACK_ROUTES.has(route) && isPlivoPlatformEventPayload(body)
);

const getPlivoAuthHeaderDebug = (headers = {}, query = {}) => {
  const normalized = normalizeHeaders(headers);
  const voiceHeader = getVoiceWebhookHeader(headers, query);

  return {
    hasPlivoSignatureV3: Boolean(normalized['x-plivo-signature-v3']),
    hasPlivoSignatureMaV3: Boolean(normalized['x-plivo-signature-ma-v3']),
    hasPlivoSignatureNonce: Boolean(normalized['x-plivo-signature-v3-nonce']),
    plivoSignatureV3Preview: headerPreview(normalized['x-plivo-signature-v3']),
    plivoSignatureMaV3Preview: headerPreview(normalized['x-plivo-signature-ma-v3']),
    plivoNoncePreview: headerPreview(normalized['x-plivo-signature-v3-nonce'], 8),
    hasVoiceWebhookHeader: Boolean(voiceHeader),
    voiceWebhookHeaderPreview: headerPreview(voiceHeader, 4),
    hasQueryVoiceAuth: Boolean(query.voice_secret || query.voiceSecret),
    contentType: normalized['content-type'] || null,
    userAgent: normalized['user-agent'] || null,
    isPlatformEventPayload: false
  };
};

const tryValidatePlivoSignature = ({ headers, publicUrl, bodyParams }) => {
  const normalized = normalizeHeaders(headers);
  const signature = normalized['x-plivo-signature-v3'];
  const mainAccountSignature = normalized['x-plivo-signature-ma-v3'];
  const nonce = normalized['x-plivo-signature-v3-nonce'];

  if (!signature && !mainAccountSignature) {
    return { attempted: false, valid: null, reason: 'no_plivo_signature_headers' };
  }

  if (!nonce) {
    return { attempted: true, valid: false, reason: 'missing_nonce' };
  }

  if (!env.plivo.authToken) {
    return { attempted: true, valid: false, reason: 'plivo_auth_token_not_configured' };
  }

  try {
    const valid = validatePlivoSignature({
      url: publicUrl,
      params: bodyParams || {},
      signature,
      mainAccountSignature,
      nonce
    });

    return {
      attempted: true,
      valid,
      reason: valid ? 'ok' : 'signature_mismatch'
    };
  } catch (error) {
    return {
      attempted: true,
      valid: false,
      reason: error.message
    };
  }
};

const logPlivoWebhookAuthDebug = ({
  route,
  authMode,
  headers,
  query = {},
  publicUrl,
  bodyParams,
  rawBodyLength = 0
}) => {
  const headerDebug = getPlivoAuthHeaderDebug(headers, query);
  headerDebug.isPlatformEventPayload = isPlivoPlatformEventPayload(bodyParams);

  const signatureCheck = authMode === 'plivo-signature'
    ? tryValidatePlivoSignature({ headers, publicUrl, bodyParams })
    : { skipped: true };

  const voiceHeader = getVoiceWebhookHeader(headers, query);
  const serverConfigured = Boolean(env.voiceAiWebhookSecret);
  const normalizedProvided = normalizeAuthValue(voiceHeader);
  const normalizedExpected = normalizeAuthValue(env.voiceAiWebhookSecret);
  const authOk = !serverConfigured
    || normalizedProvided === normalizedExpected
    || canUsePlatformCallbackAuth({ route, body: bodyParams });

  logger.info('Plivo webhook auth debug', {
    route,
    authMode,
    publicUrl,
    rawBodyLength,
    plivoHeaders: headerDebug,
    plivoSignatureCheck: signatureCheck,
    voiceWebhookAuth: {
      serverConfigured,
      headerPresent: Boolean(voiceHeader),
      headerMatches: serverConfigured ? normalizedProvided === normalizedExpected : null,
      providedLength: normalizedProvided.length,
      expectedLength: normalizedExpected.length,
      queryAuthPresent: Boolean(query.voice_secret || query.voiceSecret),
      platformCallbackBypass: canUsePlatformCallbackAuth({ route, body: bodyParams }),
      authOk
    },
    bodyKeys: Object.keys(bodyParams || {}),
    callUuid: bodyParams?.CallUUID
      || bodyParams?.callUuid
      || bodyParams?.call_uuid
      || bodyParams?.data?.object?.call_uuid,
    eventType: bodyParams?.eventType || bodyParams?.event_type || bodyParams?.Event,
    guestId: bodyParams?.guestId || bodyParams?.guest_id
  });

  return { headerDebug, signatureCheck, authOk };
};

const assertVoiceWebhookSecret = ({ headers = {}, query = {}, route, body } = {}) => {
  if (!env.voiceAiWebhookSecret) {
    return { ok: true, skipped: true, method: 'none' };
  }

  if (canUsePlatformCallbackAuth({ route, body })) {
    return { ok: true, skipped: true, method: 'plivo_platform_event' };
  }

  const provided = getVoiceWebhookHeader(headers, query);
  const normalizedProvided = normalizeAuthValue(provided);
  const normalizedExpected = normalizeAuthValue(env.voiceAiWebhookSecret);

  if (normalizedProvided === normalizedExpected) {
    return { ok: true, method: provided === query.voice_secret || provided === query.voiceSecret ? 'query' : 'header' };
  }

  return {
    ok: false,
    reason: 'VOICE_WEBHOOK_UNAUTHORIZED',
    debug: {
      headerPresent: Boolean(normalizedProvided),
      providedLength: normalizedProvided.length,
      expectedLength: normalizedExpected.length
    }
  };
};

const assertPlivoSignature = ({ headers, publicUrl, bodyParams }) => {
  const check = tryValidatePlivoSignature({ headers, publicUrl, bodyParams });

  if (!check.attempted) {
    return { ok: false, reason: 'PLIVO_SIGNATURE_MISSING' };
  }

  if (!check.valid) {
    return { ok: false, reason: 'PLIVO_SIGNATURE_INVALID', detail: check.reason };
  }

  return { ok: true };
};

module.exports = {
  assertVoiceWebhookSecret,
  assertPlivoSignature,
  normalizeHeaders,
  getPlivoAuthHeaderDebug,
  logPlivoWebhookAuthDebug,
  tryValidatePlivoSignature,
  isPlivoPlatformEventPayload,
  canUsePlatformCallbackAuth
};
