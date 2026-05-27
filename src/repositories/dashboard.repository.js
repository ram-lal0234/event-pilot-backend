const prisma = require('../config/db');
const auditRepository = require('./audit.repository');

const summary = async (eventId) => {
  const [totalGuests, confirmed, checkedIn, pendingPickups] = await Promise.all([
    prisma.guest.count({ where: { eventId } }),
    prisma.guest.count({ where: { eventId, rsvpStatus: 'CONFIRMED' } }),
    prisma.checkin.count({ where: { eventId } }),
    prisma.guest.count({
      where: {
        eventId,
        rsvpStatus: 'CONFIRMED',
        cabAssignments: { none: {} }
      }
    })
  ]);

  return {
    totalGuests,
    confirmed,
    checkedIn,
    pendingPickups
  };
};

const liveFeed = (eventId) => {
  return auditRepository.findByEvent(eventId, 25);
};

module.exports = {
  summary,
  liveFeed
};
