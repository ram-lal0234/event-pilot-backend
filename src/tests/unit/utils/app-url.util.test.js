import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const clearAppUrlModules = () => {
  Object.keys(require.cache).forEach((key) => {
    if (
      key.includes('config/env')
      || key.includes('app-url.util')
      || key.includes('public-rsvp.util')
      || key.includes('join-url.util')
    ) {
      delete require.cache[key];
    }
  });
};

describe('app-url.util', () => {
  beforeEach(() => {
    clearAppUrlModules();
  });

  it('builds RSVP URLs from PUBLIC_APP_URL', () => {
    process.env.PUBLIC_APP_URL = 'https://app.eventpilotai.site';
    delete process.env.PUBLIC_RSVP_BASE_URL;

    const { buildPublicRsvpUrl } = require('../../../utils/public-rsvp.util');

    expect(buildPublicRsvpUrl('abc123')).toBe('https://app.eventpilotai.site/rsvp/abc123');
  });

  it('uses PUBLIC_RSVP_BASE_URL when PUBLIC_APP_URL is unset', () => {
    delete process.env.PUBLIC_APP_URL;
    process.env.PUBLIC_RSVP_BASE_URL = 'https://app-dev.eventpilotai.site';

    const { buildPublicRsvpUrl } = require('../../../utils/public-rsvp.util');

    expect(buildPublicRsvpUrl('xyz')).toBe('https://app-dev.eventpilotai.site/rsvp/xyz');
  });

  it('builds join URLs from configured app base', () => {
    process.env.PUBLIC_APP_URL = 'http://localhost:3000';
    delete process.env.PUBLIC_RSVP_BASE_URL;

    const { buildJoinUrl } = require('../../../utils/join-url.util');

    expect(buildJoinUrl('team-code')).toBe('http://localhost:3000/join/team-code');
  });
});
