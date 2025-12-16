export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never'

  const diffMin = Math.floor((Date.now() - new Date(isoString).getTime()) / 60_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
