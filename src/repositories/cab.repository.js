const prisma = require('../config/db');

const create = (data) => prisma.cab.create({ data });

const findById = (id) => prisma.cab.findUnique({ where: { id } });

const findManyByEvent = (eventId) => {
  return prisma.cab.findMany({
    where: {
      eventId,
      deletedAt: null
    },
    include: {
      assignments: {
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              groupSize: true
            }
          }
        },
        orderBy: {
          assignedAt: 'desc'
        }
      }
    },
    orderBy: {
      driverName: 'asc'
    }
  });
};

const assignGuest = (data) => prisma.cabAssignment.create({ data });

const assignGuestWithSeatReservation = ({ eventId, cabId, guestId, seats }) => {
  return prisma.$transaction(async (tx) => {
    const currentCab = await tx.cab.findUnique({
      where: { id: cabId },
      select: { capacity: true }
    });

    if (!currentCab) {
      return null;
    }

    const reservation = await tx.cab.updateMany({
      where: {
        id: cabId,
        usedSeats: {
          lte: currentCab.capacity - seats
        }
      },
      data: {
        usedSeats: {
          increment: seats
        }
      }
    });

    if (reservation.count !== 1) {
      return null;
    }

    const cab = await tx.cab.findUnique({
      where: { id: cabId },
      select: { usedSeats: true, capacity: true }
    });

    if (!cab || cab.usedSeats > cab.capacity) {
      throw new Error('CAB_CAPACITY_EXCEEDED');
    }

    return tx.cabAssignment.create({
      data: {
        eventId,
        cabId,
        guestId
      }
    });
  });
};

module.exports = {
  create,
  findById,
  findManyByEvent,
  assignGuest,
  assignGuestWithSeatReservation
};
