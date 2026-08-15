import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  var prismaClient: PrismaClient | undefined
}

// Reuse a single client across tsx watch reloads in dev so we don't
// open a fresh Postgres connection pool on every file save.
const prisma =
  globalThis.prismaClient ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaClient = prisma
}

export default prisma
