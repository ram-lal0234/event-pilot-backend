const success = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const created = (res, data, message = 'Created') => success(res, data, message, 201);

module.exports = {
  success,
  created
};
