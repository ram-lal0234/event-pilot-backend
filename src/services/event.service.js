const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');
const accessService = require('./access.service');

const createEvent = async (payload, user) => {
  const member = await accessService.assertCanCreateEvent(user.id);

  const event = await eventRepository.create({
    name: payload.name,
    date: new Date(payload.date),
    location: payload.location,
    createdBy: user.id,
    accountId: member.accountId
  });

  await auditService.enqueueAuditLog({
    eventId: event.id,
    userId: user.id,
    action: 'EVENT_CREATED',
    entityType: 'Event',
    entityId: event.id,
    metadata: {
      name: event.name,
      date: event.date,
      location: event.location,
      accountId: member.accountId
    }
  });

  return { ...event, accessLevel: 'FULL' };
};

const listEvents = async (user) => {
  return accessService.listAccessibleEvents(user.id);
};

module.exports = {
  createEvent,
  listEvents
};
