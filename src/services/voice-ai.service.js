const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const ivrService = require('./ivr.service');
const callbackScheduleService = require('./callback-schedule.service');
const { canTransition, isStaleTransition } = require('./call-state.service');
const { publishGuestEventAsync, publishCallEventAsync } = require('./realtime-events');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const { parseCallbackAtPayload } = require('../utils/parse-callback-time');

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

const getPlatformObject = (body = {}) => body?.data?.object || body?.data?.Object || {};

const findNestedValue = (value, keys, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 6) {
    return null;
  }

  for (const key of keys) {
    if (value[key]) {
      return value[key];
    }
  }

  for (const child of Object.values(value)) {
    const found = findNestedValue(child, keys, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
};

const isTemplatePlaceholder = (value) => (
  typeof value === 'string' && /^{{[^{}]+}}$/.test(value.trim())
);

const blankToNull = (value) => {
  if (value === undefined || value === null || value === '' || isTemplatePlaceholder(value)) {
    return null;
  }

  return value;
};

const normalizeBoolean = (value) => {
  const cleaned = blankToNull(value);

  if (cleaned === null || typeof cleaned === 'boolean') {
    return cleaned;
  }

  if (typeof cleaned === 'string') {
    const lowered = cleaned.trim().toLowerCase();
    if (lowered === 'true') {
      return true;
    }
    if (lowered === 'false') {
      return false;
    }
  }

  return cleaned;
};

const normalizeNumber = (value) => {
  const cleaned = blankToNull(value);

  if (cleaned === null) {
    return null;
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePayload = (body = {}) => {
  const object = getPlatformObject(body);

  return {
    callId: body.callId || body.call_id || object.call_id || object.callId || findNestedValue(body, ['call_id', 'callId']),
    guestId: blankToNull(body.guestId || body.guest_id || object.guest_id || object.guestId),
    rsvpStatus: body.rsvpStatus || body.rsvp_status,
    groupSize: normalizeNumber(body.groupSize ?? body.group_size),
    pickupLocation: blankToNull(body.pickupLocation ?? body.pickup_location),
    needsCab: normalizeBoolean(body.needsCab ?? body.needs_cab),
    needsHotel: normalizeBoolean(body.needsHotel ?? body.needs_hotel),
    guestNotes: blankToNull(body.guestNotes ?? body.guest_notes),
    language: blankToNull(body.language),
    callbackAt: body.callbackAt ?? body.callback_at ?? null,
    callOutcome: body.callOutcome || body.call_outcome,
    callStatus: body.callStatus || body.call_status || body.CallStatus,
    attempt: body.attempt,
    callDuration: body.callDuration ?? body.call_duration,
    eventType: body.eventType || body.event_type || body.Event || object.event_name,
    callUuid: body.callUuid
      || body.call_uuid
      || body.CallUUID
      || body.CallUuid
      || object.call_uuid
      || object.callUuid,
    lifecycleStatus: body.status || body.Status
  };
};

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

const isEmptyPayload = (body) => (
  !body
  || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)
);

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

const TERMINAL_FAILED_OUTCOMES = new Set(['no_answer', 'voicemail', 'wrong_person', 'opted_out']);

const resolveTerminalCallStatus = (callOutcome) => (
  TERMINAL_FAILED_OUTCOMES.has(callOutcome) ? 'FAILED' : 'COMPLETED'
);

const buildCallLinkPatch = (call, { callUuid, callOutcome }) => {
  if (!call) {
    return null;
  }

  const patch = { lastEventAt: new Date() };
  const terminalStatus = resolveTerminalCallStatus(callOutcome);

  if (callUuid && !call.callUuid) {
    patch.callUuid = callUuid;
  }

  if (
    call.status !== terminalStatus
    && canTransition(call.status, terminalStatus)
    && !isStaleTransition(call.status, terminalStatus)
  ) {
    patch.status = terminalStatus;
  }

  return patch;
};

const linkCallFromRsvpWebhook = async ({ payload, guestId, callOutcome }) => {
  const callUuid = payload.callUuid || null;
  const callId = payload.callId || null;

  let call = null;

  if (callUuid) {
    call = await callRepository.findByCallUuid(callUuid);
  }

  if (!call && callId) {
    call = await callRepository.findById(callId);
  }

  if (!call) {
    call = await callRepository.findActiveByGuestId(guestId);
  }

  if (!call) {
    logger.warn('RSVP webhook could not link Call row', {
      guestId,
      callUuid,
      callId
    });

    return { callLinked: false, reason: 'CALL_NOT_FOUND' };
  }

  const patch = buildCallLinkPatch(call, { callUuid, callOutcome });

  const updated = await callRepository.update(call.id, patch);

  if (patch.status === 'COMPLETED' || patch.status === 'FAILED') {
    void publishCallEventAsync(updated.eventId, 'call_completed', {
      callId: updated.id,
      guestId: updated.guestId,
      status: patch.status
    });
  }

  await auditService.enqueueAuditLog({
    eventId: updated.eventId,
    action: 'AI_VOICE_RSVP_CALL_LINKED',
    entityType: 'Call',
    entityId: updated.id,
    metadata: {
      guestId,
      callUuid: updated.callUuid || callUuid,
      previousStatus: call.status,
      status: updated.status,
      callOutcome
    }
  });

  return {
    callLinked: true,
    callId: updated.id,
    callUuid: updated.callUuid || callUuid,
    status: updated.status
  };
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

  if (!payload.callUuid) {
    logger.warn('AI lifecycle webhook missing call UUID', {
      bodyKeys: Object.keys(rawBody || {}),
      platformObjectKeys: Object.keys(getPlatformObject(rawBody))
    });

    return {
      kind: 'lifecycle',
      processed: false,
      reason: 'CALL_UUID_MISSING'
    };
  }

  const plivoResult = await ivrService.processPlivoEvent({
    ...rawBody,
    callId: payload.callId,
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
    : payload.callId
      ? await callRepository.findById(payload.callId)
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
        callUuid: payload.callUuid,
        callId: payload.callId || null
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
      callId: payload.callId || null,
      eventType: payload.eventType,
      status: payload.lifecycleStatus || payload.callStatus || null,
      callFound: Boolean(call),
      plivoResult
    }
  });

  return {
    kind: 'lifecycle',
    callUuid: payload.callUuid,
    callId: payload.callId || null,
    eventType: payload.eventType,
    status: payload.lifecycleStatus || payload.callStatus || null,
    rsvpUpdated: false,
    ...plivoResult
  };
};

const applyRsvpResult = async (rawBody) => {
  if (isEmptyPayload(rawBody)) {
    logger.info('Ignoring empty Plivo AI RSVP setup ping');
    return { kind: 'setup_ping', processed: false };
  }

  const payload = normalizePayload(rawBody);

  if (!payload.guestId) {
    logger.error('RSVP payload missing guestId', {
      bodyKeys: Object.keys(rawBody || {}),
      hasRsvpStatus: Boolean(rawBody?.rsvpStatus || rawBody?.rsvp_status),
      hasCallOutcome: Boolean(rawBody?.callOutcome || rawBody?.call_outcome),
      guestIdIsBlank: rawBody?.guest_id === '' || rawBody?.guestId === ''
    });
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
    rsvpStatus,
    callOutcome,
    groupSize: payload.groupSize ?? null,
    pickupLocation: payload.pickupLocation || null,
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

  const parsedGroupSize = payload.groupSize;

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

  const now = new Date();
  const notesText = payload.guestNotes || guest.guestNotes || null;

  const guestUpdate = applyGuestUpdate
    ? {
      ivrRespondedAt: now,
      rsvpStatus,
      ...(parsedGroupSize && parsedGroupSize > 0 ? { groupSize: parsedGroupSize } : {}),
      ...(payload.pickupLocation ? { pickupLocation: String(payload.pickupLocation).trim() } : {}),
      ...(payload.needsCab !== undefined ? { needsCab: payload.needsCab } : {}),
      ...(payload.needsHotel !== undefined ? { needsHotel: payload.needsHotel } : {}),
      ...(notesText ? { guestNotes: notesText } : {}),
      ...(payload.language ? { language: payload.language } : {})
    }
    : {
      ivrRespondedAt: now,
      ...(parsedGroupSize && parsedGroupSize > 0 ? { groupSize: parsedGroupSize } : {}),
      ...(payload.pickupLocation ? { pickupLocation: String(payload.pickupLocation).trim() } : {}),
      ...(notesText ? { guestNotes: notesText } : {})
    };

  if (callOutcome === 'callback_later') {
    const callbackAt = parseCallbackAtPayload(payload.callbackAt, notesText, now);
    guestUpdate.followUpStatus = 'CALLBACK_LATER';
    guestUpdate.callbackTriggered = false;
    if (callbackAt) {
      guestUpdate.callbackAt = callbackAt;
    }
  }

  const updatedGuest = await guestRepository.update(payload.guestId, guestUpdate);

  let callbackScheduleResult = null;

  if (callOutcome === 'callback_later' && updatedGuest.callbackAt) {
    try {
      callbackScheduleResult = await callbackScheduleService.scheduleCallback(
        payload.guestId,
        updatedGuest.callbackAt,
        { mode: 'ai' }
      );
    } catch (scheduleError) {
      logger.error(scheduleError, {
        guestId: payload.guestId,
        callbackAt: updatedGuest.callbackAt
      });
    }
  }

  if (applyGuestUpdate) {
    publishGuestEventAsync(guest.eventId, 'rsvp_updated', updatedGuest, {
      callOutcome,
      call: {
        callUuid: payload.callUuid || null,
        status: payload.callStatus || callOutcome.toUpperCase()
      }
    });
    publishGuestEventAsync(guest.eventId, 'call_completed', updatedGuest, {
      callOutcome,
      call: {
        callUuid: payload.callUuid || null,
        status: 'COMPLETED'
      }
    });
  }

  if (!payload.callUuid && !payload.callId) {
    logger.warn('RSVP webhook missing callUuid and callId — add both to Plivo flow HTTP action body', {
      guestId: payload.guestId
    });
  }

  const callLink = await linkCallFromRsvpWebhook({
    payload,
    guestId: payload.guestId,
    callOutcome
  });

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
      callUuid: payload.callUuid || callLink.callUuid || null,
      callLink,
      callbackAt: updatedGuest.callbackAt || null,
      callbackSchedule: callbackScheduleResult
    }
  });

  return {
    kind: 'rsvp',
    duplicate: false,
    guestUpdateSkipped: !applyGuestUpdate,
    guest: updatedGuest,
    rsvpStatus: applyGuestUpdate ? rsvpStatus : guest.rsvpStatus,
    rsvpUpdated: applyGuestUpdate,
    callbackScheduled: Boolean(callbackScheduleResult?.scheduled),
    callLink
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
  isRsvpResultEvent,
  buildCallLinkPatch,
  linkCallFromRsvpWebhook,
  resolveTerminalCallStatus
};
