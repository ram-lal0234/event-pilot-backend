const prisma = require('../config/db');

const create = (data) => prisma.call.create({ data });

const findById = (id) => prisma.call.findUnique({ where: { id } });

const findByCallUuid = (callUuid) => prisma.call.findUnique({ where: { callUuid } });

const update = (id, data) => prisma.call.update({ where: { id }, data });

const updateByCallUuid = (callUuid, data) => prisma.call.update({ where: { callUuid }, data });

const createEvent = (data) => prisma.callEvent.create({ data });

module.exports = {
  create,
  findById,
  findByCallUuid,
  update,
  updateByCallUuid,
  createEvent
};
