const AppError = require('../utils/AppError');

/** Unknown /api routes get the standard JSON error; unknown pages get plain text. */
module.exports = (req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    return next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
  }
  return res.status(404).type('text').send('Page not found');
};
