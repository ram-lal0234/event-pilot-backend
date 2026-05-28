const prisma = require('../config/db');

const findByMemberAndEvent = (memberId, eventId) => prisma.eventAccess.findUnique({
  where: {
    memberId_eventId: { memberId, eventId }
  }
});

const replaceForMember = async (memberId, assignments) => {
  await prisma.$transaction([
    prisma.eventAccess.deleteMany({ where: { memberId } }),
    ...(assignments.length
      ? [
        prisma.eventAccess.createMany({
          data: assignments.map((item) => ({
            memberId,
            eventId: item.eventId,
            accessLevel: item.accessLevel || 'FULL'
          }))
        })
      ]
      : [])
  ]);

  return prisma.eventAccess.findMany({
    where: { memberId },
    include: {
      event: { select: { id: true, name: true, date: true } }
    }
  });
};

module.exports = {
  findByMemberAndEvent,
  replaceForMember
};
