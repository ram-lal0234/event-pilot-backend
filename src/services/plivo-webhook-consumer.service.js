const voiceAiService = require('./voice-ai.service');
const voiceAiTranscriptService = require('./voice-ai-transcript.service');
const voiceAiErrorService = require('./voice-ai-error.service');
const ivrService = require('./ivr.service');
const { normalizePlivoAiRoute } = require('../constants/plivo-webhook-routes');
const logger = require('../utils/logger');

const processPlivoWebhookJob = async (job = {}) => {
  const route = normalizePlivoAiRoute(job.route || 'telephony');
  const body = job.body || job;

  logger.info('Processing Plivo webhook job', { route });

  switch (route) {
    case 'ai/hangup':
      if (voiceAiService.isRsvpResultEvent(body) && !voiceAiService.isLifecycleEvent(body)) {
        logger.warn('RSVP-shaped payload on ai/hangup route; use /webhook/plivo/ai/rsvp', {
          guestId: body.guestId || body.guest_id
        });
      }

      return voiceAiService.handleLifecycleEvent(body);

    case 'ai/rsvp':
      return voiceAiService.applyRsvpResult(body);

    case 'ai/transcript':
      return voiceAiTranscriptService.handleTranscriptEvent(body);

    case 'ai/error':
      return voiceAiErrorService.handleErrorEvent(body);

    case 'ivr/answer':
    case 'ivr/digit':
      return { kind: route, skipped: true, reason: 'sync_route_should_not_be_queued' };

    case 'telephony':
      return ivrService.processPlivoEvent(body);

    default:
      logger.warn('Unhandled Plivo webhook route', { route });
      return { kind: route, processed: false, reason: 'UNKNOWN_ROUTE' };
  }
};

module.exports = {
  processPlivoWebhookJob
};
