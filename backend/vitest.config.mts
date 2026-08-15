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
    },
  },
})
