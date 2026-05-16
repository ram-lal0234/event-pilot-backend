const eventRepository = require('../repositories/event.repository');
const dashboardRepository = require('../repositories/dashboard.repository');
const AppError = require('../utils/AppError');

const getSummary = async ({ eventId }, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return dashboardRepository.summary(eventId);
};

const getLiveFeed = async ({ eventId }, user) => {
  const hasAccess = await eventRepository.userCanAccessEvent(eventId, user);

  if (!hasAccess) {
    throw new AppError('Event not found or inaccessible', 404, 'EVENT_NOT_FOUND');
  }

  return dashboardRepository.liveFeed(eventId);
};

module.exports = {
  getSummary,
  getLiveFeed
};
