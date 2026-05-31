const { eventFixture } = require('./event.fixture');

const guestFixture = {
  id: 'guest_test_01',
  eventId: eventFixture.id,
  name: 'Ramesh Kumar',
  phone: '+919922824246',
  email: 'ramesh@example.com',
  category: 'FAMILY',
  rsvpStatus: 'PENDING',
  groupSize: null,
  pickupLocation: null,
  needsCab: false,
  needsHotel: false,
  guestNotes: null,
  followUpStatus: 'NEEDS_FOLLOW_UP',
  callbackAt: null,
  qrCode: 'guest:evt_test_01:3b9e667d',
  ivrRespondedAt: null,
  event: eventFixture
};

const inviteFixture = {
  id: 'invite_test_01',
  code: 'test-invite-code',
  guestId: guestFixture.id,
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  usedAt: null,
  guest: guestFixture
};

module.exports = {
  guestFixture,
  inviteFixture
};
