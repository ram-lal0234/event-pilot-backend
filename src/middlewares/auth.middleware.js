const jwt = require('jsonwebtoken');
const env = require('../config/env');
const prisma = require('../config/db');
const AppError = require('../utils/AppError');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Missing bearer token', 401, 'UNAUTHENTICATED');
    }

    const token = header.replace('Bearer ', '');
    const payload = jwt.verify(token, env.jwtSecret);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true }
    });

    if (!user) {
      throw new AppError('User no longer exists', 401, 'UNAUTHENTICATED');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(new AppError('Invalid or expired token', 401, 'UNAUTHENTICATED'));
      return;
    }

    next(error);
  }
};

module.exports = authenticate;
