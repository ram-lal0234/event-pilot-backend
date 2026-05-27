const fromShared = require('./shared');

const logger = fromShared('utils/logger');

const parseRecord = (record) => {
  const body = JSON.parse(record.body);
  return body.payload || body;
};

const processBatch = async (event, handler) => {
  const batchItemFailures = [];
  const records = event.Records || [];

  logger.info('SQS batch received', {
    recordCount: records.length
  });

  for (const record of records) {
    try {
      await handler(parseRecord(record), record);
    } catch (error) {
      logger.error(error, {
        messageId: record.messageId,
        eventSourceARN: record.eventSourceARN
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  logger.info('SQS batch processed', {
    recordCount: records.length,
    failedCount: batchItemFailures.length
  });

  return { batchItemFailures };
};

module.exports = {
  processBatch
};
