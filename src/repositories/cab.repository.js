const prisma = require('../config/db');

const create = (data) => prisma.cab.create({ data });

const findById = (id) => prisma.cab.findUnique({ where: { id } });

const assignedGroupSize = async (cabId) => {
  const assignments = await prisma.cabAssignment.findMany({
    where: { cabId },
    include: { guest: { select: { groupSize: true } } }
  });

  return assignments.reduce((total, assignment) => total + assignment.guest.groupSize, 0);
};

const assignGuest = (data) => prisma.cabAssignment.create({ data });

module.exports = {
  create,
  findById,
  assignedGroupSize,
  assignGuest
};
