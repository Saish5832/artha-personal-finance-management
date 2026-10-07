/** HTTP layer for authentication. Business logic lives in services/authService.js. */
const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');

// Only these three fields are taken from the body (whitelist), nothing else.
const pick = (body, keys) => Object.fromEntries(keys.map((k) => [k, body[k]]));

/** POST /api/auth/register -> 201 { user, token } */
exports.register = asyncHandler(async (req, res) => {
  const { user, token } = await authService.register(pick(req.body, ['name', 'email', 'password']));
  res.status(201).json({ success: true, data: { user, token } });
});

/** POST /api/auth/login -> 200 { user, token } */
exports.login = asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(pick(req.body, ['email', 'password']));
  res.status(200).json({ success: true, data: { user, token } });
});

/**
 * POST /api/auth/logout
 * Tokens are stateless, so logging out means the CLIENT discards its token (approved design).
 * This endpoint needs no valid token on purpose: a client with an expired token must still be
 * able to log out cleanly. It exists for API completeness and so the client has one call to make.
 */
exports.logout = (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out. The client should discard its token.' });
};

/** GET /api/auth/me (protected) -> the authenticated user's own profile */
exports.me = (req, res) => {
  res.status(200).json({ success: true, data: { user: req.user } });
};
