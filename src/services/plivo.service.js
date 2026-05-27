const env = require('../config/env');

const appendQuery = (url, params) => {
  const nextUrl = new URL(url);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      nextUrl.searchParams.set(key, String(value));
    }
  });

  return nextUrl.toString();
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

const getIvrAnswerUrl = ({ callId, guestId }) => {
  const base = env.plivo.ivrAnswerUrl || env.plivo.answerUrl;
  if (!base) {
    throw new Error('Plivo IVR answer URL is not configured. Set PLIVO_IVR_ANSWER_URL or PLIVO_ANSWER_URL.');
  }

  return appendQuery(base, { callId, guestId });
};

const getAiAnswerUrl = ({ callId, guestId, agentContext = {} }) => {
  if (!env.plivo.aiAnswerUrl) {
    throw new Error('Plivo AI answer URL is not configured. Set PLIVO_AI_ANSWER_URL.');
  }

  return appendQuery(env.plivo.aiAnswerUrl, {
    callId,
    guestId,
    ...agentContext
  });
};

const assertConfigured = (callMode = 'ivr') => {
  if (!env.plivo.authId || !env.plivo.authToken || !env.plivo.fromNumber) {
    throw new Error('Plivo is not configured. Set PLIVO_AUTH_ID, PLIVO_AUTH_TOKEN, and PLIVO_FROM_NUMBER.');
  }

  if (callMode === 'ai') {
    if (!env.plivo.aiAnswerUrl) {
      throw new Error('Plivo AI answer URL is not configured. Set PLIVO_AI_ANSWER_URL.');
    }
    return;
  }

  if (!env.plivo.ivrAnswerUrl && !env.plivo.answerUrl) {
    throw new Error('Plivo IVR answer URL is not configured. Set PLIVO_IVR_ANSWER_URL or PLIVO_ANSWER_URL.');
  }
};

const makeOutboundCall = async ({ callId, guestId, phone, callMode = 'ivr', agentContext }) => {
  assertConfigured(callMode);

  const webhookUrl = getWebhookUrl({ callId });
  const answerUrl = callMode === 'ai'
    ? getAiAnswerUrl({ callId, guestId, agentContext })
    : getIvrAnswerUrl({ callId, guestId });

  const isAi = callMode === 'ai';

  const response = await fetch(`https://api.plivo.com/v1/Account/${env.plivo.authId}/Call/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.plivo.authId}:${env.plivo.authToken}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.plivo.fromNumber,
      to: phone,
      answer_url: answerUrl,
      answer_method: 'POST',
      ring_timeout: 45,
      time_limit: isAi ? 300 : 120,
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

module.exports = {
  makeOutboundCall,
  getAiAnswerUrl,
  getIvrAnswerUrl
};
