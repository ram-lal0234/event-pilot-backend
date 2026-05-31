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

const activeGuestWhere = { deletedAt: null };

const findById = (id) => {
  return prisma.guest.findFirst({
    where: { id, ...activeGuestWhere }
  });
};

const findByIdWithEvent = (id) => {
  return prisma.guest.findFirst({
    where: { id, ...activeGuestWhere },
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
  return prisma.guest.findFirst({
    where: { qrCode, ...activeGuestWhere }
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

const parseBooleanQuery = (value) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return undefined;
};

const buildGuestWhere = ({
  eventId,
  rsvpStatus,
  category,
  followUpStatus,
  needsCab,
  needsHotel,
  assignedTo,
  q
}) => {
  const rsvpStatuses = toList(rsvpStatus);
  const categories = toList(category);
  const followUpStatuses = toList(followUpStatus);
  const search = q ? String(q).trim() : '';
  const needsCabFilter = parseBooleanQuery(needsCab);
  const needsHotelFilter = parseBooleanQuery(needsHotel);
  const assignedToSearch = assignedTo ? String(assignedTo).trim() : '';

  return {
    eventId,
    ...activeGuestWhere,
    ...(rsvpStatuses?.length ? { rsvpStatus: { in: rsvpStatuses } } : {}),
    ...(categories?.length ? { category: { in: categories } } : {}),
    ...(followUpStatuses?.length ? { followUpStatus: { in: followUpStatuses } } : {}),
    ...(needsCabFilter === true ? { needsCab: true } : needsCabFilter === false ? { needsCab: false } : {}),
    ...(needsHotelFilter === true ? { needsHotel: true } : needsHotelFilter === false ? { needsHotel: false } : {}),
    ...(assignedToSearch ? {
      assignedTo: { contains: assignedToSearch, mode: 'insensitive' }
    } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    } : {})
  };
};

const guestListInclude = {
  checkins: true,
  cabAssignments: true,
  roomAssignments: true,
  invites: {
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { code: true }
  }
};

const findMany = (query) => {
  return prisma.guest.findMany({
    where: buildGuestWhere(query),
    include: guestListInclude,
    orderBy: { createdAt: 'desc' }
  });
};

const findManyPaginated = async ({ page, pageSize, ...query }) => {
  const where = buildGuestWhere(query);
  const skip = (page - 1) * pageSize;

  const [items, total] = await prisma.$transaction([
    prisma.guest.findMany({
      where,
      include: guestListInclude,
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

const softRemove = (id) => {
  return prisma.guest.update({
    where: { id },
    data: { deletedAt: new Date() }
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
  softRemove,
  activeGuestWhere
};
