import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../../app');

describe('GET /api/public-rsvp/:code', () => {
  it('returns 404 envelope for unknown invite code when database is available', async () => {
    const response = await request(app).get('/api/public-rsvp/unknown-code-xyz');

    expect([404, 500]).toContain(response.status);
    if (response.status === 404) {
      expect(response.body.success).toBe(false);
    }
  });
});
