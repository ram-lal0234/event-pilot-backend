const { randomBytes } = require('crypto');
const prisma = require('../config/db');
const accountMemberRepository = require('../repositories/account-member.repository');
const eventAccessRepository = require('../repositories/event-access.repository');
const eventRepository = require('../repositories/event.repository');
const accessService = require('./access.service');
const accountService = require('./account.service');
const emailService = require('./email.service');
const authService = require('./auth.service');
const AppError = require('../utils/AppError');
const { buildJoinUrl } = require('../utils/join-url.util');

const formatMember = (member) => ({
  id: member.id,
  email: member.email,
  name: member.name,
  phone: member.phone,
  role: member.role,
  status: member.status,
  inviteCode: member.status === 'PENDING' ? member.inviteCode : undefined,
  inviteUrl: member.status === 'PENDING' ? buildJoinUrl(member.inviteCode) : undefined,
  acceptedAt: member.acceptedAt,
  revokedAt: member.revokedAt,
  eventAccess: (member.eventAccess || []).map((grant) => ({
    eventId: grant.eventId,
    eventName: grant.event?.name,
    accessLevel: grant.accessLevel
  }))
});

const listMembers = async (userId) => {
  const owner = await accessService.assertAccountOwner(userId);
  const members = await accountMemberRepository.findByAccountId(owner.accountId);
  return members.map(formatMember);
};

const inviteMember = async (userId, payload) => {
  const owner = await accessService.assertAccountOwner(userId);
  const email = String(payload.email).trim().toLowerCase();

  if (email === owner.email.toLowerCase()) {
    throw new AppError('You cannot invite yourself', 400, 'INVALID_INVITE');
  }

  const existing = await prisma.accountMember.findFirst({
    where: {
      accountId: owner.accountId,
      email: { equals: email, mode: 'insensitive' },
      revokedAt: null
    }
  });

  if (existing) {
    throw new AppError('A member with this email already exists on the account', 409, 'MEMBER_EXISTS');
  }

  const otherUserMember = await prisma.user.findUnique({ where: { email } });
  if (otherUserMember) {
    const taken = await accountMemberRepository.findActiveByUserId(otherUserMember.id);
    if (taken) {
      throw new AppError('This user already belongs to an account', 409, 'USER_ALREADY_HAS_ACCOUNT');
    }
  }

  if (payload.role === 'OWNER') {
    throw new AppError('Cannot invite another owner', 400, 'INVALID_ROLE');
  }

  const eventAssignments = payload.eventAssignments || [];
  for (const assignment of eventAssignments) {
    const event = await eventRepository.findById(assignment.eventId);
    if (!event || event.accountId !== owner.accountId) {
      throw new AppError('Invalid event for assignment', 400, 'INVALID_EVENT');
    }
  }

  const inviteCode = randomBytes(16).toString('hex');

  const member = await prisma.$transaction(async (tx) => {
    const created = await tx.accountMember.create({
      data: {
        accountId: owner.accountId,
        email,
        name: payload.name || null,
        phone: payload.phone || null,
        role: payload.role,
        status: 'PENDING',
        inviteCode,
        invitedById: owner.id
      }
    });

    if (eventAssignments.length) {
      await tx.eventAccess.createMany({
        data: eventAssignments.map((item) => ({
          memberId: created.id,
          eventId: item.eventId,
          accessLevel: item.accessLevel || 'FULL'
        }))
      });
    }

    return tx.accountMember.findUnique({
      where: { id: created.id },
      include: {
        eventAccess: { include: { event: { select: { id: true, name: true } } } }
      }
    });
  });

  const inviteUrl = buildJoinUrl(inviteCode);
  await emailService.sendTeamInviteEmail({
    email,
    accountName: owner.account.name,
    inviteUrl,
    role: payload.role
  });

  return {
    ...formatMember(member),
    inviteUrl,
    ...(process.env.NODE_ENV !== 'production' ? { inviteCode } : {})
  };
};

