const { buildPublicAppPath } = require('./app-url.util');

const buildPublicRsvpUrl = (code) => buildPublicAppPath('/rsvp/', code);

module.exports = {
  buildPublicRsvpUrl
};
