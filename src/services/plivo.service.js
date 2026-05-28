const env = require('../config/env');
const {
  formatPhoneForPlivo,
  inferDefaultCountryCode,
  validateE164,
  validateIndianMobileE164
} = require('../utils/phone.util');
const logger = require('../utils/logger');

const appendQuery = (url, params) => {
  const nextUrl = new URL(url);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      nextUrl.searchParams.set(key, String(value));
    }
  });

  return nextUrl.toString();
};

const getPlivoAuthHeader = () => {
  const credentials = Buffer.from(`${env.plivo.authId}:${env.plivo.authToken}`).toString('base64');
  return `Basic ${credentials}`;
};

const getWebhookUrl = (params = {}) => {
  if (env.plivo.webhookUrl) {
    return appendQuery(env.plivo.webhookUrl, params);
  }

  if (env.publicApiUrl) {
    return appendQuery(`${env.publicApiUrl.replace(/\/$/, '')}/webhook/plivo`, params);
  }

  return undefined;
};

/** e.g. getPlivoAiWebhookUrl('ai/rsvp', { guestId }) → {PUBLIC_API_URL}/webhook/plivo/ai/rsvp?guestId=... */
const getPlivoAiWebhookUrl = (subpath, params = {}) => {
  if (!env.publicApiUrl) {
    return '';
  }

  const normalized = String(subpath || '').replace(/^\/+/, '');
  const base = `${env.publicApiUrl.replace(/\/$/, '')}/webhook/plivo/${normalized}`;
  return appendQuery(base, params);
};

const getIvrAnswerUrl = ({ callId, guestId }) => {
  let base = env.plivo.ivrAnswerUrl || env.plivo.answerUrl;

  if (!base && env.publicApiUrl) {
    base = `${env.publicApiUrl.replace(/\/$/, '')}/webhook/plivo/ivr/answer`;
  }

  if (!base) {
    throw new Error(
      'Plivo IVR answer URL is not configured. Set PLIVO_IVR_ANSWER_URL or PUBLIC_API_URL for /webhook/plivo/ivr/answer.'
    );
  }

  return appendQuery(base, { callId, guestId });
};

const assertConfigured = (callMode = 'ivr') => {
  if (!env.plivo.authId || !env.plivo.authToken || !env.plivo.fromNumber) {
    throw new Error('Plivo is not configured. Set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, and PLIVO_FROM_NUMBER.');
  }

  if (callMode === 'ai') {
    if (!env.plivo.aiAnswerUrl) {
      throw new Error('Plivo AI Agent Flow URL is not configured. Set PLIVO_AI_ANSWER_URL.');
    }
    return;
  }

  if (!env.plivo.ivrAnswerUrl && !env.plivo.answerUrl) {
    throw new Error('Plivo IVR answer URL is not configured. Set PLIVO_IVR_ANSWER_URL or PLIVO_ANSWER_URL.');
  }
};

const validateAgentFlowPayload = (payload) => {
  if (!payload.guest_id?.trim()) {
    throw new Error('Agent Flow payload requires guest_id');
  }

  if (!payload.phone_number || !validateIndianMobileE164(payload.phone_number)) {
    throw new Error(
      `Agent Flow phone_number must be India mobile E.164 +91XXXXXXXXXX (got: ${payload.phone_number || 'empty'})`
    );
  }

  if (!payload.from_number || !validateE164(payload.from_number)) {
    throw new Error(
      `Agent Flow from_number must be valid E.164 (got: ${payload.from_number || 'empty'})`
    );
  }

  if (typeof payload.transport_enabled !== 'boolean') {
    throw new Error('Agent Flow payload requires transport_enabled to be a boolean');
  }

  if (typeof payload.hotel_enabled !== 'boolean') {
    throw new Error('Agent Flow payload requires hotel_enabled to be a boolean');
  }
};

