import type { Incident } from '../../types/incident'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import { SchemaDiffPanel } from './SchemaDiffPanel'
import './SchemaChangesList.css'

interface SchemaChangesListProps {
  incidents: Incident[]
}

export function SchemaChangesList({ incidents }: SchemaChangesListProps) {
  const schemaChangeIncidents = incidents.filter((incident) => incident.type === 'SCHEMA_CHANGE')

  if (schemaChangeIncidents.length === 0) {
    return <p className="empty-state">No schema changes detected.</p>
  }

  return (
    <div>
      {schemaChangeIncidents.map((incident) => (
        <div key={incident.id} className="schema-change-group">
          <div className="schema-change-group__header">
            <span className="schema-change-group__title">{incident.title}</span>
            <span className="schema-change-group__time">
              {formatRelativeTime(incident.openedAt)}
            </span>
          </div>
          <SchemaDiffPanel description={incident.description} />
        </div>
      ))}
    </div>
  )
}
