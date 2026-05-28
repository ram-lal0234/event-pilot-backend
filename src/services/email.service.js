const env = require('../config/env');
const logger = require('../utils/logger');

const resendEndpoint = 'https://api.resend.com/emails';

const renderOtpEmail = (otp) => ({
  subject: 'Your Event Pilot login code',
  html: `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h1 style="font-size: 20px; margin-bottom: 12px;">Your login code</h1>
      <p>Use this one-time code to sign in to Event Pilot.</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 24px 0;">${otp}</p>
      <p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
    </div>
  `,
  text: `Your Event Pilot login code is ${otp}. This code expires in 10 minutes.`
});

const sendWithResend = async ({ to, subject, html, text }) => {
  const response = await fetch(resendEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to,
      subject,
      html,
      text
    }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend email request failed with status ${response.status}: ${body}`);
  }

  return response.json().catch(() => ({}));
};

const sendOtpEmail = async ({ email, otp }) => {
  if (env.emailProvider === 'mock') {
    logger.info('Mock OTP generated', { email, otp });
    return;
  }

  const message = renderOtpEmail(otp);
  await sendWithResend({
    to: email,
    ...message
  });

  logger.info('OTP email sent', { email, provider: env.emailProvider });
};

module.exports = {
  sendOtpEmail
};
