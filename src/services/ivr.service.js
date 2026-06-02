const ivrRepository = require('../repositories/ivr.repository');
const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const outreachService = require('./outreach.service');
const voiceRsvpCapture = require('./voice-rsvp-capture.service');
const { publishCallEventAsync } = require('./realtime-events');
const { canTransition, isStaleTransition, normalizePlivoStatus } = require('./call-state.service');
const AppError = require('../utils/AppError');

const handleWebhook = async ({
  guestId,
  callId,
  callUuid,
  callStatus,
  attempt,
  callDuration,
  responseInput,
  callOutcome,
  rsvpStatus,
  groupSize,
  pickupLocation,
  needsCab,
  needsHotel,
  guestNotes,
  language,
  callbackAt
}) => {
  let captureFields;

  if (callOutcome) {
    captureFields = {
      callOutcome,
      rsvpStatus: rsvpStatus || undefined
    };
  } else {
    const digitCapture = voiceRsvpCapture.mapIvrDigitToCapture(responseInput);

    if (!digitCapture) {
      throw new AppError('Invalid IVR digit response', 400, 'IVR_INVALID_DIGIT');
    }

    captureFields = digitCapture;
  }

  const result = await voiceRsvpCapture.captureVoiceRsvpResult({
    guestId,
    callId: callId || null,
    callUuid: callUuid || null,
    callStatus: callStatus || 'COMPLETED',
    attempt: attempt || 1,
    callDuration: callDuration ?? null,
    digitInput: responseInput ? String(responseInput) : captureFields.callOutcome,
    groupSize: groupSize ?? null,
    pickupLocation: pickupLocation || null,
    needsCab: needsCab ?? undefined,
    needsHotel: needsHotel ?? undefined,
    guestNotes: guestNotes || null,
    language: language || null,
    callbackAt: callbackAt ?? null,
    ...captureFields
  }, { callMode: 'ivr' });

  return result.guest;
};

const getPlatformObject = (payload = {}) => payload?.data?.object || payload?.data?.Object || {};

const getCallUuid = (payload = {}) => {
  const object = getPlatformObject(payload);

  return payload.CallUUID
    || payload.callUuid
    || payload.call_uuid
    || payload.CallUuid
    || object.call_uuid
    || object.callUuid;
};

const getEventType = (payload = {}) => {
  const object = getPlatformObject(payload);

  return payload.eventType
    || payload.event_type
    || payload.Event
    || payload.event
    || payload.CallStatus
    || payload.callStatus
    || payload.Status
    || payload.status
    || object.event_name
    || 'unknown';
};

const createIdempotencyKey = (payload = {}) => {
  const callUuid = getCallUuid(payload) || 'unknown-call';
  const eventType = getEventType(payload);
  const eventTimestamp = payload.EventTime || payload.eventTime || payload.Timestamp || payload.timestamp || payload.StartTime || payload.EndTime || '';
  const context = payload.SequenceNumber || payload.RequestUUID || payload.RecordingID || payload.RecordUrl || payload.Digits || payload.CallStatus || '';

  return ['plivo', callUuid, eventType, eventTimestamp, context]
    .filter(Boolean)
    .join(':');
};

const readPlivoCallDuration = (payload = {}) => {
  const raw = payload.Duration ?? payload.CallDuration ?? payload.callDuration ?? null;
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const isTerminalHangupPayload = (payload = {}) => {
  const eventType = String(getEventType(payload)).toLowerCase();
  const callStatus = String(payload.CallStatus || payload.callStatus || '').toLowerCase();

  return eventType.includes('hangup')
    || callStatus.includes('hangup')
    || callStatus.includes('complete');
};

/** Hangup without a digit press should not count as a successful IVR completion. */
const resolveTerminalStatusForHangup = async (call, payload, nextStatus) => {
  if (nextStatus !== 'COMPLETED' || !isTerminalHangupPayload(payload)) {
    return { status: nextStatus, callOutcome: null, abandonedIvr: false };
  }

  if (call.status === 'COMPLETED') {
    return { status: 'COMPLETED', callOutcome: null, abandonedIvr: false };
  }

  const rsvpCaptured = await ivrRepository.hasRsvpCapturedSince(call.guestId, call.createdAt);
  if (rsvpCaptured) {
    return { status: 'COMPLETED', callOutcome: null, abandonedIvr: false };
  }

  return { status: 'FAILED', callOutcome: 'no_answer', abandonedIvr: true };
};

const recordAbandonedIvrHangup = async (call, payload) => {
  await ivrRepository.createLog({
    eventId: call.eventId,
    guestId: call.guestId,
    callStatus: 'FAILED',
    attempt: 1,
    callDuration: readPlivoCallDuration(payload),
    responseInput: JSON.stringify({
      kind: 'ivr',
      callOutcome: 'no_answer',
      reason: 'hangup_without_digit'
    }),
    rsvpCaptured: false,
    groupSizeCaptured: false
  });

  await auditService.enqueueAuditLog({
    eventId: call.eventId,
    action: 'IVR_HANGUP_WITHOUT_RESPONSE',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      guestId: call.guestId,
      callUuid: call.callUuid || getCallUuid(payload) || null,
      callOutcome: 'no_answer'
    }
  });

  void outreachService.handleCallOutcomeForOutreach(call.guestId, 'no_answer').catch(() => {});
};

