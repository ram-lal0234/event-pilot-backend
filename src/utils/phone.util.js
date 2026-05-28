const DEFAULT_COUNTRY_CODE = '91';

/** ITU E.164: + then 2–15 digits, first digit 1–9 */
const GENERAL_E164_PATTERN = /^\+[1-9]\d{1,14}$/;

/** Indian mobile after normalization */
const INDIA_MOBILE_E164_PATTERN = /^\+91[6-9]\d{9}$/;

const digitsOnly = (value) => String(value).replace(/\D/g, '');

const validateE164 = (phone) => GENERAL_E164_PATTERN.test(phone);

const validateIndianMobileE164 = (phone) => INDIA_MOBILE_E164_PATTERN.test(phone);

const inferDefaultCountryCode = (fromNumber) => {
  const digits = digitsOnly(fromNumber || '');

  if (digits.startsWith('91')) {
    return '91';
  }

  if (digits.startsWith('1') && digits.length >= 11) {
    return '1';
  }

  return DEFAULT_COUNTRY_CODE;
};

const normalizePhoneE164 = (
  phone,
  { defaultCountryCode = DEFAULT_COUNTRY_CODE, requireIndianMobile = defaultCountryCode === '91' } = {}
) => {
  if (phone === undefined || phone === null || String(phone).trim() === '') {
    throw new Error('Phone number is required');
  }

  const trimmed = String(phone).trim();
  const digits = digitsOnly(trimmed);

  if (!digits) {
    throw new Error('Phone number is invalid');
  }

  if (trimmed.startsWith('+')) {
    const e164 = `+${digits}`;

    if (!validateE164(e164)) {
      throw new Error('Phone number must be a valid E.164 number (e.g. +919351303055)');
    }

    if (requireIndianMobile && !validateIndianMobileE164(e164)) {
      throw new Error('Phone number must be a valid India mobile in E.164 format (e.g. +919876543210)');
    }

    return e164;
  }

  if (defaultCountryCode === '91') {
    if (requireIndianMobile) {
      if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
        return `+91${digits}`;
      }

      if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]\d{9}$/.test(digits)) {
        return `+91${digits.slice(1)}`;
      }

      if (digits.length === 12 && digits.startsWith('91') && /^91[6-9]\d{9}$/.test(digits)) {
        return `+${digits}`;
      }
    } else if (digits.length === 12 && digits.startsWith('91') && validateE164(`+${digits}`)) {
      return `+${digits}`;
    }
  }

  if (digits.startsWith(defaultCountryCode) && digits.length >= defaultCountryCode.length + 8) {
    const e164 = `+${digits}`;

    if (validateE164(e164)) {
      return e164;
    }
  }

  throw new Error('Phone number must be a valid India mobile in E.164 format (e.g. +919876543210)');
};

/** Plivo accepts `919351303055` or `+919351303055`; we send E.164 with `+`. */
const formatPhoneForPlivo = (phone, options) => normalizePhoneE164(phone, options);

module.exports = {
  digitsOnly,
  inferDefaultCountryCode,
  normalizePhoneE164,
  formatPhoneForPlivo,
  validateE164,
  validateIndianMobileE164,
  GENERAL_E164_PATTERN,
  INDIA_MOBILE_E164_PATTERN
};
