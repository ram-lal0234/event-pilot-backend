const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const emailService = require('./email.service');
const auditService = require('./audit.service');
const accountService = require('./account.service');
const accountMemberRepository = require('../repositories/account-member.repository');

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const buildAuthResponse = (user, member, account) => {
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      accountId: account.id,
      memberId: member.id,
      accountRole: member.role
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      accountId: account.id,
      memberId: member.id,
      accountRole: member.role,
      accountName: account.name
    },
    accessToken
  };
};

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

  await auditService.enqueueAuditLog({
    action: 'LOGIN_OTP_REQUESTED',
    entityType: 'Auth',
    entityId: email,
    metadata: {
      email
    }
  });

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

  let member = await accountMemberRepository.findActiveByUserId(user.id);

  if (!member) {
    const pendingInvite = await accountMemberRepository.findPendingByEmail(email);
    if (pendingInvite) {
      throw new AppError(
        'You have a pending team invite. Open your invite link to join the account before signing in.',
        403,
        'PENDING_TEAM_INVITE'
      );
    }

    const { account, member: ownerMember } = await accountService.createAccountForOwner(user);
    member = { ...ownerMember, account };
  }

  await auditService.enqueueAuditLog({
    userId: user.id,
    action: 'LOGIN_VERIFIED',
    entityType: 'User',
    entityId: user.id,
    metadata: {
      email: user.email,
      accountId: member.accountId,
      accountRole: member.role
    }
  });

  return buildAuthResponse(user, member, member.account);
};

module.exports = {
  requestLoginOtp,
  verifyOtp,
  buildAuthResponse
};
