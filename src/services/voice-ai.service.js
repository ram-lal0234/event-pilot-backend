const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const ivrService = require('./ivr.service');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const RSVP_STATUSES = new Set(['CONFIRMED', 'DECLINED', 'PENDING']);

const OUTCOME_PRIORITY = {
  completed: 100,
  declined: 90,
  maybe: 50,
  callback_later: 40,
  wrong_person: 20,
  opted_out: 20,
  voicemail: 10,
  no_answer: 10
};

const outcomePriority = (callOutcome) => OUTCOME_PRIORITY[callOutcome] ?? 0;

const parseStoredOutcome = (responseInput) => {
  if (!responseInput) {
    return null;
  }

  try {
    const parsed = JSON.parse(responseInput);
    return parsed.callOutcome || null;
  } catch {
    return null;
  }
};

const normalizePayload = (body = {}) => ({
  guestId: body.guestId || body.guest_id,
  rsvpStatus: body.rsvpStatus || body.rsvp_status,
  groupSize: body.groupSize ?? body.group_size,
  pickupLocation: body.pickupLocation ?? body.pickup_location,
  needsCab: body.needsCab ?? body.needs_cab,
  needsHotel: body.needsHotel ?? body.needs_hotel,
  guestNotes: body.guestNotes ?? body.guest_notes,
  language: body.language,
  callOutcome: body.callOutcome || body.call_outcome,
  callStatus: body.callStatus || body.call_status || body.CallStatus,
  attempt: body.attempt,
  callDuration: body.callDuration ?? body.call_duration,
  eventType: body.eventType || body.event_type || body.Event,
  callUuid: body.callUuid || body.call_uuid || body.CallUUID || body.CallUuid,
  lifecycleStatus: body.status || body.Status
});

const isLifecycleEvent = (body = {}) => {
  const payload = normalizePayload(body);
  return Boolean(payload.callUuid && (payload.eventType || payload.lifecycleStatus || payload.callStatus));
};

const isRsvpResultEvent = (body = {}) => {
  const payload = normalizePayload(body);

  if (!payload.guestId) {
    return false;
  }

  return Boolean(
    payload.rsvpStatus
    || payload.callOutcome
    || (payload.groupSize !== undefined && payload.groupSize !== null && payload.groupSize !== '')
    || payload.pickupLocation
    || payload.needsCab !== undefined
    || payload.needsHotel !== undefined
    || payload.guestNotes
  );
};

const resolveCallOutcome = (payload) => {
  if (payload.callOutcome) {
    return payload.callOutcome;
  }

  if (payload.rsvpStatus === 'CONFIRMED') {
    return 'completed';
  }

  if (payload.rsvpStatus === 'DECLINED') {
    return 'declined';
  }

  return undefined;
};

const mapOutcomeToRsvpStatus = ({ rsvpStatus, callOutcome }) => {
  if (rsvpStatus && RSVP_STATUSES.has(rsvpStatus)) {
    return rsvpStatus;
  }

  switch (callOutcome) {
    case 'completed':
      return 'CONFIRMED';
    case 'declined':
      return 'DECLINED';
    case 'maybe':
    case 'callback_later':
    case 'wrong_person':
    case 'opted_out':
    case 'voicemail':
    case 'no_answer':
      return 'PENDING';
    default:
      return 'PENDING';
  }
};

const shouldUpdateGuestRsvp = (callOutcome) => {
  return !['wrong_person', 'voicemail', 'no_answer', 'opted_out'].includes(callOutcome);
};

const shouldApplyGuestUpdate = ({ guest, callOutcome, rsvpStatus, recentLog }) => {
  if (!shouldUpdateGuestRsvp(callOutcome)) {
    return false;
  }

  const incomingPriority = outcomePriority(callOutcome);

  if ((guest.rsvpStatus === 'CONFIRMED' || guest.rsvpStatus === 'DECLINED') && rsvpStatus === 'PENDING') {
    if (incomingPriority < outcomePriority('maybe')) {
      return false;
    }
  }

  if (recentLog?.responseInput) {
    const previousOutcome = parseStoredOutcome(recentLog.responseInput);
    if (previousOutcome && outcomePriority(previousOutcome) > incomingPriority) {
      return false;
    }
  }

  return true;
};

