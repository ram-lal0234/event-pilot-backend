const serverless = require('serverless-http');
const fromShared = require('./shared');

const app = fromShared('app');

module.exports.handler = serverless(app);
