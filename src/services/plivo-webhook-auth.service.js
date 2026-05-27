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

const getPlivoAuthHeaderDebug = (headers = {}) => {
  const normalized = normalizeHeaders(headers);

  return {
    hasPlivoSignatureV3: Boolean(normalized['x-plivo-signature-v3']),
    hasPlivoSignatureMaV3: Boolean(normalized['x-plivo-signature-ma-v3']),
    hasPlivoSignatureNonce: Boolean(normalized['x-plivo-signature-v3-nonce']),
    plivoSignatureV3Preview: headerPreview(normalized['x-plivo-signature-v3']),
    plivoSignatureMaV3Preview: headerPreview(normalized['x-plivo-signature-ma-v3']),
    plivoNoncePreview: headerPreview(normalized['x-plivo-signature-v3-nonce'], 8),
    hasEventPilotVoiceSecret: Boolean(normalized['x-eventpilot-voice-secret']),
    eventPilotSecretPreview: headerPreview(normalized['x-eventpilot-voice-secret'], 4),
    contentType: normalized['content-type'] || null,
    userAgent: normalized['user-agent'] || null
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
  publicUrl,
  bodyParams
}) => {
  const headerDebug = getPlivoAuthHeaderDebug(headers);
  const signatureCheck = authMode === 'plivo-signature'
    ? tryValidatePlivoSignature({ headers, publicUrl, bodyParams })
    : { skipped: true };

  const voiceSecretConfigured = Boolean(env.voiceAiWebhookSecret);
  const normalized = normalizeHeaders(headers);
  const providedSecret = normalized['x-eventpilot-voice-secret'];

  logger.info('Plivo webhook auth debug', {
    route,
    authMode,
    publicUrl,
    plivoHeaders: headerDebug,
    plivoSignatureCheck: signatureCheck,
    voiceAiWebhook: {
      secretConfiguredOnServer: voiceSecretConfigured,
      secretHeaderSent: headerDebug.hasEventPilotVoiceSecret,
      secretMatches: voiceSecretConfigured
        ? providedSecret === env.voiceAiWebhookSecret
        : null
    },
    bodyKeys: Object.keys(bodyParams || {}),
    callUuid: bodyParams?.CallUUID
      || bodyParams?.callUuid
      || bodyParams?.call_uuid
      || bodyParams?.data?.object?.call_uuid,
    eventType: bodyParams?.eventType || bodyParams?.event_type || bodyParams?.Event,
    guestId: bodyParams?.guestId || bodyParams?.guest_id
  });

  return { headerDebug, signatureCheck };
};

const assertVoiceWebhookSecret = (headers = {}) => {
  if (!env.voiceAiWebhookSecret) {
    return { ok: true, skipped: true };
  }

  const normalized = normalizeHeaders(headers);
  const provided = normalized['x-eventpilot-voice-secret'];

  if (provided !== env.voiceAiWebhookSecret) {
    return { ok: false, reason: 'VOICE_WEBHOOK_UNAUTHORIZED' };
  }

  return { ok: true };
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
  tryValidatePlivoSignature
};
