const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');
const { startRealtimeWsServer } = require('./local/realtime-ws-server');

const REALTIME_WS_PORT = Number(process.env.REALTIME_WS_PORT || 4001);

const server = app.listen(env.port, () => {
  logger.info(`EventPilot AI backend listening on port ${env.port}`);
});

if (env.realtimeProvider === 'local') {
  startRealtimeWsServer(REALTIME_WS_PORT);
}

const shutdown = async (signal) => {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
