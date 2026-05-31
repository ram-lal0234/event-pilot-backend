import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const { parseCallbackTime } = require('../../../utils/parse-callback-time');

describe('parseCallbackTime', () => {
  const base = new Date('2026-05-29T10:00:00+05:30');

  it('parses "6 PM" in IST', () => {
    const result = parseCallbackTime('callback at 6 PM', base);
    expect(result).not.toBeNull();
    const istHours = ((result.getTime() + 5.5 * 60 * 60 * 1000) / (60 * 60 * 1000)) % 24;
    expect(Math.floor(istHours)).toBe(18);
  });

  it('parses "kal" as tomorrow 10 AM IST', () => {
    const result = parseCallbackTime('kal call karo', base);
    expect(result).not.toBeNull();
    const ist = new Date(result.getTime() + 5.5 * 60 * 60 * 1000);
    expect(ist.getUTCDate()).toBe(30);
    expect(ist.getUTCHours()).toBe(10);
  });

  it('returns null for unrecognized text', () => {
    expect(parseCallbackTime('okay fine', base)).toBeNull();
  });

  it('schedules next day if time already passed today', () => {
    const late = new Date('2026-05-29T20:00:00+05:30');
    const result = parseCallbackTime('6 PM', late);
    expect(result).not.toBeNull();
    const ist = new Date(result.getTime() + 5.5 * 60 * 60 * 1000);
    expect(ist.getUTCDate()).toBe(30);
  });

  it('returns null for empty notes', () => {
    expect(parseCallbackTime('', base)).toBeNull();
    expect(parseCallbackTime(null, base)).toBeNull();
  });
});
