import { z } from 'zod'

const endpointUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((url) => /^https?:\/\//i.test(url), 'Endpoint URL must use http or https')

export const createApiMonitorSchema = z.object({
  name: z.string().trim().min(1).max(200),
  endpointUrl,
  description: z.string().trim().max(1000).optional(),
  expectedStatus: z.number().int().min(100).max(599).optional(),
  pollIntervalMinutes: z.number().int().min(1).max(1440).optional(),
  isActive: z.boolean().optional(),
})

export const updateApiMonitorSchema = createApiMonitorSchema.partial()

export type CreateApiMonitorInput = z.infer<typeof createApiMonitorSchema>
export type UpdateApiMonitorInput = z.infer<typeof updateApiMonitorSchema>
