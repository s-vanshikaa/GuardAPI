import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MonitorCheck } from '../../types/monitor'

interface LatencyChartProps {
  checks: MonitorCheck[]
}

interface ChartTooltipProps {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'var(--color-obsidian)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-control)',
        padding: '8px 10px',
        fontSize: 12,
      }}
    >
      <div style={{ color: 'var(--color-fog)', marginBottom: 2 }}>{label}</div>
      <div style={{ color: 'var(--color-paper)', fontFamily: 'var(--font-mono)' }}>
        {payload[0].value}ms
      </div>
    </div>
  )
}

export function LatencyChart({ checks }: LatencyChartProps) {
  if (checks.length === 0) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <p className="empty-state" style={{ padding: 0 }}>
          No monitoring checks yet.
        </p>
      </div>
    )
  }

  const data = [...checks].reverse().map((check) => ({
    checkedAt: new Date(check.checkedAt).toLocaleTimeString(),
    latencyMs: check.latencyMs,
  }))

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#23252a" vertical={false} />
          <XAxis
            dataKey="checkedAt"
            stroke="#62666d"
            tick={{ fontSize: 11, fill: '#62666d' }}
            tickLine={false}
            axisLine={{ stroke: '#23252a' }}
          />
          <YAxis
            stroke="#62666d"
            tick={{ fontSize: 11, fill: '#62666d' }}
            tickLine={false}
            axisLine={false}
            unit="ms"
            width={56}
          />
          <Tooltip content={<ChartTooltip />} />
          <Line
            type="monotone"
            dataKey="latencyMs"
            stroke="#4f8cff"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
