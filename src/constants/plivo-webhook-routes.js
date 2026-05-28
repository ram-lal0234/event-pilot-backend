/** Plivo AI ingress routes (under /webhook/plivo/{route}). */
const PLIVO_AI_WEBHOOK_ROUTES = Object.freeze([
  'ai/hangup',
  'ai/rsvp',
  'ai/transcript',
  'ai/error'
]);

const PLIVO_AI_WEBHOOK_ROUTE_SET = new Set(PLIVO_AI_WEBHOOK_ROUTES);

/** Common typo from Plivo console / docs. */
const PLIVO_AI_ROUTE_ALIASES = Object.freeze({
  'ai/handup': 'ai/hangup',
  'ai/lifecycle': 'ai/hangup',
  'ai/recording': 'ai/transcript'
});

const normalizePlivoAiRoute = (route) => {
  const normalized = String(route || '').toLowerCase().replace(/\/$/, '');
  return PLIVO_AI_ROUTE_ALIASES[normalized] || normalized;
};

const isAllowedPlivoAiRoute = (route) => PLIVO_AI_WEBHOOK_ROUTE_SET.has(normalizePlivoAiRoute(route));

module.exports = {
  PLIVO_AI_WEBHOOK_ROUTES,
  PLIVO_AI_WEBHOOK_ROUTE_SET,
  PLIVO_AI_ROUTE_ALIASES,
  normalizePlivoAiRoute,
  isAllowedPlivoAiRoute
};
