const accountFixture = {
  id: 'acct_test_01',
  name: 'Test Wedding Co',
  tier: 'FREE',
  createdAt: new Date('2026-01-01T00:00:00.000Z')
};

const ownerMemberFixture = {
  id: 'member_owner_01',
  accountId: accountFixture.id,
  userId: 'user_owner_01',
  email: 'owner@example.com',
  role: 'OWNER',
  status: 'ACCEPTED',
  account: accountFixture
};

const staffMemberFixture = {
  id: 'member_staff_01',
  accountId: accountFixture.id,
  userId: 'user_staff_01',
  email: 'staff@example.com',
  role: 'STAFF',
  status: 'ACCEPTED',
  account: accountFixture
};

module.exports = {
  accountFixture,
  ownerMemberFixture,
  staffMemberFixture
};