const handleLifecycleEvent = async (rawBody) => {
  const payload = normalizePayload(rawBody);
  const plivoResult = await ivrService.processPlivoEvent({
    ...rawBody,
    callUuid: payload.callUuid,
    call_uuid: payload.callUuid,
    CallUUID: payload.callUuid,
    eventType: payload.eventType,
    event_type: payload.eventType,
    Event: payload.eventType,
    status: payload.lifecycleStatus,
    Status: payload.lifecycleStatus,
    callStatus: payload.callStatus || payload.lifecycleStatus,
    CallStatus: payload.callStatus || payload.lifecycleStatus
  });

  const call = payload.callUuid
    ? await callRepository.findByCallUuid(payload.callUuid)
    : null;

  if (call) {
    const lifecycleLogStatus = String(
      payload.callStatus || payload.lifecycleStatus || payload.eventType || 'UNKNOWN'
    ).toUpperCase();

    await ivrRepository.createLog({
      eventId: call.eventId,
      guestId: call.guestId,
      callStatus: lifecycleLogStatus,
      attempt: payload.attempt ? Number(payload.attempt) : 1,
      callDuration: payload.callDuration ? Number(payload.callDuration) : null,
      responseInput: JSON.stringify({
        kind: 'lifecycle',
        eventType: payload.eventType,
        status: payload.lifecycleStatus || payload.callStatus || null,
        callUuid: payload.callUuid
      }),
      rsvpCaptured: false,
      groupSizeCaptured: false
    });
  }

  await auditService.enqueueAuditLog({
    eventId: call?.eventId,
    action: 'AI_VOICE_LIFECYCLE_EVENT',
    entityType: call ? 'Call' : 'VoiceWebhook',
    entityId: call?.id || payload.callUuid,
    metadata: {
      callUuid: payload.callUuid,
      eventType: payload.eventType,
      status: payload.lifecycleStatus || payload.callStatus || null,
      callFound: Boolean(call),
      plivoResult
    }
  });

  return {
    kind: 'lifecycle',
    callUuid: payload.callUuid,
    eventType: payload.eventType,
    status: payload.lifecycleStatus || payload.callStatus || null,
    rsvpUpdated: false,
    ...plivoResult
  };
};

