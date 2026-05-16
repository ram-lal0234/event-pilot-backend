const prisma = require('../config/db');

const create = (data) => prisma.checkin.create({ data });

const countByEvent = (eventId) => prisma.checkin.count({ where: { eventId } });

module.exports = {
  create,
  countByEvent
};
