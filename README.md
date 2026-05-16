# EventPilot AI (CamRSVP) Backend

Production-ready Node.js, Express, PostgreSQL, Prisma, Joi, JWT, and BullMQ backend for event RSVP, QR check-in, transport, hotel assignment, IVR workflows, and dashboard feeds.

## Quick Start

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

Run queue workers in a separate process:

```bash
npm run worker
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
