import nodemailer, { type Transporter } from 'nodemailer'
import type { ApiMonitor, Incident } from '@prisma/client'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is required`)
  }
  return value
}

let transporter: Transporter | undefined

// Built lazily (not at module load, unlike JWT_SECRET) so importing this
// module never fails — only actually sending an email requires SMTP config.
function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: requiredEnv('SMTP_HOST'),
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: requiredEnv('SMTP_USER'),
      pass: requiredEnv('SMTP_PASS'),
    },
  })
  return transporter
}

interface SendIncidentEmailInput {
  to: string
  apiMonitor: Pick<ApiMonitor, 'name'>
  incident: Pick<Incident, 'title' | 'description'>
}

export async function sendIncidentEmail({
  to,
  apiMonitor,
  incident,
}: SendIncidentEmailInput): Promise<void> {
  const subject = `[GuardAPI] Critical incident on ${apiMonitor.name}`
  const text = [
    incident.title,
    '',
    incident.description ?? '',
    '',
    `Monitor: ${apiMonitor.name}`,
  ].join('\n')

  await getTransporter().sendMail({
    from: requiredEnv('EMAIL_FROM'),
    to,
    subject,
    text,
  })
}
