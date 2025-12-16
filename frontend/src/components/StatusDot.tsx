export type Status = 'healthy' | 'warning' | 'critical' | 'info' | 'unknown'

interface StatusDotProps {
  status: Status
  label: string
}

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <span className={`status-row status-${status}`}>
      <span className={`status-dot dot-${status}`} />
      {label}
    </span>
  )
}
