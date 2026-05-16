const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const emailService = require('./email.service');

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const requestLoginOtp = async ({ email }) => {
  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);

  await prisma.otpToken.create({
    data: {
      email,
      otpHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });

  await emailService.sendOtpEmail({ email, otp });

  return {
    email,
    message: 'OTP sent to email',
    ...(env.nodeEnv !== 'production' ? { otp } : {})
  };
};

const verifyOtp = async ({ email, otp }) => {
  const token = await prisma.otpToken.findFirst({
    where: {
      email,
      consumed: false,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!token || !(await bcrypt.compare(otp, token.otpHash))) {
    throw new AppError('Invalid OTP', 401, 'INVALID_OTP');
  }

  await prisma.otpToken.update({
    where: { id: token.id },
    data: { consumed: true }
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, role: 'ADMIN' },
    update: {}
  });

  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  return {
    user,
    accessToken
  };
};

module.exports = {
  requestLoginOtp,
  verifyOtp
};
