const prisma = require('../config/db');

const create = (data) => {
  return prisma.guest.create({
    data,
    include: {
      event: {
        select: {
          id: true,
          name: true,
          date: true,
          location: true
        }
      }
    }
  });
};

const findById = (id) => {
  return prisma.guest.findUnique({
    where: { id }
  });
};

const findByQrCode = (qrCode) => {
  return prisma.guest.findUnique({
    where: { qrCode }
  });
};

const findMany = ({ eventId, rsvpStatus, category }) => {
  return prisma.guest.findMany({
    where: {
      eventId,
      rsvpStatus,
      category
    },
    include: {
      checkins: true,
      cabAssignments: true,
      roomAssignments: true
    },
    orderBy: { createdAt: 'desc' }
  });
};

const update = (id, data) => {
  return prisma.guest.update({
    where: { id },
    data
  });
};

const remove = (id) => {
  return prisma.guest.delete({
    where: { id }
  });
};

module.exports = {
  create,
  findById,
  findByQrCode,
  findMany,
  update,
  remove
};
