const dotenv = require('dotenv');
const Joi = require('joi');

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(4000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  EMAIL_PROVIDER: Joi.string().valid('mock', 'resend').default('mock'),
  RESEND_API_KEY: Joi.string().allow('', null),
  EMAIL_FROM: Joi.string().allow('', null),
  AWS_REGION: Joi.string().default('ap-south-1'),
  QUEUE_PROVIDER: Joi.string().valid('sqs', 'local').default('local'),
  CALL_QUEUE_URL: Joi.string().uri().allow('', null),
  EVENT_QUEUE_URL: Joi.string().uri().allow('', null),
  PLIVO_AUTH_ID: Joi.string().allow('', null),
  PLIVO_AUTH_TOKEN: Joi.string().allow('', null),
  PLIVO_FROM_NUMBER: Joi.string().allow('', null),
  PLIVO_ANSWER_URL: Joi.string().uri().allow('', null),
  PLIVO_WEBHOOK_URL: Joi.string().uri().allow('', null),
  PUBLIC_API_URL: Joi.string().uri().allow('', null)
}).unknown(true);

const { value, error } = envSchema.validate(process.env, { abortEarly: false });

if (error) {
  throw new Error(`Invalid environment configuration: ${error.message}`);
}

if (value.NODE_ENV === 'production' && value.EMAIL_PROVIDER !== 'resend') {
  throw new Error('Invalid environment configuration: "EMAIL_PROVIDER" must be "resend" in production');
}

if (value.EMAIL_PROVIDER === 'resend' && (!value.RESEND_API_KEY || !value.EMAIL_FROM)) {
  throw new Error('Invalid environment configuration: "RESEND_API_KEY" and "EMAIL_FROM" are required when EMAIL_PROVIDER is "resend"');
}

if (value.QUEUE_PROVIDER === 'sqs' && (!value.CALL_QUEUE_URL || !value.EVENT_QUEUE_URL)) {
  throw new Error('Invalid environment configuration: "CALL_QUEUE_URL" and "EVENT_QUEUE_URL" are required when QUEUE_PROVIDER is "sqs"');
}

module.exports = {
  nodeEnv: value.NODE_ENV,
  port: value.PORT,
  databaseUrl: value.DATABASE_URL,
  jwtSecret: value.JWT_SECRET,
  jwtExpiresIn: value.JWT_EXPIRES_IN,
  emailProvider: value.EMAIL_PROVIDER,
  resendApiKey: value.RESEND_API_KEY || undefined,
  emailFrom: value.EMAIL_FROM || undefined,
  awsRegion: value.AWS_REGION,
  queueProvider: value.QUEUE_PROVIDER,
  queues: {
    call: value.CALL_QUEUE_URL || undefined,
    event: value.EVENT_QUEUE_URL || undefined
  },
  plivo: {
    authId: value.PLIVO_AUTH_ID || undefined,
    authToken: value.PLIVO_AUTH_TOKEN || undefined,
    fromNumber: value.PLIVO_FROM_NUMBER || undefined,
    answerUrl: value.PLIVO_ANSWER_URL || undefined,
    webhookUrl: value.PLIVO_WEBHOOK_URL || undefined
  },
  publicApiUrl: value.PUBLIC_API_URL || undefined
};
