import type { PrismaClient } from '@prisma/client'

// Monitor mix, assigned deterministically by index so every run (and every
// monitor count) has the same proportions:
//   indices 0-13 of each 20  → healthy   (70%)
//   indices 14-16            → slow      (15%)
//   index   17               → error     (5%)  → opens one OUTAGE incident
//   indices 18-19            → schema    (10%) → v1 first, repointed to v2 later
export type MonitorKind = 'healthy' | 'slow' | 'error' | 'schema'

export function kindForIndex(index: number): MonitorKind {
  const slot = index % 20
  if (slot <= 13) return 'healthy'
  if (slot <= 16) return 'slow'
  if (slot === 17) return 'error'
  return 'schema'
}

export function endpointFor(kind: MonitorKind, index: number, mockBaseUrl: string): string {
  const path = kind === 'schema' ? '/schema-v1' : `/${kind}`
  // The query string just makes every monitor's URL unique; the mock ignores it.
  return `${mockBaseUrl}${path}?monitor=${index}`
}

export function expectedCounts(monitorCount: number) {
  const counts: Record<MonitorKind, number> = { healthy: 0, slow: 0, error: 0, schema: 0 }
  for (let i = 0; i < monitorCount; i++) counts[kindForIndex(i)] += 1
  return counts
}

const BENCHMARK_USER_EMAIL = 'benchmark@guardapi.local'

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // Cascades to monitors, checks, snapshots and incidents.
  await prisma.user.deleteMany()
}

export async function seedMonitors(
  prisma: PrismaClient,
  monitorCount: number,
  mockBaseUrl: string,
): Promise<void> {
  const user = await prisma.user.create({
    data: { email: BENCHMARK_USER_EMAIL, passwordHash: 'not-a-real-hash' },
  })

  await prisma.apiMonitor.createMany({
    data: Array.from({ length: monitorCount }, (_, index) => ({
      userId: user.id,
      name: `bench-monitor-${String(index).padStart(4, '0')}`,
      endpointUrl: endpointFor(kindForIndex(index), index, mockBaseUrl),
      pollIntervalMinutes: 1,
    })),
  })
}

// Repoints every schema monitor from /schema-v1 to /schema-v2 so the next
// scheduler cycle sees a breaking response change.
export async function flipSchemaMonitorsToV2(prisma: PrismaClient): Promise<number> {
  return prisma.$executeRaw`
    UPDATE api_monitors
    SET endpoint_url = replace(endpoint_url, '/schema-v1', '/schema-v2')
    WHERE endpoint_url LIKE '%/schema-v1%'`
}

// Makes every monitor due again without waiting a real minute: shifts all
// recorded checks one hour into the past. Only checked_at moves; latency and
// success values are untouched.
export async function makeAllMonitorsDue(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw`UPDATE monitor_checks SET checked_at = checked_at - interval '1 hour'`
}
