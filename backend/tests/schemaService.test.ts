import { describe, expect, it } from 'vitest'
import {
  extractSchema,
  hashSchema,
  diffSchemas,
  classifySeverity,
} from '../src/services/schemaService'

describe('extractSchema', () => {
  it('maps primitives to their type name', () => {
    expect(extractSchema('hello')).toBe('string')
    expect(extractSchema(42)).toBe('number')
    expect(extractSchema(true)).toBe('boolean')
    expect(extractSchema(null)).toBe('null')
  })

  it('recurses into objects with sorted keys', () => {
    expect(extractSchema({ b: 1, a: 'x' })).toEqual({ a: 'string', b: 'number' })
  })

  it('represents an empty array distinctly from a populated one', () => {
    expect(extractSchema([])).toEqual(['empty'])
    expect(extractSchema([{ id: 1 }])).toEqual([{ id: 'number' }])
  })

  it('only inspects the first element of an array', () => {
    expect(extractSchema([{ id: 1 }, { id: 'not used for shape' }])).toEqual([{ id: 'number' }])
  })

  it('normalizes value changes away — only structure matters', () => {
    expect(extractSchema({ price: 100 })).toEqual(extractSchema({ price: 999 }))
  })

  it('caps recursion depth for pathologically nested values', () => {
    let deeplyNested: unknown = 'leaf'
    for (let i = 0; i < 20; i++) {
      deeplyNested = { nested: deeplyNested }
    }
    expect(() => extractSchema(deeplyNested)).not.toThrow()
  })
})

describe('hashSchema', () => {
  it('is deterministic for the same schema', () => {
    const schema = extractSchema({ id: 1, name: 'Alex' })
    expect(hashSchema(schema)).toBe(hashSchema(extractSchema({ id: 2, name: 'Sam' })))
  })

  it('is independent of source key order, since extraction already sorts keys', () => {
    const a = extractSchema({ id: 1, name: 'Alex' })
    const b = extractSchema({ name: 'Sam', id: 2 })
    expect(hashSchema(a)).toBe(hashSchema(b))
  })

  it('differs when the structure differs', () => {
    const a = extractSchema({ id: 1 })
    const b = extractSchema({ id: '1' })
    expect(hashSchema(a)).not.toBe(hashSchema(b))
  })
})

describe('diffSchemas', () => {
  it('reports no changes for identical schemas', () => {
    const schema = extractSchema({ user: { id: 1, name: 'Alex' } })
    expect(diffSchemas(schema, schema)).toEqual([])
  })

  it('detects an added field', () => {
    const prev = extractSchema({ user: { id: 1 } })
    const curr = extractSchema({ user: { id: 1, avatar: 'url' } })
    expect(diffSchemas(prev, curr)).toEqual([
      { path: 'user.avatar', type: 'added', newType: 'string' },
    ])
  })

  it('detects a removed field', () => {
    const prev = extractSchema({ user: { id: 1, email: 'a@b.com' } })
    const curr = extractSchema({ user: { id: 1 } })
    expect(diffSchemas(prev, curr)).toEqual([
      { path: 'user.email', type: 'removed', oldType: 'string' },
    ])
  })

  it('detects a scalar type change', () => {
    const prev = extractSchema({ user: { id: 123 } })
    const curr = extractSchema({ user: { id: '123' } })
    expect(diffSchemas(prev, curr)).toEqual([
      { path: 'user.id', type: 'type_changed', oldType: 'number', newType: 'string' },
    ])
  })

  it('detects a structural change between object and array', () => {
    const prev = extractSchema({ user: { profile: { bio: 'hi' } } })
    const curr = extractSchema({ user: { profile: [{ bio: 'hi' }] } })
    expect(diffSchemas(prev, curr)).toEqual([
      { path: 'user.profile', type: 'structural_change', oldType: 'object', newType: 'array' },
    ])
  })

  it('detects a structural change between a primitive and a container', () => {
    const prev = extractSchema({ tags: 'none' })
    const curr = extractSchema({ tags: ['a', 'b'] })
    expect(diffSchemas(prev, curr)).toEqual([
      { path: 'tags', type: 'structural_change', oldType: 'string', newType: 'array' },
    ])
  })

  it('detects a type change inside array elements', () => {
    const prev = extractSchema({ items: [1, 2, 3] })
    const curr = extractSchema({ items: ['1', '2', '3'] })
    expect(diffSchemas(prev, curr)).toEqual([
      { path: 'items[]', type: 'type_changed', oldType: 'number', newType: 'string' },
    ])
  })

  it('reports multiple simultaneous changes', () => {
    const prev = extractSchema({ id: 1, email: 'a@b.com' })
    const curr = extractSchema({ id: 1, avatar: 'url' })
    const changes = diffSchemas(prev, curr)
    expect(changes).toContainEqual({ path: 'email', type: 'removed', oldType: 'string' })
    expect(changes).toContainEqual({ path: 'avatar', type: 'added', newType: 'string' })
  })
})

describe('classifySeverity', () => {
  it('is INFO when there are no changes', () => {
    expect(classifySeverity([])).toBe('INFO')
  })

  it('is INFO for an added field alone', () => {
    expect(classifySeverity([{ path: 'x', type: 'added', newType: 'string' }])).toBe('INFO')
  })

  it('is WARNING for a type change alone', () => {
    expect(
      classifySeverity([{ path: 'x', type: 'type_changed', oldType: 'number', newType: 'string' }]),
    ).toBe('WARNING')
  })

  it('is CRITICAL when a field was removed', () => {
    expect(classifySeverity([{ path: 'x', type: 'removed', oldType: 'string' }])).toBe('CRITICAL')
  })

  it('is CRITICAL for a structural change', () => {
    expect(
      classifySeverity([
        { path: 'x', type: 'structural_change', oldType: 'object', newType: 'array' },
      ]),
    ).toBe('CRITICAL')
  })

  it('is CRITICAL when a removal is mixed with less severe changes', () => {
    expect(
      classifySeverity([
        { path: 'a', type: 'added', newType: 'string' },
        { path: 'b', type: 'removed', oldType: 'string' },
      ]),
    ).toBe('CRITICAL')
  })
})
