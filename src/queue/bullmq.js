const { Queue } = require('bullmq');
const redisConnection = require('../config/redis');

const queueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: 1000,
    removeOnFail: 5000
  }
};

const queues = {};

const getQueue = (name) => {
  if (!queues[name]) {
    queues[name] = new Queue(name, queueOptions);
  }

  return queues[name];
};

module.exports = {
  getQueue
};