const buildAgentFlowPayload = (agentContext = {}) => {
  const phoneOptions = { defaultCountryCode: inferDefaultCountryCode(env.plivo.fromNumber) };

  if (typeof agentContext.transport_enabled !== 'boolean') {
    throw new Error('Agent context transport_enabled must be a boolean');
  }

  if (typeof agentContext.hotel_enabled !== 'boolean') {
    throw new Error('Agent context hotel_enabled must be a boolean');
  }

  return {
    call_id: String(agentContext.call_id || ''),
    guest_id: String(agentContext.guest_id || ''),
    guest_name: String(agentContext.guest_name || ''),
    phone_number: formatPhoneForPlivo(agentContext.phone_number, {
      ...phoneOptions,
      requireIndianMobile: true
    }),
    // Always use configured Plivo caller ID (avoids mismatch with queued agentContext).
    from_number: formatPhoneForPlivo(env.plivo.fromNumber, {
      ...phoneOptions,
      requireIndianMobile: false
    }),
    event_name: String(agentContext.event_name || ''),
    event_date_spoken: String(agentContext.event_date_spoken || ''),
    event_location_spoken: String(agentContext.event_location_spoken || ''),
    host_label: String(agentContext.host_label || ''),
    existing_pickup_location: agentContext.existing_pickup_location
      ? String(agentContext.existing_pickup_location)
      : '',
    transport_enabled: agentContext.transport_enabled === true,
    hotel_enabled: agentContext.hotel_enabled === true,
    rsvp_webhook_url: String(
      agentContext.rsvp_webhook_url || getPlivoAiWebhookUrl('ai/rsvp')
    ),
    hangup_webhook_url: String(
      agentContext.hangup_webhook_url || getPlivoAiWebhookUrl('ai/hangup')
    ),
    transcript_webhook_url: String(
      agentContext.transcript_webhook_url || getPlivoAiWebhookUrl('ai/transcript')
    ),
    error_webhook_url: String(
      agentContext.error_webhook_url || getPlivoAiWebhookUrl('ai/error')
    )
  };
};

const invokeAgentFlowCall = async ({ agentContext }) => {
  assertConfigured('ai');

  if (!agentContext?.guest_id) {
    throw new Error('Agent Flow call requires guest_id in agent context');
  }

  const flowUrl = env.plivo.aiAnswerUrl.replace(/\/$/, '');
  const payload = buildAgentFlowPayload(agentContext);
  validateAgentFlowPayload(payload);

  logger.info('Invoking Plivo Agent Flow outbound call', {
    flowUrl,
    guestId: payload.guest_id,
    to: payload.phone_number,
    from: payload.from_number
  });

  const response = await fetch(flowUrl, {
    method: 'POST',
    headers: {
      Authorization: getPlivoAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Plivo Agent Flow call failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  logger.info('Plivo Agent Flow call accepted', {
    guestId: payload.guest_id,
    apiId: body.api_id,
    message: body.message
  });

  return body;
};

const makeIvrOutboundCall = async ({ callId, guestId, phone }) => {
  const phoneOptions = { defaultCountryCode: inferDefaultCountryCode(env.plivo.fromNumber) };
  const toNumber = formatPhoneForPlivo(phone, phoneOptions);
  const fromNumber = formatPhoneForPlivo(env.plivo.fromNumber, phoneOptions);
  const webhookUrl = getWebhookUrl({ callId });
  const answerUrl = getIvrAnswerUrl({ callId, guestId });

  const response = await fetch(`https://api.plivo.com/v1/Account/${env.plivo.authId}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: getPlivoAuthHeader(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: fromNumber,
      to: toNumber,
      answer_url: answerUrl,
      answer_method: 'POST',
      ring_timeout: 45,
      time_limit: 120,
      ...(webhookUrl ? {
        ring_url: webhookUrl,
        ring_method: 'POST',
        hangup_url: webhookUrl,
        hangup_method: 'POST'
      } : {})
    })
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Plivo call failed with ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
};

const makeOutboundCall = async ({ callId, guestId, phone, callMode = 'ivr', agentContext }) => {
  if (callMode === 'ai') {
    if (!agentContext) {
      throw new Error('Agent context is required for AI voice calls');
    }

    return invokeAgentFlowCall({ agentContext });
  }

  assertConfigured('ivr');
  return makeIvrOutboundCall({ callId, guestId, phone });
};

module.exports = {
  makeOutboundCall,
  invokeAgentFlowCall,
  buildAgentFlowPayload,
  getIvrAnswerUrl,
  getPlivoAiWebhookUrl
};
