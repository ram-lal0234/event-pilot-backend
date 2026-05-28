const fromShared = require('./shared');
const { getPublicUrl, normalizeHeaders, parseBody, response, getRawBodyLength } = require('./http-utils');

const plivoWebhookAuth = fromShared('services/plivo-webhook-auth.service');
const plivoWebhookIngress = fromShared('services/plivo-webhook-ingress.service');
const plivoIvrXml = fromShared('services/plivo-ivr-xml.service');
const {
  PLIVO_AI_WEBHOOK_ROUTES,
  normalizePlivoAiRoute,
  isAllowedPlivoAiRoute
} = fromShared('constants/plivo-webhook-routes');
const logger = fromShared('utils/logger');

const xmlResponse = (body) => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/xml' },
  body
});

const resolveRoute = (event) => {
  const rawPath = event.rawPath || event.requestContext?.http?.path || '';
  const prefix = '/webhook/plivo';

  if (rawPath === prefix || rawPath === `${prefix}/`) {
    return 'telephony';
  }

  if (!rawPath.startsWith(`${prefix}/`)) {
    return 'telephony';
  }

  const segment = rawPath.slice(prefix.length + 1).replace(/\/$/, '');
  return normalizePlivoAiRoute(segment);
};

const isAiRoute = (route) => route.startsWith('ai/');

const isSyncIvrRoute = (route) => route === 'ivr/answer' || route === 'ivr/digit';

module.exports.handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method || 'POST';

    if (method === 'OPTIONS') {
      return response(200, { success: true });
    }

    const headers = normalizeHeaders(event.headers || {});
    const queryParams = Object.fromEntries(new URLSearchParams(event.rawQueryString || ''));
    const bodyParams = parseBody(event);
    const payload = {
      ...queryParams,
      ...bodyParams
    };
    const route = resolveRoute(event);
    const publicUrl = getPublicUrl(event);
    const authMode = isAiRoute(route) ? 'voice-secret' : 'plivo-signature';

    const rawBodyLength = getRawBodyLength(event);

    const authDebug = plivoWebhookAuth.logPlivoWebhookAuthDebug({
      route,
      authMode,
      headers,
      query: queryParams,
      publicUrl,
      bodyParams,
      rawBodyLength
    });

    if (isAiRoute(route)) {
      if (!isAllowedPlivoAiRoute(route)) {
        return response(404, {
          success: false,
          message: 'Unknown Plivo AI webhook route',
          allowedRoutes: PLIVO_AI_WEBHOOK_ROUTES
        });
      }

      const auth = plivoWebhookAuth.assertVoiceWebhookSecret({
        headers,
        query: queryParams,
        route,
        body: bodyParams
      });

      if (!auth.ok) {
        logger.warn('Rejected Plivo AI webhook', {
          route,
          reason: auth.reason,
          authDebug: auth.debug,
          rawBodyLength,
          plivoHeaders: authDebug.headerDebug,
          note: 'Flow RSVP needs X-EventPilot-Voice-Secret matching VOICE_AI_WEBHOOK_SECRET on Lambda; compare providedLength vs expectedLength in logs'
        });
        return response(401, {
          success: false,
          message: 'Invalid or missing X-EventPilot-Voice-Secret header'
        });
      }

      const result = await plivoWebhookIngress.enqueuePlivoWebhook({
        route,
        body: payload,
        query: queryParams,
        headers
      });

      logger.info('Plivo AI webhook accepted', { route, queued: result.queued });
      return response(200, { success: true, route, ...result });
    }

    if (isSyncIvrRoute(route)) {
      const auth = plivoWebhookAuth.assertPlivoSignature({
        headers,
        publicUrl,
        bodyParams
      });

      if (!auth.ok) {
        logger.warn('Rejected Plivo IVR webhook', {
          route,
          reason: auth.reason,
          detail: auth.detail,
          plivoHeaders: authDebug.headerDebug,
          plivoSignatureCheck: authDebug.signatureCheck
        });
        return response(401, { success: false, message: 'Invalid signature' });
      }

      try {
        if (route === 'ivr/answer') {
          const xml = await plivoIvrXml.buildAnswerXml({
            guestId: queryParams.guestId || bodyParams.guestId,
            callId: queryParams.callId || bodyParams.callId
          });
          return xmlResponse(xml);
        }

        const xml = await plivoIvrXml.buildDigitXml({
          guestId: queryParams.guestId || bodyParams.guestId,
          digitPressed: bodyParams.Digits || queryParams.Digits
        });
        return xmlResponse(xml);
      } catch (error) {
        logger.error(error, { route });
        return xmlResponse(plivoIvrXml.buildDigitErrorXml());
      }
    }

    const auth = plivoWebhookAuth.assertPlivoSignature({
      headers,
      publicUrl,
      bodyParams
    });

    if (!auth.ok) {
      logger.warn('Rejected Plivo telephony webhook', {
        route,
        reason: auth.reason,
        detail: auth.detail,
        callUuid: payload.CallUUID || payload.callUuid,
        plivoHeaders: authDebug.headerDebug,
        plivoSignatureCheck: authDebug.signatureCheck
      });
      return response(401, { success: false, message: 'Invalid signature' });
    }

    const result = await plivoWebhookIngress.enqueueTelephonyWebhook({
      body: bodyParams,
      query: queryParams,
      headers
    });

    logger.info('Plivo telephony webhook accepted', { route: 'telephony', queued: result.queued });
    return response(200, { success: true, route: 'telephony', ...result });
  } catch (error) {
    logger.error(error);
    return response(500, { success: false, message: 'Webhook ingest failed' });
  }
};
