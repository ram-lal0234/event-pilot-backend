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

const softArchive = (id) => {
  return prisma.event.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
};

const restore = (id) => {
  return prisma.event.update({
    where: { id },
    data: { deletedAt: null }
  });
};

const findArchivedByAccountId = (accountId) => {
  return prisma.event.findMany({
    where: { accountId, deletedAt: { not: null } },
    orderBy: { deletedAt: 'desc' }
  });
};

module.exports = {
  create,
  findByCreator,
  findByAccountId,
  findById,
  findByIdWithSetting,
  update,
  softArchive,
  restore,
  findArchivedByAccountId
};
