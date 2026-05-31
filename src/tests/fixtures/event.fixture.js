const { accountFixture } = require('./account.fixture');

const eventFixture = {
  id: 'evt_test_01',
  accountId: accountFixture.id,
  name: 'Sharma Wedding',
  date: new Date('2026-12-01T00:00:00.000Z'),
  location: 'Delhi',
  deletedAt: null,
  setting: {
    voiceAiEnabled: true,
    ivrEnabled: true,
    qrEnabled: true
  }
};

module.exports = {
  eventFixture
};
