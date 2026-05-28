const prisma = require('../config/db');

const findById = (id) => prisma.account.findUnique({ where: { id } });

const findByOwnerId = (ownerId) => prisma.account.findUnique({ where: { ownerId } });

const create = (data) => prisma.account.create({ data });

const update = (id, data) => prisma.account.update({ where: { id }, data });

module.exports = {
  findById,
  findByOwnerId,
  create,
  update
};
