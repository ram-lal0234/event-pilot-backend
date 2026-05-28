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

const findCallLogData = (id) => {
  return prisma.guest.findUnique({
    where: { id },
    include: {
      calls: {
        include: {
          events: {
            orderBy: { createdAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      },
      ivrLogs: {
        orderBy: { createdAt: 'desc' }
      }
    }
  });
};

const findByQrCode = (qrCode) => {
  return prisma.guest.findUnique({
    where: { qrCode }
  });
};

const toList = (value) => {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
};

const buildGuestWhere = ({ eventId, rsvpStatus, category, q }) => {
  const rsvpStatuses = toList(rsvpStatus);
  const categories = toList(category);
  const search = q ? String(q).trim() : '';

  return {
    eventId,
    ...(rsvpStatuses?.length ? { rsvpStatus: { in: rsvpStatuses } } : {}),
    ...(categories?.length ? { category: { in: categories } } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    } : {})
  };
};

const findMany = (query) => {
  return prisma.guest.findMany({
    where: buildGuestWhere(query),
    include: {
      checkins: true,
      cabAssignments: true,
      roomAssignments: true
    },
    orderBy: { createdAt: 'desc' }
  });
};

const findManyPaginated = async ({ page, pageSize, ...query }) => {
  const where = buildGuestWhere(query);
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
  findCallLogData,
  findByQrCode,
  findMany,
  findManyPaginated,
  update,
  remove
};
