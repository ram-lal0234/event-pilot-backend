import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const env = require('../../../config/env');
const { verifyRealtimeToken } = require('../../../utils/realtime-auth');
const { normalizeClientId, buildAccountClientKey } = require('../../../utils/realtime-client-id');

describe('realtime-auth', () => {
  it('returns null for missing token', () => {
    expect(verifyRealtimeToken(null)).toBeNull();
    expect(verifyRealtimeToken('')).toBeNull();
  });

  it('returns null for invalid token', () => {
    expect(verifyRealtimeToken('not-a-jwt')).toBeNull();
  });

  it('returns auth payload for valid JWT', () => {
    const token = jwt.sign(
      { sub: 'user-1', accountId: 'acct-1', memberId: 'mem-1', accountRole: 'OWNER' },
      env.jwtSecret,
      { expiresIn: '1h' }
    );

    expect(verifyRealtimeToken(token)).toEqual({
      userId: 'user-1',
      accountId: 'acct-1',
      memberId: 'mem-1',
      accountRole: 'OWNER'
    });
  });

  it('returns null when sub or accountId missing', () => {
    const token = jwt.sign({ sub: 'user-1' }, env.jwtSecret);
    expect(verifyRealtimeToken(token)).toBeNull();
  });
});

describe('realtime-client-id', () => {
  it('normalizes valid UUID client ids', () => {
    const id = '550E8400-E29B-41D4-A716-446655440000';
    expect(normalizeClientId(id)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejects invalid client ids', () => {
    expect(normalizeClientId('not-uuid')).toBeNull();
    expect(normalizeClientId('')).toBeNull();
  });

  it('builds account client key', () => {
    expect(buildAccountClientKey('acct-1', '550e8400-e29b-41d4-a716-446655440000'))
      .toBe('acct-1#550e8400-e29b-41d4-a716-446655440000');
  });
});
