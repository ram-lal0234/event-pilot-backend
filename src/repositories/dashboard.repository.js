const prisma = require('../config/db');

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
  return prisma.auditLog.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 25
  });
};

module.exports = {
  summary,
  liveFeed
};
