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

const findByIdWithEvent = (id) => {
  return prisma.guest.findUnique({
    where: { id },
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

const findManyPaginated = async ({ eventId, rsvpStatus, category, page, pageSize }) => {
  const where = {
    eventId,
    rsvpStatus,
    category
  };
  const skip = (page - 1) * pageSize;

  const [items, total] = await prisma.$transaction([
    prisma.guest.findMany({
      where,
      include: {
        checkins: true,
        cabAssignments: true,
        roomAssignments: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.guest.count({ where })
  ]);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    }
  };
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
  findByIdWithEvent,
  findByQrCode,
  findMany,
  findManyPaginated,
  update,
  remove
};
