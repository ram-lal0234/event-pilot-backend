const { Worker } = require('bullmq');
const redisConnection = require('../config/redis');
const prisma = require('../config/db');
const logger = require('../utils/logger');

const workerOptions = {
  connection: redisConnection,
  concurrency: 5
};

const auditWorker = new Worker('auditQueue', async (job) => {
  await prisma.auditLog.create({
    data: job.data
  });
}, workerOptions);

const ivrWorker = new Worker('ivrQueue', async (job) => {
  logger.info('Mock Exotel IVR call triggered', job.data);
}, workerOptions);

const notificationWorker = new Worker('notificationQueue', async (job) => {
  logger.info('Mock notification sent', job.data);
}, workerOptions);

const workers = [auditWorker, ivrWorker, notificationWorker];

workers.forEach((worker) => {
  worker.on('failed', (job, error) => {
    logger.error(error, {
      queue: worker.name,
      jobId: job && job.id
    });
  });
});

module.exports = workers;
