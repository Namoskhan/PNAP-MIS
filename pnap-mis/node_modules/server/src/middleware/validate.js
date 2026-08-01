const { ApiError } = require('../utils/response');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new ApiError(400, 'VALIDATION_ERROR', 'Invalid input', result.error.flatten())
      );
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