const revokeMember = async (userId, memberId) => {
  const owner = await accessService.assertAccountOwner(userId);
  const member = await accountMemberRepository.findById(memberId);

  if (!member || member.accountId !== owner.accountId) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  if (member.role === 'OWNER') {
    throw new AppError('Cannot revoke the account owner', 400, 'INVALID_OPERATION');
  }

  await prisma.accountMember.update({
    where: { id: memberId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      userId: null
    }
  });

  return { id: memberId };
};

const updateMemberRole = async (userId, memberId, { role }) => {
  const owner = await accessService.assertAccountOwner(userId);
  const member = await accountMemberRepository.findById(memberId);

  if (!member || member.accountId !== owner.accountId) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  if (member.role === 'OWNER' || role === 'OWNER') {
    throw new AppError('Cannot change owner role', 400, 'INVALID_OPERATION');
  }

  const updated = await accountMemberRepository.update(memberId, { role });
  return formatMember({ ...member, ...updated, eventAccess: member.eventAccess });
};

const updateMemberEvents = async (userId, memberId, { eventAssignments }) => {
  const owner = await accessService.assertAccountOwner(userId);
  const member = await accountMemberRepository.findById(memberId);

  if (!member || member.accountId !== owner.accountId) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  if (member.role === 'OWNER') {
    throw new AppError('Owner has access to all events', 400, 'INVALID_OPERATION');
  }

  for (const assignment of eventAssignments) {
    const event = await eventRepository.findById(assignment.eventId);
    if (!event || event.accountId !== owner.accountId) {
      throw new AppError('Invalid event for assignment', 400, 'INVALID_EVENT');
    }
  }

  const grants = await eventAccessRepository.replaceForMember(
    memberId,
    eventAssignments.map((item) => ({
      eventId: item.eventId,
      accessLevel: item.accessLevel || 'FULL'
    }))
  );

  return formatMember({ ...member, eventAccess: grants });
};

const getJoinPreview = async (code) => {
  const member = await accountMemberRepository.findByInviteCode(code);

  if (!member || member.status === 'REVOKED' || member.revokedAt) {
    throw new AppError('Invite not found or expired', 404, 'INVITE_NOT_FOUND');
  }

  if (member.status === 'ACCEPTED' && member.userId) {
    throw new AppError('This invite has already been accepted', 409, 'INVITE_ALREADY_USED');
  }

  return {
    code,
    accountName: member.account.name,
    email: member.email,
    role: member.role,
    status: member.status
  };
};

const verifyOtpAndAcceptJoin = async (code, { email, otp }) => {
  const user = await authService.consumeValidOtp({ email, otp });
  return acceptJoin(code, user);
};

const acceptJoin = async (code, user) => {
  const member = await accountMemberRepository.findByInviteCode(code);

  if (!member || member.revokedAt) {
    throw new AppError('Invite not found or expired', 404, 'INVITE_NOT_FOUND');
  }

  if (member.status === 'ACCEPTED' && member.userId) {
    throw new AppError('This invite has already been accepted', 409, 'INVITE_ALREADY_USED');
  }

  if (user.email.toLowerCase() !== member.email.toLowerCase()) {
    throw new AppError('Sign in with the invited email address to accept', 403, 'INVITE_EMAIL_MISMATCH');
  }

  const existing = await accountMemberRepository.findActiveByUserId(user.id);
  if (existing && existing.id !== member.id) {
    throw new AppError('You already belong to an account', 409, 'USER_ALREADY_HAS_ACCOUNT');
  }

  const updated = await accountMemberRepository.update(member.id, {
    userId: user.id,
    status: 'ACCEPTED',
    acceptedAt: new Date()
  });

  const withAccount = await accountMemberRepository.findById(updated.id);
  return authService.buildAuthResponse(user, withAccount, withAccount.account);
};

module.exports = {
  listMembers,
  inviteMember,
  revokeMember,
  updateMemberRole,
  updateMemberEvents,
  getJoinPreview,
  verifyOtpAndAcceptJoin,
  acceptJoin
};
