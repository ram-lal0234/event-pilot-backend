const prisma = require('../config/db');
const guestRepository = require('../repositories/guest.repository');
const voiceCallService = require('./voice-call.service');
const outreachService = require('./outreach.service');
const logger = require('../utils/logger');

const processOutreachAutoCall = async ({ guestId, mode = 'ai' }) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    logger.warn('Outreach auto-call guest not found', { guestId });
    return { processed: false, reason: 'GUEST_NOT_FOUND' };
  }

  if (guest.outreachPausedAt) {
    return { processed: false, reason: 'OUTREACH_PAUSED' };
  }

  if (guest.rsvpStatus !== 'PENDING') {
    await outreachService.completeOutreach(guestId, 'rsvp_before_call');
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

  try {
    const result = await voiceCallService.triggerScheduledOutboundCall(guestId, systemUser, {
      callMode: mode
    });

    const updated = await guestRepository.update(guestId, {
      outreachStatus: 'VOICE_ATTEMPTED',
      voiceAutoTriggeredAt: new Date(),
      lastContactedAt: new Date()
    });

    return {
      processed: true,
      callId: result.callId,
      callMode: result.callMode,
      guest: updated
    };
  } catch (error) {
    logger.error(error, { guestId, context: 'outreach_auto_call' });
    return {
      processed: false,
      reason: error.code || error.message || 'CALL_FAILED'
    };
  }
};

const processOutreachReminder = async ({ guestId }) => outreachService.sendReminderWhatsApp(guestId);

module.exports = {
  processOutreachAutoCall,
  processOutreachReminder
};
