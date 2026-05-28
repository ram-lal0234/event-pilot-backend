const dashboardRepository = require('../repositories/dashboard.repository');
const accessService = require('./access.service');

const getSummary = async ({ eventId }, user) => {
  await accessService.assertEventAccess(user.id, eventId, { level: 'READ' });
  return dashboardRepository.summary(eventId);
};

const getLiveFeed = async ({ eventId }, user) => {
  await accessService.assertEventAccess(user.id, eventId, { level: 'READ' });
  return dashboardRepository.liveFeed(eventId);
};

module.exports = {
  getSummary,
  getLiveFeed
};