const applyRsvpResult = async (rawBody) => {
  const payload = normalizePayload(rawBody);

  if (!payload.guestId) {
    throw new AppError('guestId is required for RSVP results', 400, 'GUEST_ID_REQUIRED');
  }

  const callOutcome = resolveCallOutcome(payload);

  if (!callOutcome) {
    throw new AppError(
      'RSVP webhook requires callOutcome or rsvpStatus (Hangup/COMPLETED alone is not an RSVP)',
      400,
      'RSVP_FIELDS_REQUIRED'
    );
  }

  const guest = await guestRepository.findById(payload.guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const rsvpStatus = mapOutcomeToRsvpStatus({ ...payload, callOutcome });
  const responseInput = JSON.stringify({
    kind: 'rsvp',
    callOutcome,
    language: payload.language || null,
    needsCab: payload.needsCab ?? null,
    needsHotel: payload.needsHotel ?? null,
    guestNotes: payload.guestNotes || null,
    callUuid: payload.callUuid || null
  });

  const recentLog = await prisma.ivrLog.findFirst({
    where: {
      guestId: payload.guestId,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (recentLog?.responseInput === responseInput) {
    return {
      kind: 'rsvp',
      duplicate: true,
      guest,
      rsvpStatus: guest.rsvpStatus,
      rsvpUpdated: false
    };
  }

  const applyGuestUpdate = shouldApplyGuestUpdate({
    guest,
    callOutcome,
    rsvpStatus,
    recentLog
  });

  const parsedGroupSize = payload.groupSize !== undefined && payload.groupSize !== null && payload.groupSize !== ''
    ? Number(payload.groupSize)
    : undefined;

  await ivrRepository.createLog({
    eventId: guest.eventId,
    guestId: payload.guestId,
    callStatus: payload.callStatus || callOutcome.toUpperCase(),
    attempt: payload.attempt ? Number(payload.attempt) : 1,
    callDuration: payload.callDuration ? Number(payload.callDuration) : null,
    responseInput,
    rsvpCaptured: shouldUpdateGuestRsvp(callOutcome) && rsvpStatus !== 'PENDING',
    groupSizeCaptured: Boolean(parsedGroupSize)
  });

  const guestUpdate = applyGuestUpdate
    ? {
      ivrRespondedAt: new Date(),
      rsvpStatus,
      ...(parsedGroupSize && parsedGroupSize > 0 ? { groupSize: parsedGroupSize } : {}),
      ...(payload.pickupLocation ? { pickupLocation: String(payload.pickupLocation).trim() } : {})
    }
    : {
      ivrRespondedAt: new Date(),
      ...(parsedGroupSize && parsedGroupSize > 0 ? { groupSize: parsedGroupSize } : {}),
      ...(payload.pickupLocation ? { pickupLocation: String(payload.pickupLocation).trim() } : {})
    };

  const updatedGuest = await guestRepository.update(payload.guestId, guestUpdate);

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    action: applyGuestUpdate ? 'AI_VOICE_RESPONSE_CAPTURED' : 'AI_VOICE_RESPONSE_LOGGED',
    entityType: 'Guest',
    entityId: payload.guestId,
    metadata: {
      callOutcome,
      rsvpStatus: applyGuestUpdate ? rsvpStatus : guest.rsvpStatus,
      guestUpdateSkipped: !applyGuestUpdate,
      groupSize: parsedGroupSize || guest.groupSize,
      pickupLocation: payload.pickupLocation || guest.pickupLocation,
      needsCab: payload.needsCab ?? null,
      needsHotel: payload.needsHotel ?? null,
      guestNotes: payload.guestNotes || null,
      language: payload.language || null,
      callUuid: payload.callUuid || null
    }
  });

  return {
    kind: 'rsvp',
    duplicate: false,
    guestUpdateSkipped: !applyGuestUpdate,
    guest: updatedGuest,
    rsvpStatus: applyGuestUpdate ? rsvpStatus : guest.rsvpStatus,
    rsvpUpdated: applyGuestUpdate
  };
};

const applyAiResult = async (rawBody, { route } = {}) => {
  logger.info('Voice AI webhook received', {
    route: route || 'legacy',
    keys: Object.keys(rawBody || {}),
    eventType: rawBody?.eventType || rawBody?.event_type || rawBody?.Event,
    callUuid: rawBody?.callUuid || rawBody?.call_uuid || rawBody?.CallUUID,
    guestId: rawBody?.guestId || rawBody?.guest_id,
    hasCallOutcome: Boolean(rawBody?.callOutcome || rawBody?.call_outcome)
  });

  const normalizedRoute = route ? String(route).toLowerCase() : null;

  if (normalizedRoute === 'ai/hangup' || normalizedRoute === 'ai/lifecycle') {
    return handleLifecycleEvent(rawBody);
  }

  if (normalizedRoute === 'ai/rsvp') {
    return applyRsvpResult(rawBody);
  }

  const lifecycle = isLifecycleEvent(rawBody);
  const rsvp = isRsvpResultEvent(rawBody);

  if (!lifecycle && !rsvp) {
    throw new AppError(
      'Unrecognized voice webhook payload. Use /webhook/plivo/ai/hangup, /ai/rsvp, /ai/transcript, or /ai/error.',
      400,
      'VOICE_WEBHOOK_UNRECOGNIZED'
    );
  }

  if (lifecycle && !rsvp) {
    return handleLifecycleEvent(rawBody);
  }

  if (rsvp && !lifecycle) {
    return applyRsvpResult(rawBody);
  }

  const lifecycleResult = await handleLifecycleEvent(rawBody);
  const rsvpResult = await applyRsvpResult(rawBody);

  return {
    ...rsvpResult,
    lifecycle: lifecycleResult
  };
};

module.exports = {
  applyAiResult,
  applyRsvpResult,
  handleLifecycleEvent,
  isLifecycleEvent,
  isRsvpResultEvent
};
