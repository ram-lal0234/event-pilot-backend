const fromShared = require('./shared');

const logger = fromShared('utils/logger');

const NON_RETRYABLE_ERROR_CODES = new Set([
  'GUEST_ID_REQUIRED',
  'RSVP_FIELDS_REQUIRED',
  'INVALID_NOTIFICATION_JOB',
  'INVALID_NOTIFICATION_CHANNEL',
  'WHATSAPP_SEND_TIMEOUT',
  'INVALID_RECIPIENT',
  'INVALID_PAYLOAD'
]);

const isNonRetryableError = (error) => {
  const code = error?.code || error?.cause?.code;
  return Boolean(code && NON_RETRYABLE_ERROR_CODES.has(code));
};

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
      if (isNonRetryableError(error)) {
        logger.warn('Dropping non-retryable SQS job', {
          messageId: record.messageId,
          eventSourceARN: record.eventSourceARN,
          errorCode: error.code,
          errorMessage: error.message
        });
        continue;
      }

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
