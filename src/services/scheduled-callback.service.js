const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const voiceCallService = require('./voice-call.service');
const logger = require('../utils/logger');

const processScheduledCallback = async ({ guestId, mode = 'ai' }) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    logger.warn('Scheduled callback guest not found', { guestId });
    return { processed: false, reason: 'GUEST_NOT_FOUND' };
  }

  if (guest.callbackTriggered) {
    logger.info('Scheduled callback already triggered', { guestId });
    return { processed: false, reason: 'ALREADY_TRIGGERED' };
  }

  if (guest.rsvpStatus !== 'PENDING') {
    logger.info('Skipping scheduled callback — RSVP no longer pending', {
      guestId,
      rsvpStatus: guest.rsvpStatus
    });
    return { processed: false, reason: 'RSVP_NOT_PENDING' };
  }

  const event = await prisma.event.findUnique({
    where: { id: guest.eventId },
    select: { id: true, createdBy: true }
  });

  if (!event) {
    return { processed: false, reason: 'EVENT_NOT_FOUND' };
  }

  const systemUser = { id: event.createdBy };

  const result = await voiceCallService.triggerScheduledOutboundCall(guestId, systemUser, {
    callMode: mode
  });

  await guestRepository.update(guestId, {
    callbackTriggered: true,
    lastContactedAt: new Date()
  });

  return {
    processed: true,
    callId: result.callId,
    callMode: result.callMode
  };
};

module.exports = {
  processScheduledCallback
};
