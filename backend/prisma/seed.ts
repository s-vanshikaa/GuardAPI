import prisma from '../src/utils/prisma'

async function main() {
  const user = await prisma.user.upsert({
    where: { email: 'demo@guardapi.dev' },
    update: {},
    create: {
      email: 'demo@guardapi.dev',
      // Placeholder only — Ticket 3 (Authentication) introduces real bcrypt hashing.
      passwordHash: 'seed-placeholder-hash',
    },
  })

  await prisma.apiMonitor.upsert({
    where: { id: 'seed-example-monitor' },
    update: {},
    create: {
      id: 'seed-example-monitor',
      userId: user.id,
      name: 'Example API',
      endpointUrl: 'https://api.example.com/health',
      description: 'Seed row used to verify the schema and relations.',
    },
  })

  console.log(`Seeded user ${user.email} with one example monitor.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
