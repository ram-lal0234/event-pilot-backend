import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const prismaMock = globalThis.__PRISMA_MOCK__;
const require = createRequire(import.meta.url);

vi.mock('../../../services/audit.service', () => ({ enqueueAuditLog: vi.fn() }));
vi.mock('../../../services/callback-schedule.service', () => ({ scheduleCallback: vi.fn() }));
vi.mock('../../../services/realtime-events', () => ({
  publishGuestEventAsync: vi.fn(),
  publishCallEventAsync: vi.fn()
}));

const voiceAiService = require('../../../services/voice-ai.service');
const { guestFixture } = require('../../fixtures/guest.fixture');

describe('voice-ai.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ivrLog.findFirst.mockResolvedValue(null);
    prismaMock.ivrLog.create.mockResolvedValue({});
    prismaMock.guest.findUnique.mockImplementation((args) => {
      if (args?.where?.id === guestFixture.id) {
        return Promise.resolve(guestFixture);
      }
      return Promise.resolve(null);
    });
    prismaMock.guest.update.mockImplementation((args) => (
      Promise.resolve({ ...guestFixture, ...args.data })
    ));
  });

  describe('buildCallLinkPatch', () => {
    it('marks no_answer as FAILED', () => {
      expect(voiceAiService.resolveTerminalCallStatus('no_answer')).toBe('FAILED');
      expect(voiceAiService.resolveTerminalCallStatus('completed')).toBe('COMPLETED');
    });

    it('attaches callUuid and completes active call', () => {
      const call = { id: 'call-1', status: 'AI_ACTIVE', callUuid: null };
      const patch = voiceAiService.buildCallLinkPatch(call, {
        callUuid: 'plivo-uuid-123',
        callOutcome: 'completed'
      });

      expect(patch.callUuid).toBe('plivo-uuid-123');
      expect(patch.status).toBe('COMPLETED');
      expect(patch.lastEventAt).toBeInstanceOf(Date);
    });

    it('keeps existing callUuid when already set', () => {
      const call = { id: 'call-1', status: 'COMPLETED', callUuid: 'existing-uuid' };
      const patch = voiceAiService.buildCallLinkPatch(call, {
        callUuid: 'new-uuid',
        callOutcome: 'completed'
      });

      expect(patch.callUuid).toBeUndefined();
      expect(patch.status).toBeUndefined();
    });
  });

  describe('applyRsvpResult', () => {
    it('returns setup_ping for empty body', async () => {
      const result = await voiceAiService.applyRsvpResult({});
      expect(result.kind).toBe('setup_ping');
      expect(prismaMock.guest.update).not.toHaveBeenCalled();
    });

    it('throws when guest_id is missing', async () => {
      await expect(voiceAiService.applyRsvpResult({
        rsvpStatus: 'CONFIRMED',
        callOutcome: 'completed'
      })).rejects.toMatchObject({
        statusCode: 400,
        code: 'GUEST_ID_REQUIRED'
      });
    });

    it('saves CONFIRMED RSVP correctly', async () => {
      const result = await voiceAiService.applyRsvpResult({
        guest_id: guestFixture.id,
        rsvpStatus: 'CONFIRMED',
        callOutcome: 'completed',
        groupSize: '3',
        needsCab: 'false',
        needsHotel: 'true',
        guestNotes: '',
        language: 'hi'
      });

      expect(result.kind).toBe('rsvp');
      expect(result.rsvpUpdated).toBe(true);
      expect(prismaMock.guest.update).toHaveBeenCalled();
    });

    it('sets callback fields when callOutcome is callback_later', async () => {
      await voiceAiService.applyRsvpResult({
        guest_id: guestFixture.id,
        rsvpStatus: 'PENDING',
        callOutcome: 'callback_later',
        guestNotes: 'callback at 6 PM',
        needsCab: 'false',
        needsHotel: 'false',
        language: 'hi'
      });

      expect(prismaMock.guest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: guestFixture.id },
          data: expect.objectContaining({
            followUpStatus: 'CALLBACK_LATER',
            callbackAt: expect.any(Date)
          })
        })
      );
    });
  });
});
