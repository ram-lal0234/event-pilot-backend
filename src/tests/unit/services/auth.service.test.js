import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const env = require('../../../config/env');
const authService = require('../../../services/auth.service');
const { accountFixture } = require('../../fixtures/account.fixture');

describe('auth.service', () => {
  describe('buildAuthResponse', () => {
    it('returns JWT with account claims', () => {
      const user = { id: 'user-1', email: 'test@example.com', role: 'ADMIN' };
      const member = {
        id: 'mem-1',
        accountId: accountFixture.id,
        role: 'OWNER'
      };

      const result = authService.buildAuthResponse(user, member, accountFixture);

      expect(result.accessToken).toBeTruthy();
      expect(result.user).toMatchObject({
        id: 'user-1',
        email: 'test@example.com',
        accountId: accountFixture.id,
        memberId: 'mem-1',
        accountRole: 'OWNER',
        accountName: accountFixture.name
      });

      const payload = jwt.verify(result.accessToken, env.jwtSecret);
      expect(payload.sub).toBe('user-1');
      expect(payload.accountId).toBe(accountFixture.id);
      expect(payload.memberId).toBe('mem-1');
      expect(payload.accountRole).toBe('OWNER');
    });
  });
});
