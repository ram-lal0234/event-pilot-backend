const prisma = require('../config/db');

const create = (data) => {
  return prisma.event.create({ data });
};

const findByCreator = (createdBy) => {
  return prisma.event.findMany({
    where: { createdBy },
    orderBy: { date: 'asc' }
  });
};

const findById = (id) => {
  return prisma.event.findUnique({
    where: { id }
  });
};

const userCanAccessEvent = async (eventId, user) => {
  if (user.role === 'ADMIN') {
    return Boolean(await findById(eventId));
  }

  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      createdBy: user.id
    }
  });

  return Boolean(event);
};

module.exports = {
  create,
  findByCreator,
  findById,
  userCanAccessEvent
};
