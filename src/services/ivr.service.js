const guestRepository = require('../repositories/guest.repository');
const ivrRepository = require('../repositories/ivr.repository');
const auditService = require('./audit.service');
const AppError = require('../utils/AppError');

const handleWebhook = async ({ guestId, callStatus, responseInput, groupSize }) => {
  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    throw new AppError('Guest not found', 404, 'GUEST_NOT_FOUND');
  }

  const rsvpStatus = responseInput === '1' ? 'CONFIRMED' : 'DECLINED';

  await ivrRepository.createLog({
    eventId: guest.eventId,
    guestId,
    callStatus,
    responseInput
  });

  const updatedGuest = await guestRepository.update(guestId, {
    rsvpStatus,
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

module.exports = {
  handleWebhook
};
