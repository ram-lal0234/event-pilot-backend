const prisma = require('../config/db');
const env = require('../config/env');
const guestRepository = require('../repositories/guest.repository');
const hotelRepository = require('../repositories/hotel.repository');
const callRepository = require('../repositories/call.repository');
const queueService = require('../queue/queue.service');
const auditService = require('./audit.service');
const callDialerService = require('./call-dialer.service');
const { getPlivoAiWebhookUrl } = require('./plivo.service');
const AppError = require('../utils/AppError');

const formatEventDateSpoken = (date) => {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata'
  }).format(new Date(date));
};

const parseBool = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const assertCallModeConfigured = (callMode) => {
  if (callMode === 'ai') {
    if (!env.plivo.aiAnswerUrl) {
      throw new AppError(
        'AI voice calls are not configured. Set PLIVO_AI_ANSWER_URL to your Plivo Agent Flow invoke URL.',
        503,
        'AI_VOICE_NOT_CONFIGURED'
      );
    }

    return;
  }

  if (!env.plivo.ivrAnswerUrl && !env.plivo.answerUrl) {
    throw new AppError(
      'IVR calls are not configured. Set PLIVO_IVR_ANSWER_URL in the environment.',
      503,
      'IVR_VOICE_NOT_CONFIGURED'
    );
  }
};

const resolveCallMode = (override) => {
  const requested = (override || env.voiceDefaultCallMode || '').toLowerCase();

  if (requested === 'ai' || requested === 'ivr') {
    assertCallModeConfigured(requested);
    return requested;
  }

  if (env.plivo.aiAnswerUrl) {
    return 'ai';
  }

  return 'ivr';
};

const buildAgentContext = async (guest) => {
  const event = await prisma.event.findUnique({
    where: { id: guest.eventId },
    include: {
      setting: true,
      creator: {
        select: { email: true }
      }
    }
  });

  if (!event) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  const hotels = await hotelRepository.findManyByEvent(guest.eventId);
  const transportEnabled = parseBool(env.voiceTransportEnabled, true);
  const hotelEnabled = parseBool(env.voiceHotelEnabled, hotels.length > 0);
  // Spoken on calls — use event title, never email local-part (e.g. choudharyramlal0234).
  const hostLabel = (event.name || '').trim() || 'the hosts';

  return {
    guest_id: guest.id,
    guest_name: guest.name,
    phone_number: guest.phone,
    from_number: env.plivo.fromNumber,
    event_name: event.name,
    event_date_spoken: formatEventDateSpoken(event.date),
    event_location_spoken: event.location,
    host_label: hostLabel,
    existing_pickup_location: guest.pickupLocation || '',
    transport_enabled: transportEnabled,
    hotel_enabled: hotelEnabled,
    rsvp_webhook_url: getPlivoAiWebhookUrl('ai/rsvp'),
    hangup_webhook_url: getPlivoAiWebhookUrl('ai/hangup'),
    transcript_webhook_url: getPlivoAiWebhookUrl('ai/transcript'),
    error_webhook_url: getPlivoAiWebhookUrl('ai/error')
  };
};

const queueOutboundCall = async ({ guest, user, callMode }) => {
  const call = await callRepository.create({
    eventId: guest.eventId,
    guestId: guest.id,
    phone: guest.phone,
    status: 'QUEUED'
  });

  const agentContext = callMode === 'ai' ? await buildAgentContext(guest) : undefined;
  const jobPayload = {
    callId: call.id,
    guestId: guest.id,
    eventId: guest.eventId,
    phone: guest.phone,
    callMode,
    agentContext
  };

  await queueService.addJob('call', jobPayload);

  if (env.queueProvider === 'local') {
    void callDialerService.processCallJob(jobPayload).catch((error) => {
      const logger = require('../utils/logger');
      logger.error(error, { callId: call.id, callMode });
    });
  }

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    userId: user.id,
    action: callMode === 'ai' ? 'AI_VOICE_CALL_QUEUED' : 'IVR_CALL_QUEUED',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      guestId: guest.id,
      status: call.status,
      callMode,
      queuedBy: user.id
    }
  });

  return {
    queued: true,
    callId: call.id,
    callMode
  };
};

const assertEventAccess = async (eventId, user) => {
  const eventRepository = require('../repositories/event.repository');
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }
};

const triggerOutboundCall = async (guestId, user, { callMode: callModeOverride } = {}) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  await assertEventAccess(guest.eventId, user);

  const event = await prisma.event.findUnique({
    where: { id: guest.eventId },
    include: { setting: true }
  });

  if (!event) {
    throw new AppError('Event not found', 404, 'EVENT_NOT_FOUND');
  }

  if (event.setting && event.setting.ivrEnabled === false) {
    throw new AppError('Voice calls are disabled for this event.', 409, 'VOICE_CALLS_DISABLED');
  }

  if (guest.rsvpStatus !== 'PENDING') {
    throw new AppError(
      'Voice calls can only be triggered for guests with pending RSVP.',
      409,
      'VOICE_CALL_NOT_ALLOWED_FOR_RSVP_STATUS'
    );
  }

  const callMode = resolveCallMode(callModeOverride);
  return queueOutboundCall({ guest, user, callMode });
};

module.exports = {
  triggerOutboundCall,
  resolveCallMode,
  buildAgentContext
};
