const callRepository = require('../repositories/call.repository');
const eventRepository = require('../repositories/event.repository');
const guestService = require('./guest.service');
const AppError = require('../utils/AppError');

const assertCallAccess = async (call, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(call.eventId, user);

  if (!hasAccess) {
    throw new AppError('Call not found or inaccessible', 404, 'CALL_NOT_FOUND');
  }
};

const startCall = (guestId, user) => guestService.triggerIvr(guestId, user);

const getCallStatus = async (callId, user) => {
  const call = await callRepository.findById(callId);

  if (!call) {
    throw new AppError('Call not found', 404, 'CALL_NOT_FOUND');
  }

  await assertCallAccess(call, user);

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
