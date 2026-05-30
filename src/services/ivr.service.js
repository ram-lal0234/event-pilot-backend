const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const callRepository = require('../repositories/call.repository');
const { publishCallEventAsync } = require('./realtime-events');
const auditService = require('./audit.service');
const { canTransition, isStaleTransition, normalizePlivoStatus } = require('./call-state.service');
const AppError = require('../utils/AppError');

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

const handleWebhook = async ({ guestId, callStatus, attempt, callDuration, responseInput, groupSize }) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const rsvpStatus = responseInput === '1' ? 'CONFIRMED' : 'DECLINED';

  await ivrRepository.createLog({
    eventId: guest.eventId,
    guestId,
    callStatus,
    attempt,
    callDuration,
    responseInput,
    rsvpCaptured: Boolean(responseInput),
    groupSizeCaptured: Boolean(groupSize)
  });

  const updatedGuest = await guestRepository.update(guestId, {
    rsvpStatus,
    ivrRespondedAt: new Date(),
    ...(groupSize ? { groupSize } : {})
  });

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    action: 'IVR_RESPONSE_CAPTURED',
    entityType: 'Guest',
    entityId: guestId,
    metadata: {
      responseInput,
      rsvpStatus,
      groupSize: groupSize || guest.groupSize
    }
  });

  return updatedGuest;
};

const processPlivoEvent = async (payload) => {
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

  if (!canTransition(call.status, nextStatus)) {
    return { processed: true, callUuid, eventType, rejectedTransition: `${call.status}->${nextStatus}` };
  }

  await callRepository.update(call.id, {
    status: nextStatus,
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
      nextStatus
    }
  });

  if (nextStatus === 'ANSWERED' || nextStatus === 'AI_ACTIVE') {
    void publishCallEventAsync(call.eventId, 'call_answered', {
      callId: call.id,
      guestId: call.guestId,
      status: nextStatus
    });
  } else if (nextStatus === 'COMPLETED' || nextStatus === 'FAILED') {
    void publishCallEventAsync(call.eventId, 'call_completed', {
      callId: call.id,
      guestId: call.guestId,
      status: nextStatus
    });
  }

  return { processed: true, callUuid, eventType, status: nextStatus };
};

module.exports = {
  handleWebhook,
  processPlivoEvent,
  createIdempotencyKey
};