const processPlivoEvent = async (payload, options = {}) => {
  const { enforceIvrDigitCapture = false } = options;
  const callUuid = getCallUuid(payload);

  if (!callUuid) {
    throw new AppError('Plivo event missing CallUUID', 400, 'PLIVO_CALL_UUID_MISSING');
  }

  const eventType = String(getEventType(payload));
  const idempotencyKey = createIdempotencyKey(payload);
  const call = await callRepository.findByCallUuid(callUuid)
    || (payload.callId ? await callRepository.findById(payload.callId) : null);

  try {
    await callRepository.createEvent({
      callId: call?.id,
      callUuid,
      provider: 'plivo',
      type: eventType,
      idempotencyKey,
      payload
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return { duplicate: true, callUuid, eventType };
    }

    throw error;
  }

  if (!call) {
    return { processed: true, callUuid, eventType, callFound: false };
  }

  if (!call.callUuid) {
    await callRepository.update(call.id, { callUuid });
  }

  const nextStatus = normalizePlivoStatus(payload);

  if (!nextStatus || isStaleTransition(call.status, nextStatus)) {
    return { processed: true, callUuid, eventType, statusChanged: false };
  }

  const terminalResolution = enforceIvrDigitCapture
    ? await resolveTerminalStatusForHangup(call, payload, nextStatus)
    : { status: nextStatus, callOutcome: null, abandonedIvr: false };
  const resolvedStatus = terminalResolution.status;

  if (!canTransition(call.status, resolvedStatus)) {
    return { processed: true, callUuid, eventType, rejectedTransition: `${call.status}->${resolvedStatus}` };
  }

  if (terminalResolution.abandonedIvr) {
    await recordAbandonedIvrHangup(call, payload);
  }

  await callRepository.update(call.id, {
    status: resolvedStatus,
    lastEventAt: new Date()
  });

  await auditService.enqueueAuditLog({
    eventId: call.eventId,
    action: 'CALL_STATUS_UPDATED',
    entityType: 'Call',
    entityId: call.id,
    metadata: {
      callUuid,
      eventType,
      previousStatus: call.status,
      nextStatus: resolvedStatus,
      ...(terminalResolution.callOutcome ? { callOutcome: terminalResolution.callOutcome } : {})
    }
  });

  if (resolvedStatus === 'ANSWERED' || resolvedStatus === 'AI_ACTIVE') {
    void publishCallEventAsync(call.eventId, 'call_answered', {
      callId: call.id,
      guestId: call.guestId,
      status: resolvedStatus
    });
  } else if (resolvedStatus === 'COMPLETED' || resolvedStatus === 'FAILED') {
    void publishCallEventAsync(call.eventId, 'call_completed', {
      callId: call.id,
      guestId: call.guestId,
      status: resolvedStatus,
      callOutcome: terminalResolution.callOutcome || undefined
    });
  }

  return {
    processed: true,
    callUuid,
    eventType,
    status: resolvedStatus,
    ...(terminalResolution.callOutcome ? { callOutcome: terminalResolution.callOutcome } : {})
  };
};

module.exports = {
  handleWebhook,
  processPlivoEvent,
  createIdempotencyKey,
  resolveTerminalStatusForHangup,
  isTerminalHangupPayload
};
