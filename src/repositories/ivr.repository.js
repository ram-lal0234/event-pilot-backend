const prisma = require('../config/db');

const createLog = (data) => prisma.ivrLog.create({ data });

const hasRsvpCapturedSince = (guestId, since) => prisma.ivrLog.findFirst({
  where: {
    guestId,
    rsvpCaptured: true,
    createdAt: { gte: since }
  },
  select: { id: true }
}).then(Boolean);

module.exports = {
  createLog,
  hasRsvpCapturedSince
};
