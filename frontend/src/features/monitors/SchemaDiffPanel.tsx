import './SchemaChangesList.css'

// The backend only ever emits these four line shapes (see
// incidentService.summarizeChanges) — parsing the prefix here is purely
// presentational (marker + color), the underlying text is never altered.
function classifyLine(line: string): { marker: string; className: string } {
  if (line.startsWith('Field removed')) return { marker: '−', className: 'diff-line--removed' }
  if (line.startsWith('Field added')) return { marker: '+', className: 'diff-line--added' }
  if (line.startsWith('Type changed') || line.startsWith('Structural change')) {
    return { marker: '~', className: 'diff-line--changed' }
  }
  return { marker: ' ', className: 'diff-line--other' }
}

interface SchemaDiffPanelProps {
  description: string | null
}

export function SchemaDiffPanel({ description }: SchemaDiffPanelProps) {
  return (
    <div className="diff-panel">
      {(description ?? '').split('\n').map((line) => {
        const { marker, className } = classifyLine(line)
        return (
          <div className={`diff-line ${className}`} key={line}>
            <span className="diff-line__marker" aria-hidden="true">
              {marker}
            </span>
            <span>{line}</span>
          </div>
        )
      })}
    </div>
  )
}
