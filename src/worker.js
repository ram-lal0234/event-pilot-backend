const env = require('./config/env');
const logger = require('./utils/logger');

if (env.queueProvider !== 'bullmq') {
  logger.info('Worker process not started because QUEUE_PROVIDER is not bullmq');
  process.exit(0);
}

require('./queue/workers');
logger.info('BullMQ workers started');
