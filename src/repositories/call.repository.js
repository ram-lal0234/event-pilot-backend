const prisma = require('../config/db');

const create = (data) => prisma.call.create({ data });

const findById = (id) => prisma.call.findUnique({ where: { id } });

const findByCallUuid = (callUuid) => prisma.call.findUnique({ where: { callUuid } });

const update = (id, data) => prisma.call.update({ where: { id }, data });

const updateByCallUuid = (callUuid, data) => prisma.call.update({ where: { callUuid }, data });

const createEvent = (data) => prisma.callEvent.create({ data });

const ACTIVE_CALL_STATUSES = ['QUEUED', 'DIALING', 'RINGING', 'ANSWERED', 'AI_ACTIVE'];

const findActiveByGuestId = (guestId) => prisma.call.findFirst({
  where: {
    guestId,
    status: { in: ACTIVE_CALL_STATUSES }
  },
  orderBy: { createdAt: 'desc' }
});

module.exports = {
  create,
  findById,
  findByCallUuid,
  findActiveByGuestId,
  update,
  updateByCallUuid,
  createEvent
};
