const fromShared = require('./shared');
const { getPublicUrl, normalizeHeaders, parseBody, response } = require('./http-utils');

const queueService = fromShared('queue/queue.service');
const { validatePlivoSignature } = fromShared('services/plivo-signature.service');
const logger = fromShared('utils/logger');

module.exports.handler = async (event) => {
  try {
    const headers = normalizeHeaders(event.headers || {});
    const queryParams = Object.fromEntries(new URLSearchParams(event.rawQueryString || ''));
    const bodyParams = parseBody(event);
    const payload = {
      ...queryParams,
      ...bodyParams
    };

    const isValid = validatePlivoSignature({
      url: getPublicUrl(event),
      params: bodyParams,
      signature: headers['x-plivo-signature-v3'],
      mainAccountSignature: headers['x-plivo-signature-ma-v3'],
      nonce: headers['x-plivo-signature-v3-nonce']
    });

    if (!isValid) {
      logger.warn('Rejected Plivo webhook with invalid signature', {
        callUuid: payload.CallUUID || payload.callUuid
      });

      return response(401, { success: false, message: 'Invalid signature' });
    }

    await queueService.addJob('event', payload);

    return response(200, { success: true });
  } catch (error) {
    logger.error(error);
    return response(500, { success: false, message: 'Webhook ingest failed' });
  }
};
