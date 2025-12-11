import { createHash } from 'node:crypto'
import type { Severity } from '@prisma/client'

// A schema node is the structural shape of a JSON value: primitives are
// represented by their type name so value changes (e.g. price fluctuating)
// never register as a schema change, only structural ones do.
export type SchemaNode = string | SchemaNode[] | { [key: string]: SchemaNode }

export type SchemaChangeType = 'added' | 'removed' | 'type_changed' | 'structural_change'

export interface SchemaChange {
  path: string
  type: SchemaChangeType
  oldType?: string
  newType?: string
}

const MAX_DEPTH = 6

export function extractSchema(value: unknown, depth = 0): SchemaNode {
  if (depth > MAX_DEPTH) return typeof value
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return value.length > 0 ? [extractSchema(value[0], depth + 1)] : ['empty']
  }
  if (typeof value === 'object') {
    const schema: Record<string, SchemaNode> = {}
    for (const key of Object.keys(value).sort()) {
      schema[key] = extractSchema((value as Record<string, unknown>)[key], depth + 1)
    }
    return schema
  }
  return typeof value
}

export function hashSchema(schema: SchemaNode): string {
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex')
}

type NodeKind = 'object' | 'array' | 'primitive'

function kindOf(node: SchemaNode): NodeKind {
  if (Array.isArray(node)) return 'array'
  if (typeof node === 'object') return 'object'
  return 'primitive'
}

function describeType(node: SchemaNode): string {
  return typeof node === 'string' ? node : kindOf(node)
}

export function diffSchemas(prev: SchemaNode, curr: SchemaNode, path = ''): SchemaChange[] {
  const prevKind = kindOf(prev)
  const currKind = kindOf(curr)

  if (prevKind !== currKind) {
    const structural = prevKind !== 'primitive' || currKind !== 'primitive'
    return [
      {
        path: path || 'root',
        type: structural ? 'structural_change' : 'type_changed',
        oldType: describeType(prev),
        newType: describeType(curr),
      },
    ]
  }

  if (prevKind === 'primitive') {
    return prev === curr
      ? []
      : [
          {
            path: path || 'root',
            type: 'type_changed',
            oldType: describeType(prev),
            newType: describeType(curr),
          },
        ]
  }

  if (prevKind === 'array') {
    return diffSchemas((prev as SchemaNode[])[0], (curr as SchemaNode[])[0], `${path}[]`)
  }

  const prevObj = prev as Record<string, SchemaNode>
  const currObj = curr as Record<string, SchemaNode>
  const changes: SchemaChange[] = []

  for (const key of Object.keys(prevObj)) {
    const childPath = path ? `${path}.${key}` : key
    if (!(key in currObj)) {
      changes.push({ path: childPath, type: 'removed', oldType: describeType(prevObj[key]) })
    } else {
      changes.push(...diffSchemas(prevObj[key], currObj[key], childPath))
    }
  }
  for (const key of Object.keys(currObj)) {
    if (!(key in prevObj)) {
      const childPath = path ? `${path}.${key}` : key
      changes.push({ path: childPath, type: 'added', newType: describeType(currObj[key]) })
    }
  }
  return changes
}

export function classifySeverity(changes: SchemaChange[]): Severity {
  if (changes.some((c) => c.type === 'removed' || c.type === 'structural_change')) return 'CRITICAL'
  if (changes.some((c) => c.type === 'type_changed')) return 'WARNING'
  return 'INFO'
}
