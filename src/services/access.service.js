const prisma = require('../config/db');
const accountMemberRepository = require('../repositories/account-member.repository');
const eventAccessRepository = require('../repositories/event-access.repository');
const eventRepository = require('../repositories/event.repository');
const AppError = require('../utils/AppError');

const getActiveMembership = async (userId) => {
  const member = await accountMemberRepository.findActiveByUserId(userId);
  if (!member) {
    throw new AppError('No active account membership', 403, 'NO_ACCOUNT_MEMBERSHIP');
  }
  return member;
};

const getEventAccessLevel = async (member, eventId) => {
  const event = await eventRepository.findById(eventId);
  if (!event || event.deletedAt) {
    return { event: null, level: null };
  }

  if (event.accountId !== member.accountId) {
    return { event, level: null };
  }

  if (member.role === 'OWNER') {
    return { event, level: 'FULL' };
  }

  const grant = await eventAccessRepository.findByMemberAndEvent(member.id, eventId);
  if (!grant) {
    return { event, level: null };
  }

  return { event, level: grant.accessLevel };
};

const assertEventAccess = async (userId, eventId, { level = 'READ' } = {}) => {
  const member = await getActiveMembership(userId);
  const { event, level: accessLevel } = await getEventAccessLevel(member, eventId);

  if (!event || !accessLevel) {
    throw new AppError('You do not have access to this event', 403, 'EVENT_ACCESS_DENIED');
  }

  if (level === 'FULL' && accessLevel === 'READ_ONLY') {
    throw new AppError('Read-only access to this event', 403, 'EVENT_READ_ONLY');
  }

  return { member, event, accessLevel };
};

const assertAccountOwner = async (userId) => {
  const member = await getActiveMembership(userId);
  if (member.role !== 'OWNER') {
    throw new AppError('Only the account owner can perform this action', 403, 'FORBIDDEN');
  }
  return member;
};

const assertCanCreateEvent = async (userId) => {
  const member = await getActiveMembership(userId);
  if (member.role !== 'OWNER') {
    throw new AppError('Only the account owner can create events', 403, 'FORBIDDEN');
  }
  return member;
};

const assertCanTriggerVoice = async (userId, eventId) => {
  const { member, accessLevel } = await assertEventAccess(userId, eventId, { level: 'FULL' });
  if (member.role === 'STAFF') {
    throw new AppError('Staff members cannot trigger voice calls', 403, 'VOICE_NOT_ALLOWED');
  }
  return { member, accessLevel };
};

const listAccessibleEvents = async (userId) => {
  const member = await getActiveMembership(userId);

  if (member.role === 'OWNER') {
    const events = await prisma.event.findMany({
      where: { accountId: member.accountId, deletedAt: null },
      orderBy: { date: 'asc' }
    });
    return events.map((event) => ({ ...event, accessLevel: 'FULL' }));
  }

  const grants = await prisma.eventAccess.findMany({
    where: { memberId: member.id },
    include: {
      event: true
    },
    orderBy: { assignedAt: 'asc' }
  });

  return grants
    .filter((grant) => grant.event && !grant.event.deletedAt)
    .map((grant) => ({
      ...grant.event,
      accessLevel: grant.accessLevel
    }));
};

module.exports = {
  getActiveMembership,
  getEventAccessLevel,
  assertEventAccess,
  assertAccountOwner,
  assertCanCreateEvent,
  assertCanTriggerVoice,
  listAccessibleEvents
};
