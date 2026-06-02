import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const prismaMock = globalThis.__PRISMA_MOCK__;
const require = createRequire(import.meta.url);

vi.mock('../../../services/audit.service', () => ({ enqueueAuditLog: vi.fn() }));
vi.mock('../../../services/outreach.service', () => ({
  handleCallOutcomeForOutreach: vi.fn().mockResolvedValue({ handled: false })
}));
vi.mock('../../../services/realtime-events', () => ({
  publishGuestEventAsync: vi.fn(),
  publishCallEventAsync: vi.fn()
}));

const ivrService = require('../../../services/ivr.service');

describe('ivr.service hangup resolution', () => {
  const call = {
    id: 'call-1',
    guestId: 'guest-1',
    eventId: 'event-1',
    status: 'RINGING',
    createdAt: new Date('2026-05-31T18:00:00.000Z')
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.ivrLog.findFirst.mockResolvedValue(null);
  });

  it('detects terminal hangup payloads', () => {
    expect(ivrService.isTerminalHangupPayload({ Event: 'Hangup' })).toBe(true);
    expect(ivrService.isTerminalHangupPayload({ CallStatus: 'completed' })).toBe(true);
    expect(ivrService.isTerminalHangupPayload({ Event: 'Ring' })).toBe(false);
  });

  it('marks hangup without digit capture as FAILED', async () => {
    const result = await ivrService.resolveTerminalStatusForHangup(
      call,
      { Event: 'Hangup', CallStatus: 'completed' },
      'COMPLETED'
    );

    expect(result).toEqual({
      status: 'FAILED',
      callOutcome: 'no_answer',
      abandonedIvr: true
    });
    expect(prismaMock.ivrLog.findFirst).toHaveBeenCalled();
  });

  it('keeps COMPLETED when RSVP was captured during the call', async () => {
    prismaMock.ivrLog.findFirst.mockResolvedValue({ id: 'ivr-log-1' });

    const result = await ivrService.resolveTerminalStatusForHangup(
      call,
      { Event: 'Hangup', CallStatus: 'completed' },
      'COMPLETED'
    );

    expect(result).toEqual({
      status: 'COMPLETED',
      callOutcome: null,
      abandonedIvr: false
    });
  });

  it('keeps COMPLETED when call was already completed by digit webhook', async () => {
    const completedCall = { ...call, status: 'COMPLETED' };

    const result = await ivrService.resolveTerminalStatusForHangup(
      completedCall,
      { Event: 'Hangup', CallStatus: 'completed' },
      'COMPLETED'
    );

    expect(result.status).toBe('COMPLETED');
    expect(prismaMock.ivrLog.findFirst).not.toHaveBeenCalled();
  });
});
