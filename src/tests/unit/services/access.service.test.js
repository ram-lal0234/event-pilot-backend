import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const prismaMock = globalThis.__PRISMA_MOCK__;
const require = createRequire(import.meta.url);
const accessService = require('../../../services/access.service');
const { ownerMemberFixture, staffMemberFixture } = require('../../fixtures/account.fixture');
const { eventFixture } = require('../../fixtures/event.fixture');

describe('access.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEventAccessLevel', () => {
    it('grants OWNER full access to account events', async () => {
      prismaMock.event.findUnique.mockResolvedValue(eventFixture);

      const result = await accessService.getEventAccessLevel(ownerMemberFixture, eventFixture.id);

      expect(result.level).toBe('FULL');
      expect(result.event?.id).toBe(eventFixture.id);
    });

    it('denies access to events outside the account', async () => {
      prismaMock.event.findUnique.mockResolvedValue({
        ...eventFixture,
        accountId: 'other-account'
      });

      const result = await accessService.getEventAccessLevel(ownerMemberFixture, eventFixture.id);

      expect(result.level).toBeNull();
    });

    it('uses event access grant for ADMIN/STAFF', async () => {
      prismaMock.event.findUnique.mockResolvedValue(eventFixture);
      prismaMock.eventAccess.findUnique.mockResolvedValue({
        accessLevel: 'READ_ONLY'
      });

      const adminMember = { ...staffMemberFixture, role: 'ADMIN' };
      const result = await accessService.getEventAccessLevel(adminMember, eventFixture.id);

      expect(result.level).toBe('READ_ONLY');
    });
  });

  describe('assertCanTriggerVoice', () => {
    it('blocks STAFF even with FULL event access', async () => {
      prismaMock.accountMember.findFirst.mockResolvedValue(staffMemberFixture);
      prismaMock.event.findUnique.mockResolvedValue(eventFixture);
      prismaMock.eventAccess.findUnique.mockResolvedValue({
        accessLevel: 'FULL'
      });

      await expect(
        accessService.assertCanTriggerVoice(staffMemberFixture.userId, eventFixture.id)
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'VOICE_NOT_ALLOWED'
      });
    });
  });
});
