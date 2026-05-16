const eventRepository = require('../repositories/event.repository');

const createEvent = (payload, user) => {
  return eventRepository.create({
    name: payload.name,
    date: new Date(payload.date),
    location: payload.location,
    createdBy: user.id
  });
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
