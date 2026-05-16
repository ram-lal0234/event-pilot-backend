const prisma = require('../config/db');

const createHotel = (data) => prisma.hotel.create({ data });

const findHotelById = (id) => prisma.hotel.findUnique({ where: { id } });

const createRoom = (data) => prisma.room.create({ data });

const findRoomById = (id) => prisma.room.findUnique({
  where: { id },
  include: {
    hotel: {
      select: {
        id: true,
        eventId: true
      }
    }
  }
});

const assignedMembers = async (roomId) => {
  const result = await prisma.roomAssignment.aggregate({
    where: { roomId },
    _sum: {
      assignedMembers: true
    }
  });

  return result._sum.assignedMembers || 0;
};

const assignGuest = (data) => prisma.roomAssignment.create({ data });

module.exports = {
  createHotel,
  findHotelById,
  createRoom,
  findRoomById,
  assignedMembers,
  assignGuest
};
