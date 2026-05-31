import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const prismaMock = globalThis.__PRISMA_MOCK__;
const require = createRequire(import.meta.url);
const publicRsvpService = require('../../../services/public-rsvp.service');
const { inviteFixture, guestFixture } = require('../../fixtures/guest.fixture');

describe('public-rsvp.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns sanitized invite payload', async () => {
    prismaMock.guestInvite.findFirst.mockResolvedValue(inviteFixture);

    const result = await publicRsvpService.getByCode({ code: inviteFixture.code });

    expect(result.code).toBe(inviteFixture.code);
    expect(result.guest.name).toBe(guestFixture.name);
    expect(result.event.name).toBe(guestFixture.event.name);
  });

  it('throws when invite is missing', async () => {
    prismaMock.guestInvite.findFirst.mockResolvedValue(null);

    await expect(publicRsvpService.getByCode({ code: 'missing' }))
      .rejects.toMatchObject({
        statusCode: 404,
        code: 'INVITE_NOT_FOUND'
      });
  });

  it('submits RSVP and marks invite used', async () => {
    prismaMock.guestInvite.findFirst.mockResolvedValue(inviteFixture);
    prismaMock.guest.update.mockResolvedValue({
      ...guestFixture,
      rsvpStatus: 'CONFIRMED',
      groupSize: 3
    });
    prismaMock.guestInvite.update.mockResolvedValue({});

    const result = await publicRsvpService.submit({
      code: inviteFixture.code,
      payload: {
        rsvpStatus: 'CONFIRMED',
        groupSize: 3,
        needsCab: true,
        needsHotel: false
      }
    });

    expect(result.guest.rsvpStatus).toBe('CONFIRMED');
    expect(prismaMock.guestInvite.update).toHaveBeenCalled();
  });
});
