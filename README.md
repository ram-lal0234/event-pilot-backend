# EventPilot AI (CamRSVP) Backend

Production-ready Node.js, Express, PostgreSQL, Prisma, Joi, JWT, AWS SQS, and Lambda-ready backend for event RSVP, QR check-in, transport, hotel assignment, IVR workflows, and dashboard feeds.

## Quick Start

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

For Supabase, keep two database URLs:

- `DATABASE_URL`: pooled runtime URL, usually the pooler URL.
- `DIRECT_URL`: direct/session URL for Prisma migrations.

Prisma migrations should use `DIRECT_URL` through `directUrl` in `prisma/schema.prisma`; runtime app queries continue using `DATABASE_URL`.

Local development defaults to `QUEUE_PROVIDER=local`, which records audit events
in application logs only (not DynamoDB) and logs queued call/webhook jobs without
requiring AWS. `/api/dashboard/feed` returns an empty list in that mode. In AWS,
set `QUEUE_PROVIDER=sqs`, queue URLs, and `AUDIT_LOG_TABLE_NAME` (see
`serverless.yml`).

Lambda handlers:

- Core Express API: `src/lambda/core.handler`
- Plivo webhook ingest: `src/lambda/webhook.handler`
- Call queue worker: `src/lambda/dialer.handler`
- Plivo event queue processor: `src/lambda/processor.handler`

`serverless.yml` wires the HTTP API routes, SQS queues, DLQs, SQS partial-batch
responses, and reserved/max concurrency defaults for the MVP AWS deployment.

## Voice calls (IVR + AI agent)

Dashboard **Trigger IVR** (`POST /api/ivr/call`) queues an outbound Plivo call. Mode is chosen by backend (not shown in UI):

- `VOICE_DEFAULT_CALL_MODE=ai` → uses `PLIVO_AI_ANSWER_URL` (Plivo Vibe / conversational agent)
- `VOICE_DEFAULT_CALL_MODE=ivr` → uses `PLIVO_IVR_ANSWER_URL` (XML `GetDigits` on this API)

With `QUEUE_PROVIDER=local`, the call is dialed immediately after queueing (no separate worker).

**AI RSVP webhook** (configure in Plivo Vibe):

`POST {PUBLIC_API_URL}/api/voice/ai/result`

Optional header: `X-EventPilot-Voice-Secret` when `VOICE_AI_WEBHOOK_SECRET` is set.

**IVR XML endpoints:**

- `{PUBLIC_API_URL}/api/voice/ivr/answer`
- `{PUBLIC_API_URL}/api/voice/ivr/digit`

Example `.env` for AI testing with ngrok:

```bash
PUBLIC_API_URL=https://your-subdomain.ngrok-free.app
PLIVO_AI_ANSWER_URL=https://your-published-plivo-agent-answer-url
VOICE_DEFAULT_CALL_MODE=ai
VOICE_TRANSPORT_ENABLED=true
VOICE_HOTEL_ENABLED=true
```

Working vertical slice:

```bash
curl -X POST http://localhost:4000/api/guests \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "00000000-0000-0000-0000-000000000000",
    "name": "Aarav Mehta",
    "phone": "+919876543210",
    "email": "aarav@example.com",
    "category": "VIP",
    "groupSize": 2
  }'
```
