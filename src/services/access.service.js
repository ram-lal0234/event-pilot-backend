const prisma = require('../config/db');
const accountMemberRepository = require('../repositories/account-member.repository');
const eventAccessRepository = require('../repositories/event-access.repository');
const eventRepository = require('../repositories/event.repository');
const AppError = require('../utils/AppError');
const {
  isPlannerRole,
  isFieldRole,
  assertPlannerRole
} = require('../utils/role-capabilities');

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
  if (!isPlannerRole(member.role) || member.role === 'STAFF') {
    throw new AppError('Your role cannot trigger voice calls', 403, 'VOICE_NOT_ALLOWED');
  }
  return { member, accessLevel };
};

const assertPlannerEventAccess = async (userId, eventId, { level = 'FULL' } = {}) => {
  const context = await assertEventAccess(userId, eventId, { level });
  assertPlannerRole(context.member.role);
  return context;
};

const assertCanPerformCheckin = async (userId, eventId, locationType) => {
  const { member } = await assertEventAccess(userId, eventId, { level: 'FULL' });

  if (member.role === 'DRIVER') {
    throw new AppError('Drivers cannot perform check-in', 403, 'CHECKIN_NOT_ALLOWED');
  }

  if (member.role === 'HOTEL') {
    if (!locationType || locationType !== 'HOTEL') {
      throw new AppError('Hotel staff can only check in guests at the hotel desk', 403, 'CHECKIN_LOCATION_DENIED');
    }
    return { member };
  }

  if (isFieldRole(member.role)) {
    throw new AppError('Your role cannot perform check-in', 403, 'CHECKIN_NOT_ALLOWED');
  }

  return { member };
};

const applyGuestListScope = (query, role) => {
  if (role === 'DRIVER') {
    return { ...query, needsCab: query.needsCab ?? 'true' };
  }
  if (role === 'HOTEL') {
    return { ...query, needsHotel: query.needsHotel ?? 'true' };
  }
  return query;
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
  assertPlannerEventAccess,
  assertCanPerformCheckin,
  applyGuestListScope,
  isPlannerRole,
  isFieldRole,
  listAccessibleEvents
};
