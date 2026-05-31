const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const createPrismaClient = () => {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' }
    ]
  });

  client.$on('error', (event) => logger.error(event));
  client.$on('warn', (event) => logger.warn(event));

  return client;
};

const globalForPrisma = globalThis;

let prisma;

if (process.env.VITEST === 'true' && globalForPrisma.__PRISMA_MOCK__) {
  prisma = globalForPrisma.__PRISMA_MOCK__;
} else {
  prisma = globalForPrisma.prisma || createPrismaClient();

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
  }
}

module.exports = prisma;
