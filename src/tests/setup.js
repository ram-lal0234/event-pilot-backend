import { vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  guest: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  guestInvite: {
    findFirst: vi.fn(),
    update: vi.fn()
  },
  event: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  accountMember: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  eventAccess: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn()
  },
  ivrLog: {
    findFirst: vi.fn(),
    create: vi.fn()
  },
  otpToken: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn()
  },
  user: {
    upsert: vi.fn(),
    findUnique: vi.fn()
  },
  checkin: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn()
  },
  call: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  hotel: {
    findMany: vi.fn()
  },
  $transaction: vi.fn((ops) => Promise.all(ops))
}));

vi.mock('../config/db', () => prismaMock);

globalThis.__PRISMA_MOCK__ = prismaMock;
delete globalThis.prisma;

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@localhost:5432/event_pilot_test?schema=public';
process.env.JWT_SECRET ||= 'test-jwt-secret-minimum-32-characters-long';
process.env.EMAIL_PROVIDER ||= 'mock';
process.env.QUEUE_PROVIDER ||= 'local';
process.env.REALTIME_PROVIDER ||= 'local';
