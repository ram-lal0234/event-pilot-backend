const { buildPublicAppPath } = require('./app-url.util');

const buildJoinUrl = (inviteCode) => buildPublicAppPath('/join/', inviteCode);

module.exports = {
  buildJoinUrl
};
