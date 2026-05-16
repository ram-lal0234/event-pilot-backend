const env = require('./env');

const redisConnection = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  maxRetriesPerRequest: null
};

module.exports = redisConnection;
