// Must be the FIRST import of runner.ts: src/utils/prisma.ts reads
// DATABASE_URL when it is first loaded, and probeService reads its SSRF
// switch at call time, so both have to be settled before any src/ import.
//
// Everything here affects only the benchmark process — nothing in src/ is
// modified or read from a benchmark-only code path.

const DEFAULT_BENCHMARK_DATABASE_URL =
  'postgresql://guardapi:guardapi@localhost:5432/guardapi_benchmark?schema=public'

const databaseUrl = process.env.BENCHMARK_DATABASE_URL ?? DEFAULT_BENCHMARK_DATABASE_URL

// The runner wipes every table between configurations, so refuse to touch
// anything that is not clearly a throwaway benchmark database.
const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '')
if (!databaseName.includes('benchmark')) {
  throw new Error(
    `Refusing to run: database "${databaseName}" does not contain "benchmark" in its name. ` +
      'The benchmark deletes all rows in the target database.',
  )
}

process.env.DATABASE_URL = databaseUrl

// The mock target listens on loopback, which the SSRF guard blocks by design.
// This is the same switch the vitest config uses; it is set for this process only.
process.env.GUARDAPI_TEST_ALLOW_PRIVATE_TARGETS = 'true'

// Incident emails are stubbed so the benchmark measures GuardAPI, not an SMTP
// server (the test suite mocks the same module). The stub is installed in the
// CommonJS module cache before src/ loads, so production code is untouched.
const emailServicePath = require.resolve('../src/services/emailService')
require.cache[emailServicePath] = {
  id: emailServicePath,
  filename: emailServicePath,
  loaded: true,
  exports: { sendIncidentEmail: async () => undefined },
} as unknown as NodeJS.Module

export const benchmarkDatabaseName = databaseName
