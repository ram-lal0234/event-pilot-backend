const ivrService = require('../services/ivr.service');
const { processBatch } = require('./sqs-utils');
const logger = require('../utils/logger');

const handleEventJob = async (payload) => {
  const result = await ivrService.processPlivoEvent(payload);
  logger.info('Processed Plivo event', result);
};

module.exports.handler = (event) => processBatch(event, handleEventJob);
