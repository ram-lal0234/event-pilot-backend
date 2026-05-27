const eventRepository = require('../repositories/event.repository');
const auditService = require('./audit.service');

const createEvent = async (payload, user) => {
  const event = await eventRepository.create({
    name: payload.name,
    date: new Date(payload.date),
    location: payload.location,
    createdBy: user.id
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
      location: event.location
    }
  });

  return event;
};

const listEvents = (user) => {
  if (user.role === 'ADMIN') {
    return eventRepository.findByCreator(user.id);
  }

  return eventRepository.findByCreator(user.id);
};

module.exports = {
  createEvent,
  listEvents
};
