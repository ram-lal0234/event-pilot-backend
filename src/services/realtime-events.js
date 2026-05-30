const guestRepository = require('../repositories/guest.repository');
const realtimePush = require('./realtime-push.service');

const guestSnapshot = (guest) => ({
  id: guest.id,
  eventId: guest.eventId,
  name: guest.name,
  phone: guest.phone,
  rsvpStatus: guest.rsvpStatus,
  groupSize: guest.groupSize,
  followUpStatus: guest.followUpStatus,
  callbackAt: guest.callbackAt || null
});

const publishGuestEvent = async (eventId, type, guest, extra = {}) => {
  if (!eventId || !guest) {
    return;
  }

  return realtimePush.publishForEvent(eventId, {
    type,
    guest: guestSnapshot(guest),
    ...extra
  });
};

const publishGuestEventAsync = (eventId, type, guest, extra = {}) => {
  realtimePush.publishForEventAsync(eventId, {
    type,
    guest: guestSnapshot(guest),
    ...extra
  });
};

const publishCallEventAsync = async (eventId, type, { callId, guestId, status, callOutcome }) => {
  if (!eventId || !guestId) {
    return;
  }

  const guest = await guestRepository.findById(guestId);

  if (!guest) {
    return;
  }

  publishGuestEventAsync(eventId, type, guest, {
    call: { id: callId, status: status || null, callOutcome: callOutcome || null }
  });
};

module.exports = {
  guestSnapshot,
  publishGuestEvent,
  publishGuestEventAsync,
  publishCallEventAsync
};
