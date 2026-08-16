import express from 'express'
import cors from 'cors'
import type { NextFunction, Request, Response } from 'express'
import authRoutes from './routes/auth'
import apiMonitorRoutes from './routes/apiMonitors'
import incidentRoutes from './routes/incidents'
import { AppError } from './utils/errors'

const app = express()

// Permits any localhost origin/port for local dev. Production CORS config
// (a specific deployed frontend origin) is Ticket 20's job.
app.use(cors({ origin: /^http:\/\/localhost:\d+$/ }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/auth', authRoutes)
app.use('/apis', apiMonitorRoutes)
app.use('/incidents', incidentRoutes)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } })
    return
  }
  console.error(err)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } })
})

export default app
