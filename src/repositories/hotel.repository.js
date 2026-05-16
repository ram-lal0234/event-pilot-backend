const prisma = require('../config/db');

const createHotel = (data) => prisma.hotel.create({ data });

const findHotelById = (id) => prisma.hotel.findUnique({ where: { id } });

const createRoom = (data) => prisma.room.create({ data });

const findRoomById = (id) => prisma.room.findUnique({ where: { id } });

const assignedGroupSize = async (roomId) => {
  const assignments = await prisma.roomAssignment.findMany({
    where: { roomId },
    include: { guest: { select: { groupSize: true } } }
  });

  return assignments.reduce((total, assignment) => total + assignment.guest.groupSize, 0);
};

const assignGuest = (data) => prisma.roomAssignment.create({ data });

module.exports = {
  createHotel,
  findHotelById,
  createRoom,
  findRoomById,
  assignedGroupSize,
  assignGuest
};
