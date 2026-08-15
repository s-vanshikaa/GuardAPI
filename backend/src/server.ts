import 'dotenv/config'
import app from './app'
import { startScheduler } from './jobs/scheduler'

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000

app.listen(PORT, () => {
  console.log(`GuardAPI backend running on http://localhost:${PORT}`)
  startScheduler()
})
