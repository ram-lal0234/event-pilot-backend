const fromShared = require('./shared');
const { processBatch } = require('./sqs-utils');

const callDialerService = fromShared('services/call-dialer.service');

module.exports.handler = (event) => processBatch(event, (job) => callDialerService.processCallJob(job));
