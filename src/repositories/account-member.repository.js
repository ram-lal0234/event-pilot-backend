const prisma = require('../config/db');

const activeMemberWhere = {
  status: 'ACCEPTED',
  revokedAt: null
};

const findById = (id) => prisma.accountMember.findUnique({
  where: { id },
  include: {
    account: true,
    eventAccess: {
      include: {
        event: {
          select: { id: true, name: true, date: true, location: true, accountId: true }
        }
      }
    }
  }
});

const findActiveByUserId = (userId) => prisma.accountMember.findFirst({
  where: { userId, ...activeMemberWhere },
  include: { account: true }
});

const findByInviteCode = (inviteCode) => prisma.accountMember.findFirst({
  where: {
    inviteCode,
    revokedAt: null,
    status: { in: ['PENDING', 'ACCEPTED'] }
  },
  include: { account: true }
});

const findPendingByEmail = (email) => prisma.accountMember.findFirst({
  where: {
    email: { equals: email, mode: 'insensitive' },
    status: 'PENDING',
    revokedAt: null
  },
  include: { account: true }
});

const findByAccountId = (accountId) => prisma.accountMember.findMany({
  where: { accountId },
  orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  include: {
    eventAccess: {
      include: {
        event: { select: { id: true, name: true, date: true } }
      }
    }
  }
});

const create = (data) => prisma.accountMember.create({ data });

const update = (id, data) => prisma.accountMember.update({ where: { id }, data });

module.exports = {
  activeMemberWhere,
  findById,
  findActiveByUserId,
  findByInviteCode,
  findPendingByEmail,
  findByAccountId,
  create,
  update
};
