import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const prismaMock = globalThis.__PRISMA_MOCK__;
const require = createRequire(import.meta.url);
const { guestFixture } = require('../../fixtures/guest.fixture');
const ivrService = require('../../../services/ivr.service');

vi.mock('../../../services/audit.service', () => ({ enqueueAuditLog: vi.fn() }));
vi.mock('../../../services/outreach.service', () => ({
  handleCallOutcomeForOutreach: vi.fn().mockResolvedValue({ handled: false })
}));
vi.mock('../../../services/realtime-events', () => ({
  publishGuestEventAsync: vi.fn(),
  publishCallEventAsync: vi.fn()
}));

vi.mock('../../../config/env', () => ({
  publicApiUrl: 'https://api.example.com',
  voiceTransportEnabled: 'true',
  voiceHotelEnabled: 'true',
  plivo: {
    webhookUrl: '',
    fromNumber: '+15555550100'
  }
}));

const plivoIvrXml = require('../../../services/plivo-ivr-xml.service');

describe('plivo-ivr-xml.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.guest.findFirst.mockResolvedValue({
      ...guestFixture,
      pickupLocation: 'Jaipur Airport'
    });
    prismaMock.hotel.findMany.mockResolvedValue([{ id: 'hotel-1' }]);
    vi.spyOn(ivrService, 'handleWebhook').mockResolvedValue({ id: guestFixture.id });
  });

  it('builds digit action URLs with alphabetically sorted query params', () => {
    const url = new URL(plivoIvrXml.buildDigitActionUrl('guest-1', 'call-1', {
      step: 'group_size',
      rsvp: '1',
      groupSize: 5
    }));

    expect(url.pathname).toBe('/webhook/plivo/ivr/digit');
    expect(url.search).toBe('?callId=call-1&groupSize=5&guestId=guest-1&rsvp=1&step=group_size');
  });

  it('parses session state from query params', () => {
    expect(plivoIvrXml.parseSession({
      step: 'cab',
      rsvp: '1',
      groupSize: '12',
      needsCab: '1',
      keepPickup: '1'
    })).toEqual({
      step: 'cab',
      rsvp: '1',
      groupSize: 12,
      needsCab: true,
      needsHotel: null,
      keepPickup: true
    });
  });

  it('accepts two-digit group sizes including leading zero', () => {
    expect(plivoIvrXml.parseGroupSizeDigits('05')).toBe(5);
    expect(plivoIvrXml.parseGroupSizeDigits('12')).toBe(12);
    expect(plivoIvrXml.parseGroupSizeDigits('0')).toBeNull();
  });

  it('continues to group size after RSVP confirm', async () => {
    const xml = await plivoIvrXml.buildDigitXml({
      guestId: guestFixture.id,
      callId: 'call-1',
      digitPressed: '1',
      sessionParams: { step: 'rsvp' }
    });

    expect(xml).toContain('two digit number');
    expect(xml).toContain('step=group_size');
    expect(ivrService.handleWebhook).not.toHaveBeenCalled();
  });

  it('finalizes declined RSVP without follow-up questions', async () => {
    const xml = await plivoIvrXml.buildDigitXml({
      guestId: guestFixture.id,
      callId: 'call-1',
      digitPressed: '2',
      sessionParams: { step: 'rsvp' }
    });

    expect(xml).toContain('Thank you for letting us know');
    expect(ivrService.handleWebhook).toHaveBeenCalledWith(expect.objectContaining({
      guestId: guestFixture.id,
      callId: 'call-1',
      callOutcome: 'declined',
      rsvpStatus: 'DECLINED'
    }));
  });

  it('captures confirmed RSVP with group size, pickup, cab, and hotel', async () => {
    const xml = await plivoIvrXml.buildDigitXml({
      guestId: guestFixture.id,
      callId: 'call-1',
      digitPressed: '2',
      sessionParams: {
        step: 'hotel',
        rsvp: '1',
        groupSize: '5',
        keepPickup: '1',
        needsCab: '1'
      }
    });

    expect(xml).toContain('attendance is confirmed');
    expect(ivrService.handleWebhook).toHaveBeenCalledWith(expect.objectContaining({
      callOutcome: 'completed',
      rsvpStatus: 'CONFIRMED',
      groupSize: 5,
      pickupLocation: 'Jaipur Airport',
      needsCab: true,
      needsHotel: false
    }));
  });
});
