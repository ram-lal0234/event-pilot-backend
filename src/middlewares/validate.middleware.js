const AppError = require('../utils/AppError');

const validate = (schemaMap) => {
  return (req, res, next) => {
    const targets = ['body', 'params', 'query'];

    for (const target of targets) {
      if (!schemaMap[target]) {
        continue;
      }

      const { value, error } = schemaMap[target].validate(req[target], {
        abortEarly: false,
        stripUnknown: true,
        convert: true
      });

      if (error) {
        const validationError = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
        validationError.details = error.details.map((detail) => ({
          message: detail.message,
          path: detail.path.join('.')
        }));
        next(validationError);
        return;
      }

      req[target] = value;
    }

    next();
  };
};

module.exports = validate;
