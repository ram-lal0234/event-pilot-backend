const callRepository = require('../repositories/call.repository');
const accessService = require('./access.service');
const guestService = require('./guest.service');
const AppError = require('../utils/AppError');

const startCall = (guestId, user, callMode) => guestService.triggerIvr(guestId, user, callMode);

const getCallStatus = async (callId, user) => {
  const call = await callRepository.findById(callId);

  if (!call) {
    throw new AppError('Call not found', 404, 'CALL_NOT_FOUND');
  }

  await accessService.assertEventAccess(user.id, call.eventId, { level: 'READ' });

  return {
    id: call.id,
    guestId: call.guestId,
    eventId: call.eventId,
    status: call.status,
    callUuid: call.callUuid,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt
  };
};

module.exports = {
  startCall,
  getCallStatus
};
