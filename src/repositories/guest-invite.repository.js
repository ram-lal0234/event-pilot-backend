const prisma = require('../config/db');

const findValidByCode = (code) => prisma.guestInvite.findFirst({
  where: {
    code,
    revokedAt: null,
    OR: [
      { expiresAt: null },
      { expiresAt: { gt: new Date() } }
    ]
  },
  include: {
    guest: {
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
    }
  }
});

const create = (data) => prisma.guestInvite.create({ data });

const markUsed = (id) => prisma.guestInvite.update({
  where: { id },
  data: { usedAt: new Date() }
});

const findByGuestId = (guestId) => prisma.guestInvite.findFirst({
  where: { guestId, revokedAt: null },
  orderBy: { createdAt: 'desc' }
});

module.exports = {
  findValidByCode,
  create,
  markUsed,
  findByGuestId
};
