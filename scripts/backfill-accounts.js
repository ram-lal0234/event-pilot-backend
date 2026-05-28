/**
 * One-off backfill for users with no account yet (no events at migration time).
 * Run: node scripts/backfill-accounts.js
 */
const { randomBytes } = require('crypto');
const prisma = require('../src/config/db');

const createAccountForOwner = async (user) => {
  const existing = await prisma.accountMember.findFirst({
    where: { userId: user.id, status: 'ACCEPTED', revokedAt: null }
  });

  if (existing) {
    return existing;
  }

  const owned = await prisma.account.findUnique({ where: { ownerId: user.id } });
  if (owned) {
    const member = await prisma.accountMember.findFirst({
      where: { accountId: owned.id, userId: user.id }
    });
    if (member) return member;
  }

  const accountName = 'My Workspace';

  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: accountName,
        ownerId: user.id
      }
    });

    return tx.accountMember.create({
      data: {
        accountId: account.id,
        userId: user.id,
        email: user.email,
        role: 'OWNER',
        status: 'ACCEPTED',
        inviteCode: randomBytes(16).toString('hex'),
        acceptedAt: new Date()
      }
    });
  });
};

const main = async () => {
  const users = await prisma.user.findMany({ where: { deletedAt: null } });

  for (const user of users) {
    const member = await prisma.accountMember.findFirst({
      where: { userId: user.id, status: 'ACCEPTED', revokedAt: null }
    });

    if (!member) {
      await createAccountForOwner(user);
      console.log(`Created account for ${user.email}`);
    }
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

module.exports = { createAccountForOwner };
