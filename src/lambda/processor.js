const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const ivrService = fromShared('services/ivr.service');
const logger = fromShared('utils/logger');

const handleEventJob = async (payload) => {
  const result = await ivrService.processPlivoEvent(payload);
  logger.info('Processed Plivo event', result);
};

module.exports.handler = (event) => processBatch(event, handleEventJob);
