const prisma = require('../config/db');

const create = (data) => prisma.checkin.create({ data });

const findByGuestAndLocation = (guestId, locationType) => prisma.checkin.findUnique({
  where: {
    guestId_locationType: {
      guestId,
      locationType
    }
  }
});

const findByGuestId = (guestId) => prisma.checkin.findMany({
  where: { guestId },
  orderBy: { checkinTime: 'desc' }
});

const deleteByGuestAndLocation = (guestId, locationType) => prisma.checkin.delete({
  where: {
    guestId_locationType: {
      guestId,
      locationType
    }
  }
});

const deleteAllByGuestId = (guestId) => prisma.checkin.deleteMany({ where: { guestId } });

const countByEvent = (eventId) => prisma.checkin.count({ where: { eventId } });

module.exports = {
  create,
  findByGuestAndLocation,
  findByGuestId,
  deleteByGuestAndLocation,
  deleteAllByGuestId,
  countByEvent
};
