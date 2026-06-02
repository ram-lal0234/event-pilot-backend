import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  buildPostSignaturePayload,
  buildSortedQueryString
} = require('../../../services/plivo-signature.service');

describe('plivo-signature.service', () => {
  it('sorts query params alphabetically in the signature base string', () => {
    const url = 'https://example.com/webhook/plivo/ivr/digit?guestId=g1&callId=c1';
    const params = {
      Digits: '1',
      CallUUID: 'uuid-123'
    };

    expect(buildPostSignaturePayload(url, params, 'nonce-1')).toBe(
      'https://example.com/webhook/plivo/ivr/digit?callId=c1&guestId=g1.CallUUIDuuid-123Digits1.nonce-1'
    );
  });

  it('builds payload without query params', () => {
    const url = 'https://example.com/webhook/plivo';
    const params = {
      CallUUID: 'uuid-123',
      Event: 'Ring'
    };

    expect(buildPostSignaturePayload(url, params, 'nonce-2')).toBe(
      'https://example.com/webhook/plivo.CallUUIDuuid-123EventRing.nonce-2'
    );
  });

  it('sorts query string entries alphabetically', () => {
    const params = new URLSearchParams('guestId=g1&callId=c1');
    expect(buildSortedQueryString(params)).toBe('callId=c1&guestId=g1');
  });
});
