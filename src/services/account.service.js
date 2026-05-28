const { randomBytes } = require('crypto');
const prisma = require('../config/db');
const accountRepository = require('../repositories/account.repository');
const accountMemberRepository = require('../repositories/account-member.repository');
const AppError = require('../utils/AppError');

const defaultAccountName = (email) => `${email.split('@')[0]} Events`;

const createAccountForOwner = async (user, { name } = {}) => {
  const existingMember = await accountMemberRepository.findActiveByUserId(user.id);
  if (existingMember) {
    return { account: existingMember.account, member: existingMember };
  }

  const existingOwned = await accountRepository.findByOwnerId(user.id);
  if (existingOwned) {
    const member = await prisma.accountMember.findFirst({
      where: { accountId: existingOwned.id, userId: user.id },
      include: { account: true }
    });
    if (member) {
      return { account: existingOwned, member };
    }
  }

  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        name: name || defaultAccountName(user.email),
        ownerId: user.id
      }
    });

    const member = await tx.accountMember.create({
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

    return { account, member };
  });
};

const getAccountMe = async (userId) => {
  const member = await accountMemberRepository.findActiveByUserId(userId);
  if (!member) {
    throw new AppError('No active account membership', 403, 'NO_ACCOUNT_MEMBERSHIP');
  }

  return {
    account: {
      id: member.account.id,
      name: member.account.name,
      ownerId: member.account.ownerId
    },
    membership: {
      id: member.id,
      role: member.role,
      email: member.email,
      name: member.name,
      status: member.status
    }
  };
};

const updateAccountName = async (userId, name) => {
  const member = await accountMemberRepository.findActiveByUserId(userId);
  if (!member || member.role !== 'OWNER') {
    throw new AppError('Only the account owner can update account settings', 403, 'FORBIDDEN');
  }

  const account = await accountRepository.update(member.accountId, { name });
  return account;
};

module.exports = {
  createAccountForOwner,
  getAccountMe,
  updateAccountName,
  defaultAccountName
};
