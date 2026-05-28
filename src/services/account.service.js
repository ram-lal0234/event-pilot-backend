const { randomBytes } = require('crypto');
const prisma = require('../config/db');
const accountRepository = require('../repositories/account.repository');
const accountMemberRepository = require('../repositories/account-member.repository');
const AppError = require('../utils/AppError');

const defaultAccountName = () => 'My Workspace';

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
        name: name || defaultAccountName(),
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
      phone: member.phone,
      status: member.status,
      onboardingCompletedAt: member.onboardingCompletedAt
    },
    needsOnboarding: !member.onboardingCompletedAt
  };
};

const completeOnboarding = async (userId, payload) => {
  const member = await accountMemberRepository.findActiveByUserId(userId);
  if (!member) {
    throw new AppError('No active account membership', 403, 'NO_ACCOUNT_MEMBERSHIP');
  }

  const name = String(payload.name || '').trim();
  const phone = String(payload.phone || '').trim();

  if (!name || name.length < 2) {
    throw new AppError('Full name is required', 400, 'VALIDATION_ERROR');
  }

  if (!phone || phone.length < 8) {
    throw new AppError('WhatsApp / phone number is required', 400, 'VALIDATION_ERROR');
  }

  const memberUpdate = {
    name,
    phone,
    onboardingCompletedAt: new Date()
  };

  if (member.role === 'OWNER') {
    const workspaceName = String(payload.workspaceName || '').trim();
    if (!workspaceName || workspaceName.length < 2) {
      throw new AppError('Organisation name is required', 400, 'VALIDATION_ERROR');
    }

    await prisma.$transaction([
      prisma.accountMember.update({
        where: { id: member.id },
        data: memberUpdate
      }),
      prisma.account.update({
        where: { id: member.accountId },
        data: { name: workspaceName }
      })
    ]);
  } else {
    await accountMemberRepository.update(member.id, memberUpdate);
  }

  return getAccountMe(userId);
};

const updateAccountName = async (userId, name) => {
  const member = await accountMemberRepository.findActiveByUserId(userId);
  if (!member || member.role !== 'OWNER') {
    throw new AppError('Only the account owner can update account settings', 403, 'FORBIDDEN');
  }

  const account = await accountRepository.update(member.accountId, { name });
  return account;
};

const updateMyProfile = async (userId, { name, phone }) => {
  const member = await accountMemberRepository.findActiveByUserId(userId);
  if (!member) {
    throw new AppError('No active account membership', 403, 'NO_ACCOUNT_MEMBERSHIP');
  }

  const data = {};
  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    data.name = trimmed || null;
  }
  if (phone !== undefined) {
    const trimmed = typeof phone === 'string' ? phone.trim() : '';
    data.phone = trimmed || null;
  }

  const updated = await accountMemberRepository.update(member.id, data);
  return {
    id: updated.id,
    role: updated.role,
    email: updated.email,
    name: updated.name,
    phone: updated.phone,
    status: updated.status
  };
};

module.exports = {
  createAccountForOwner,
  getAccountMe,
  updateAccountName,
  updateMyProfile,
  completeOnboarding,
  defaultAccountName
};
