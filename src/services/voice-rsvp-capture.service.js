const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const callRepository = require('../repositories/call.repository');
const auditService = require('./audit.service');
const callbackScheduleService = require('./callback-schedule.service');
const outreachService = require('./outreach.service');
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

const TERMINAL_FAILED_OUTCOMES = new Set(['no_answer', 'voicemail', 'wrong_person', 'opted_out']);

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

const mapIvrDigitToCapture = (digit) => {
  if (String(digit) === '1') {
    return { rsvpStatus: 'CONFIRMED', callOutcome: 'completed' };
  }

  if (String(digit) === '2') {
    return { rsvpStatus: 'DECLINED', callOutcome: 'declined' };
  }

  if (String(digit) === '3') {
    return { rsvpStatus: 'PENDING', callOutcome: 'maybe' };
  }

  if (String(digit) === '4') {
    return { rsvpStatus: 'PENDING', callOutcome: 'callback_later' };
  }

  return null;
};

const shouldUpdateGuestRsvp = (callOutcome) => (
  !['wrong_person', 'voicemail', 'no_answer', 'opted_out'].includes(callOutcome)
);

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

const linkCallFromRsvpWebhook = async ({ payload, guestId, callOutcome, callMode = 'ai' }) => {
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
    logger.warn('RSVP capture could not link Call row', {
      guestId,
      callUuid,
      callId,
      callMode
    });

    return { callLinked: false, reason: 'CALL_NOT_FOUND' };
  }

  const patch = buildCallLinkPatch(call, { callUuid, callOutcome });

  const updated = await callRepository.update(call.id, patch);

  if (patch.status === 'COMPLETED' || patch.status === 'FAILED') {
    void publishCallEventAsync(updated.eventId, 'call_completed', {
      callId: updated.id,
      guestId: updated.guestId,
      status: patch.status,
      callOutcome: TERMINAL_FAILED_OUTCOMES.has(callOutcome) ? callOutcome : undefined
    });
  }

  await auditService.enqueueAuditLog({
    eventId: updated.eventId,
    action: callMode === 'ivr' ? 'IVR_RSVP_CALL_LINKED' : 'AI_VOICE_RSVP_CALL_LINKED',
    entityType: 'Call',
    entityId: updated.id,
    metadata: {
      guestId,
      callUuid: updated.callUuid || callUuid,
      previousStatus: call.status,
      status: updated.status,
      callOutcome,
      callMode
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

const buildResponseInput = (payload, { callMode, rsvpStatus, callOutcome }) => JSON.stringify({
  kind: callMode === 'ivr' ? 'ivr' : 'rsvp',
  rsvpStatus,
  callOutcome,
  responseInput: payload.digitInput ? String(payload.digitInput) : null,
  groupSize: payload.groupSize ?? null,
  pickupLocation: payload.pickupLocation || null,
  language: payload.language || null,
  needsCab: payload.needsCab ?? null,
  needsHotel: payload.needsHotel ?? null,
  guestNotes: payload.guestNotes || null,
  callUuid: payload.callUuid || null
});

const captureVoiceRsvpResult = async (payload, { callMode = 'ai' } = {}) => {
  if (!payload?.guestId) {
    throw new AppError('guestId is required for RSVP results', 400, 'GUEST_ID_REQUIRED');
  }

  const callOutcome = resolveCallOutcome(payload);

  if (!callOutcome) {
    throw new AppError(
      'RSVP capture requires callOutcome or rsvpStatus',
      400,
      'RSVP_FIELDS_REQUIRED'
    );
  }

  const guest = await guestRepository.findById(payload.guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const rsvpStatus = mapOutcomeToRsvpStatus({ ...payload, callOutcome });
  const responseInput = buildResponseInput(payload, { callMode, rsvpStatus, callOutcome });

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
      rsvpUpdated: false,
      callMode
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
      lastContactedAt: now,
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
      lastContactedAt: now,
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
        { mode: callMode }
      );
    } catch (scheduleError) {
      logger.error(scheduleError, {
        guestId: payload.guestId,
        callbackAt: updatedGuest.callbackAt,
        callMode
      });
    }
  }

  if (applyGuestUpdate) {
    publishGuestEventAsync(guest.eventId, 'rsvp_updated', updatedGuest, {
      callOutcome,
      callMode,
      call: {
        callUuid: payload.callUuid || null,
        status: payload.callStatus || callOutcome.toUpperCase()
      }
    });
    publishGuestEventAsync(guest.eventId, 'call_completed', updatedGuest, {
      callOutcome,
      callMode,
      call: {
        callUuid: payload.callUuid || null,
        status: 'COMPLETED'
      }
    });
  }

  if (!payload.callUuid && !payload.callId) {
    logger.warn('RSVP capture missing callUuid and callId', {
      guestId: payload.guestId,
      callMode
    });
  }

  const callLink = await linkCallFromRsvpWebhook({
    payload,
    guestId: payload.guestId,
    callOutcome,
    callMode
  });

  const capturedAction = callMode === 'ivr' ? 'IVR_RESPONSE_CAPTURED' : 'AI_VOICE_RESPONSE_CAPTURED';
  const loggedAction = callMode === 'ivr' ? 'IVR_RESPONSE_LOGGED' : 'AI_VOICE_RESPONSE_LOGGED';

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    action: applyGuestUpdate ? capturedAction : loggedAction,
    entityType: 'Guest',
    entityId: payload.guestId,
    metadata: {
      callOutcome,
      callMode,
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

  void outreachService.handleCallOutcomeForOutreach(payload.guestId, callOutcome, {
    rsvpUpdated: applyGuestUpdate && rsvpStatus !== 'PENDING'
  }).catch((error) => {
    logger.error(error, { guestId: payload.guestId, context: 'outreach_call_outcome', callMode });
  });

  return {
    kind: 'rsvp',
    duplicate: false,
    guestUpdateSkipped: !applyGuestUpdate,
    guest: updatedGuest,
    rsvpStatus: applyGuestUpdate ? rsvpStatus : guest.rsvpStatus,
    rsvpUpdated: applyGuestUpdate,
    callbackScheduled: Boolean(callbackScheduleResult?.scheduled),
    callLink,
    callMode
  };
};

module.exports = {
  captureVoiceRsvpResult,
  mapIvrDigitToCapture,
  resolveCallOutcome,
  mapOutcomeToRsvpStatus,
  buildCallLinkPatch,
  linkCallFromRsvpWebhook,
  resolveTerminalCallStatus,
  shouldApplyGuestUpdate,
  shouldUpdateGuestRsvp
};
