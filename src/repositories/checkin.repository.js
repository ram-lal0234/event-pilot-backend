const prisma = require('../config/db');

const create = (data) => prisma.checkin.create({ data });
const findByGuestId = (guestId) => prisma.checkin.findUnique({ where: { guestId } });
const deleteByGuestId = (guestId) => prisma.checkin.delete({ where: { guestId } });

const countByEvent = (eventId) => prisma.checkin.count({ where: { eventId } });

module.exports = {
  create,
  findByGuestId,
  deleteByGuestId,
  countByEvent
};
