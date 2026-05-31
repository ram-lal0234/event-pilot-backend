import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../../app');

describe('campaign / IVR routes', () => {
  it('requires authentication for bulk call endpoint', async () => {
    const response = await request(app)
      .post('/api/ivr/call-all')
      .send({ eventId: 'evt_test_01' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('requires authentication for guest list', async () => {
    const response = await request(app).get('/api/guests?eventId=evt_test_01');
    expect(response.status).toBe(401);
  });
});
