import rateLimit from 'express-rate-limit'

const rateLimitedResponse = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
}

// The test suite makes far more requests per run than any real limit would
// allow (e.g. nearly every test calls POST /auth/register via the createUser
// helper). Vitest sets NODE_ENV=test itself, so this can't accidentally
// activate outside the test runner.
const skipInTests = () => process.env.NODE_ENV === 'test'

// Register/login are unauthenticated and are the prime target for credential
// stuffing and registration spam, so they get a much tighter budget than the
// rest of the API.
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedResponse,
  skip: skipInTests,
})

// Baseline abuse protection for the whole API. This matters beyond generic
// throttling because /apis/:id/poll makes a server-side HTTP request to a
// user-supplied URL on every call — without a limit here, an authenticated
// user could use GuardAPI itself to hammer an arbitrary target.
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitedResponse,
  skip: skipInTests,
})
