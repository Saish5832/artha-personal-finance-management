/**
 * authenticate: protects a route.
 *
 * Reads "Authorization: Bearer <jwt>", verifies the signature and expiry, loads the user,
 * and sets req.user. From then on, req.user._id is the ONLY source of "who is calling".
 * Controllers must never read a userId from the request body, query string or URL for
 * authorization; they scope every query with { userId: req.user._id } instead.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../services/authService');

function extractBearerToken(header) {
  if (!header) {
    throw AppError.unauthorized('Authentication required. Please log in.');
  }
  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw AppError.unauthorized('Invalid authorization header. Expected: Authorization: Bearer <token>');
  }
  return parts[1];
}

const authenticate = asyncHandler(async (req, res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  const payload = verifyToken(token); // throws 401 if invalid/expired

  if (!mongoose.isValidObjectId(payload.sub)) {
    throw AppError.unauthorized('Invalid authentication token');
  }
  const user = await User.findById(payload.sub); // passwordHash is excluded (select: false)
  if (!user) {
    // Valid signature, but the account was deleted after the token was issued.
    throw AppError.unauthorized('The account for this token no longer exists');
  }

  req.user = user;
  next();
});

module.exports = { authenticate };
