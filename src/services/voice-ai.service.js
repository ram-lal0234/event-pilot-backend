const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const RSVP_STATUSES = new Set(['CONFIRMED', 'DECLINED', 'PENDING']);

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
  callStatus: body.callStatus || body.call_status,
  attempt: body.attempt,
  callDuration: body.callDuration ?? body.call_duration
});

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

const applyAiResult = async (rawBody) => {
  const payload = normalizePayload(rawBody);

  if (!payload.guestId) {
    throw new AppError('guestId is required', 400, 'GUEST_ID_REQUIRED');
  }

  const guest = await guestRepository.findById(payload.guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const callOutcome = payload.callOutcome || 'completed';
  const rsvpStatus = mapOutcomeToRsvpStatus(payload);
  const responseInput = JSON.stringify({
    callOutcome,
    language: payload.language || null,
    needsCab: payload.needsCab ?? null,
    needsHotel: payload.needsHotel ?? null,
    guestNotes: payload.guestNotes || null
  });

  const recentLog = await prisma.ivrLog.findFirst({
    where: {
      guestId: payload.guestId,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (recentLog?.responseInput === responseInput) {
    return {
      duplicate: true,
      guest,
      rsvpStatus: guest.rsvpStatus
    };
  }

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

  const guestUpdate = {
    ivrRespondedAt: new Date(),
    ...(shouldUpdateGuestRsvp(callOutcome) ? { rsvpStatus } : {}),
    ...(parsedGroupSize && parsedGroupSize > 0 ? { groupSize: parsedGroupSize } : {}),
    ...(payload.pickupLocation ? { pickupLocation: String(payload.pickupLocation).trim() } : {})
  };

  const updatedGuest = await guestRepository.update(payload.guestId, guestUpdate);

  await auditService.enqueueAuditLog({
    eventId: guest.eventId,
    action: 'AI_VOICE_RESPONSE_CAPTURED',
    entityType: 'Guest',
    entityId: payload.guestId,
    metadata: {
      callOutcome,
      rsvpStatus,
      groupSize: parsedGroupSize || guest.groupSize,
      pickupLocation: payload.pickupLocation || guest.pickupLocation,
      needsCab: payload.needsCab ?? null,
      needsHotel: payload.needsHotel ?? null,
      guestNotes: payload.guestNotes || null,
      language: payload.language || null
    }
  });

  return {
    duplicate: false,
    guest: updatedGuest,
    rsvpStatus
  };
};

module.exports = {
  applyAiResult
};
