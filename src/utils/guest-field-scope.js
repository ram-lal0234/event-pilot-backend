const { isFieldRole } = require('./role-capabilities');

const DRIVER_GUEST_KEYS = new Set([
  'id',
  'eventId',
  'name',
  'phone',
  'pickupLocation',
  'pickupLat',
  'pickupLng',
  'groupSize',
  'rsvpStatus',
  'needsCab',
  'guestNotes',
  'category',
  'cabAssignments',
  'checkins',
  'createdAt',
  'updatedAt'
]);

const HOTEL_GUEST_KEYS = new Set([
  'id',
  'eventId',
  'name',
  'phone',
  'groupSize',
  'rsvpStatus',
  'needsHotel',
  'guestNotes',
  'category',
  'roomAssignments',
  'checkins',
  'createdAt',
  'updatedAt'
]);

const pickGuestFields = (guest, allowedKeys) => {
  const scoped = {};
  for (const key of allowedKeys) {
    if (guest[key] !== undefined) {
      scoped[key] = guest[key];
    }
  }
  return scoped;
};

const scopeGuestForRole = (guest, role) => {
  if (!guest || !isFieldRole(role)) {
    return guest;
  }

  if (role === 'DRIVER') {
    return pickGuestFields(guest, DRIVER_GUEST_KEYS);
  }

  if (role === 'HOTEL') {
    return pickGuestFields(guest, HOTEL_GUEST_KEYS);
  }

  return guest;
};

module.exports = {
  scopeGuestForRole
};
