const prisma = require('../config/db');
const env = require('../config/env');
const auditRepository = require('./audit.repository');

const useDynamoAuditFeed = () =>
  env.queueProvider !== 'local' && Boolean(env.auditLogTableName);

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
  if (!useDynamoAuditFeed()) {
    return Promise.resolve([]);
  }

  return auditRepository.findByEvent(eventId, 25);
};

module.exports = {
  summary,
  liveFeed
};
