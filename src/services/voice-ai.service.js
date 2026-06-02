const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const ivrService = require('./ivr.service');
const voiceRsvpCapture = require('./voice-rsvp-capture.service');
const { publishGuestEventAsync } = require('./realtime-events');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

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

  return voiceRsvpCapture.captureVoiceRsvpResult(payload, { callMode: 'ai' });
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
  normalizePayload,
  buildCallLinkPatch: voiceRsvpCapture.buildCallLinkPatch,
  linkCallFromRsvpWebhook: voiceRsvpCapture.linkCallFromRsvpWebhook,
  resolveTerminalCallStatus: voiceRsvpCapture.resolveTerminalCallStatus
};
