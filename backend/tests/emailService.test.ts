import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue(undefined)
  const createTransportMock = vi.fn().mockReturnValue({ sendMail: sendMailMock })
  return { sendMailMock, createTransportMock }
})

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}))

import { sendIncidentEmail } from '../src/services/emailService'

beforeEach(() => {
  sendMailMock.mockClear()
  createTransportMock.mockClear()
})

describe('sendIncidentEmail', () => {
  // Runs first: the module-level transporter is a singleton, so this is the
  // only point where we can observe createTransport being called exactly once.
  it('reuses a single transporter across multiple sends', async () => {
    await sendIncidentEmail({
      to: 'a@example.com',
      apiMonitor: { name: 'A' },
      incident: { title: 'first', description: null },
    })
    await sendIncidentEmail({
      to: 'b@example.com',
      apiMonitor: { name: 'B' },
      incident: { title: 'second', description: null },
    })

    expect(createTransportMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock).toHaveBeenCalledTimes(2)
  })

  it('sends a message to the given recipient with the incident details', async () => {
    await sendIncidentEmail({
      to: 'alice@example.com',
      apiMonitor: { name: 'Payments API' },
      incident: { title: 'API is unreachable or failing', description: 'The endpoint timed out.' },
    })

    expect(sendMailMock).toHaveBeenCalledTimes(1)
    const [message] = sendMailMock.mock.calls[0] as [Record<string, string>]
    expect(message.to).toBe('alice@example.com')
    expect(message.from).toBe('alerts@guardapi.test')
    expect(message.subject).toContain('Payments API')
    expect(message.text).toContain('API is unreachable or failing')
    expect(message.text).toContain('The endpoint timed out.')
  })
})
