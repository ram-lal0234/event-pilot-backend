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
const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
