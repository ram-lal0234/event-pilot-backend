const parseRecord = (record) => {
  const body = JSON.parse(record.body);
  return body.payload || body;
};

const processBatch = async (event, handler) => {
  const batchItemFailures = [];

  for (const record of event.Records || []) {
    try {
      await handler(parseRecord(record), record);
    } catch (error) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

module.exports = {
  processBatch
};
