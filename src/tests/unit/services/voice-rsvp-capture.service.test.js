import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const prismaMock = globalThis.__PRISMA_MOCK__;
const require = createRequire(import.meta.url);

vi.mock('../../../services/audit.service', () => ({ enqueueAuditLog: vi.fn() }));
vi.mock('../../../services/callback-schedule.service', () => ({ scheduleCallback: vi.fn() }));
vi.mock('../../../services/outreach.service', () => ({
  handleCallOutcomeForOutreach: vi.fn().mockResolvedValue({ handled: false })
}));
vi.mock('../../../services/realtime-events', () => ({
  publishGuestEventAsync: vi.fn(),
  publishCallEventAsync: vi.fn()
}));

const voiceRsvpCapture = require('../../../services/voice-rsvp-capture.service');
const { guestFixture } = require('../../fixtures/guest.fixture');

describe('voice-rsvp-capture.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ivrLog.findFirst.mockResolvedValue(null);
    prismaMock.ivrLog.create.mockResolvedValue({});
    prismaMock.guest.findFirst.mockImplementation((args) => {
      if (args?.where?.id === guestFixture.id) {
        return Promise.resolve(guestFixture);
      }
      return Promise.resolve(null);
    });
    prismaMock.guest.update.mockImplementation((args) => (
      Promise.resolve({ ...guestFixture, ...args.data })
    ));
    prismaMock.call.findUnique.mockResolvedValue(null);
    prismaMock.call.findFirst.mockResolvedValue({
      id: 'call-1',
      guestId: guestFixture.id,
      eventId: guestFixture.eventId,
      status: 'RINGING',
      callUuid: null
    });
    prismaMock.call.update.mockImplementation((args) => Promise.resolve({
      id: args.where.id,
      guestId: guestFixture.id,
      eventId: guestFixture.eventId,
      status: args.data.status || 'COMPLETED',
      callUuid: args.data.callUuid || 'plivo-uuid'
    }));
  });

  it('maps IVR digits to RSVP outcomes', () => {
    expect(voiceRsvpCapture.mapIvrDigitToCapture('1')).toEqual({
      rsvpStatus: 'CONFIRMED',
      callOutcome: 'completed'
    });
    expect(voiceRsvpCapture.mapIvrDigitToCapture('2')).toEqual({
      rsvpStatus: 'DECLINED',
      callOutcome: 'declined'
    });
    expect(voiceRsvpCapture.mapIvrDigitToCapture('3')).toEqual({
      rsvpStatus: 'PENDING',
      callOutcome: 'maybe'
    });
    expect(voiceRsvpCapture.mapIvrDigitToCapture('4')).toEqual({
      rsvpStatus: 'PENDING',
      callOutcome: 'callback_later'
    });
  });

  it('captures confirmed IVR RSVP with shared guest update path', async () => {
    const result = await voiceRsvpCapture.captureVoiceRsvpResult({
      guestId: guestFixture.id,
      callId: 'call-1',
      callUuid: 'plivo-uuid',
      digitInput: '1',
      rsvpStatus: 'CONFIRMED',
      callOutcome: 'completed',
      callStatus: 'COMPLETED'
    }, { callMode: 'ivr' });

    expect(result.rsvpUpdated).toBe(true);
    expect(result.rsvpStatus).toBe('CONFIRMED');
    expect(prismaMock.guest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: guestFixture.id },
      data: expect.objectContaining({
        rsvpStatus: 'CONFIRMED',
        ivrRespondedAt: expect.any(Date),
        lastContactedAt: expect.any(Date)
      })
    }));
  });

  it('captures AI payload fields on the shared path', async () => {
    const result = await voiceRsvpCapture.captureVoiceRsvpResult({
      guestId: guestFixture.id,
      callId: 'call-1',
      callOutcome: 'completed',
      rsvpStatus: 'CONFIRMED',
      groupSize: 4,
      pickupLocation: 'Airport',
      needsCab: true,
      needsHotel: false,
      guestNotes: 'Arriving late',
      language: 'hi'
    }, { callMode: 'ai' });

    expect(result.rsvpUpdated).toBe(true);
    expect(prismaMock.guest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        groupSize: 4,
        pickupLocation: 'Airport',
        needsCab: true,
        needsHotel: false,
        guestNotes: 'Arriving late',
        language: 'hi'
      })
    }));
  });
});
