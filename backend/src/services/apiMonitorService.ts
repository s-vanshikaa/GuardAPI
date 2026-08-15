import prisma from '../utils/prisma'
import { AppError } from '../utils/errors'
import type { CreateApiMonitorInput, UpdateApiMonitorInput } from '../schemas/apiMonitorSchemas'

export async function listApiMonitors(userId: string) {
  return prisma.apiMonitor.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createApiMonitor(userId: string, data: CreateApiMonitorInput) {
  return prisma.apiMonitor.create({ data: { ...data, userId } })
}

export async function getApiMonitor(userId: string, id: string) {
  const monitor = await prisma.apiMonitor.findFirst({ where: { id, userId } })
  if (!monitor) {
    throw new AppError(404, 'NOT_FOUND', 'API monitor not found')
  }
  return monitor
}

export async function updateApiMonitor(userId: string, id: string, data: UpdateApiMonitorInput) {
  await getApiMonitor(userId, id)
  return prisma.apiMonitor.update({ where: { id }, data })
}

export async function deleteApiMonitor(userId: string, id: string) {
  await getApiMonitor(userId, id)
  await prisma.apiMonitor.delete({ where: { id } })
}
