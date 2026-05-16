const prisma = require('../config/db');

const createLog = (data) => prisma.ivrLog.create({ data });

module.exports = {
  createLog
};
