const prisma = require('../config/db');

const create = (data) => {
  return prisma.event.create({ data });
};

const findByCreator = (createdBy) => {
  return prisma.event.findMany({
    where: { createdBy, deletedAt: null },
    orderBy: { date: 'asc' }
  });
};

const findByAccountId = (accountId) => {
  return prisma.event.findMany({
    where: { accountId, deletedAt: null },
    orderBy: { date: 'asc' }
  });
};

const findById = (id) => {
  return prisma.event.findUnique({
    where: { id }
  });
};

const findByIdWithSetting = (id) => {
  return prisma.event.findUnique({
    where: { id },
    include: { setting: true }
  });
};

const update = (id, data) => {
  return prisma.event.update({
    where: { id },
    data
  });
};

module.exports = {
  create,
  findByCreator,
  findByAccountId,
  findById,
  findByIdWithSetting,
  update
};
