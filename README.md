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

- `VOICE_DEFAULT_CALL_MODE=ai` → `POST` JSON to `PLIVO_AI_ANSWER_URL` (Plivo Vibe Agent Flow invoke URL)
- `VOICE_DEFAULT_CALL_MODE=ivr` → uses `PLIVO_IVR_ANSWER_URL` (XML `GetDigits` on this API)

AI calls use the Agent Flow endpoint directly (not the classic Call API `answer_url` pattern). Payload booleans (`transport_enabled`, `hotel_enabled`) are sent as JSON booleans; phone numbers are E.164.

In the Vibe agent editor, set call duration above a few seconds (e.g. 120s+). A very short duration (such as 4s) will hang up almost immediately after answer.

With `QUEUE_PROVIDER=local`, the call is dialed immediately after queueing (no separate worker).

**Plivo webhook ingress** (`/webhook/plivo/{proxy+}` → SQS → `processor` Lambda)

### Configure these four AI URLs in Plivo Vibe

Base: `{PUBLIC_API_URL}` (e.g. `https://78dpbxqf57.execute-api.ap-south-1.amazonaws.com`)

| Plivo setting | URL | Payload |
|---------------|-----|---------|
| **Hangup / call-ended callback** | `POST /webhook/plivo/ai/hangup` | `{ "eventType": "Hangup", "status": "COMPLETED", "callUuid": "..." }` |
| **RSVP + no-answer reporting** (flow HTTP actions) | `POST /webhook/plivo/ai/rsvp` | `{ "guestId", "rsvpStatus", "callOutcome", "groupSize", ... }` |
| **Recording / transcript callback** | `POST /webhook/plivo/ai/transcript` | Nested `data.object` with `event_data.recording_url`, `transcription` |
| **Error callback** (optional) | `POST /webhook/plivo/ai/error` | Platform/agent error payload |

**Auth when `VOICE_AI_WEBHOOK_SECRET` is set:**

| Source | Header required? |
|--------|------------------|
| **Flow HTTP actions** (`/ai/rsvp`) | Yes — `X-EventPilot-Voice-Secret: <secret>` |
| **Plivo platform callbacks** (`/ai/hangup`, `/ai/transcript`, `/ai/error`) | No — Plivo sends `created_at` + `data` + `id` JSON; custom headers are not supported on those callbacks |
| **Query fallback** (any AI route) | Optional — `?voice_secret=<secret>` |

```http
X-EventPilot-Voice-Secret: <your secret>
Content-Type: application/json
```

**Do not use** `https://example.com/eventpilot/rsvp-webhook` — point RSVP and no-answer actions to `/webhook/plivo/ai/rsvp`.

**Do not treat hangup as RSVP** — hangup only updates call lifecycle; RSVP status comes from `/ai/rsvp`.

### Other routes

| Route | Purpose |
|-------|---------|
| `POST /webhook/plivo` | Classic Call API ring/hangup (Plivo signature) |
| `POST /webhook/plivo/ivr/answer` | IVR XML (sync) |
| `POST /webhook/plivo/ivr/digit` | IVR digits (sync) |

Legacy: `POST /api/voice/ai/result` auto-routes to hangup or rsvp; prefer dedicated webhook URLs above.

### Plivo Agent Studio checklist (console — not in this repo)

| Item | Action |
|------|--------|
| **max_call_duration** | Set to **240** (or 300), not **4** seconds |
| **RSVP reporting action URL** | `https://<api-host>/webhook/plivo/ai/rsvp` (not `example.com` placeholder) |
| **RSVP action body** | Use the flow input scope for guest ID: `"guest_id": "{{Start.http.params.guest_id}}"` |
| **No-answer reporting URL** | `https://<api-host>/webhook/plivo/ai/rsvp` |
| **Flow hangup callback** | `https://<api-host>/webhook/plivo/ai/hangup` |
| **Webhook secret** | If `VOICE_AI_WEBHOOK_SECRET` is set, add header `X-EventPilot-Voice-Secret` on every result POST from the flow |
| **Flow input variables** | Match outbound JSON keys: `call_id`, `guest_id`, `guest_name`, `phone_number`, `from_number`, `event_name`, `event_date_spoken`, `event_location_spoken`, `host_label`, `existing_pickup_location`, `transport_enabled`, `hotel_enabled` |

Backend already: POSTs Agent Flow invoke URL directly (not Call API `answer_url`); sends JSON booleans; normalizes E.164; validates payload before invoke; accepts camelCase or snake_case on `/api/voice/ai/result`; avoids downgrading a strong RSVP when a weaker hangup arrives later.

**Same endpoint, two payload types** (`POST /api/voice/ai/result`):

| Type | Example fields | Backend action |
|------|----------------|----------------|
| **Lifecycle** | `eventType: "Ring"`, `status: "RINGING"`, `callUuid` | Updates `calls` status + `ivr_logs` (no RSVP change) |
| **RSVP result** | `guestId`, `callOutcome` or `rsvpStatus`, `groupSize`, … | Updates guest RSVP + `ivr_logs` |

`Hangup` + `status: "COMPLETED"` alone does **not** confirm RSVP. You still need the AI action webhook with `guestId` + `callOutcome` (fix placeholder URLs in Vibe if missing).

**IVR XML endpoints:**

- `{PUBLIC_API_URL}/api/voice/ivr/answer`
- `{PUBLIC_API_URL}/api/voice/ivr/digit`

Example `.env` for AI testing with ngrok:

```bash
PUBLIC_API_URL=https://your-subdomain.ngrok-free.app
PLIVO_AI_ANSWER_URL=https://agentflow.plivo.com/v1/account/your-auth-id/flow/your-flow-id
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
