import { defineConfig } from 'vitest/config'

// Dedicated local test database — separate from the dev DB in .env so
// running tests never touches dev data. Not used outside development.
const TEST_DATABASE_URL =
  'postgresql://guardapi:guardapi@localhost:5432/guardapi_test?schema=public'

export default defineConfig({
  test: {
    environment: 'node',
    // Multiple files sharing one Postgres test DB could interleave writes.
    fileParallelism: false,
    env: {
      JWT_SECRET: 'test-jwt-secret-do-not-use-in-production',
      DATABASE_URL: TEST_DATABASE_URL,
      // Real sends are mocked (see tests/helpers.ts mockEmailService) — these
      // only need to be present so emailService's config checks don't throw.
      SMTP_HOST: 'smtp.test.local',
      SMTP_USER: 'test-user',
      SMTP_PASS: 'test-pass',
      EMAIL_FROM: 'alerts@guardapi.test',
      // probeService's SSRF guard would otherwise block the loopback test
      // servers every suite here spins up. Only vitest sets this — see
      // probeService.ts for the production-side check.
      GUARDAPI_TEST_ALLOW_PRIVATE_TARGETS: 'true',
    },
  },
})
