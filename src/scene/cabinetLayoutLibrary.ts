import { validateSection } from './sectionTree'
import { openingLeaves } from './openingReuse'
import type { CarcaseParams, Section, SectionSize } from './types'

export const LAYOUT_LIBRARY_KEY = 'zimmu:cabinet-layout-library:v1'
export const LAYOUT_FILE_LIMIT = 512 * 1024
export const LAYOUT_ENTRY_LIMIT = 100
export interface SavedCabinetLayout {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  source: { width: number; height: number; depth: number }
  section: Section
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected an object.')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 80)
    throw Error('Names and IDs must contain 1–80 characters.')
  return value.trim()
}
function number(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min)
    throw Error('Layout dimensions and counts must be finite and within range.')
  return value
}
function count(value: unknown, max: number): number {
  const n = number(value)
  if (!Number.isInteger(n) || n > max)
    throw Error('Shelf and pin counts must be whole numbers within range.')
  return n
}
function sizeOf(value: unknown): SectionSize {
  const s = record(value)
  if (s.kind === 'equal') return { kind: 'equal' }
  if (s.kind === 'fixed') return { kind: 'fixed', mm: number(s.mm, Number.MIN_VALUE) }
  if (s.kind === 'percent' && number(s.pct, Number.MIN_VALUE) <= 100)
    return { kind: 'percent', pct: s.pct as number }
  throw Error('Unknown or invalid opening size.')
}
export function parseLayoutSection(value: unknown): Section {
  let nodes = 0
  const walk = (input: unknown, depth: number): Section => {
    if (++nodes > 256 || depth > 16)
      throw Error('Layout exceeds 256 openings or 16 nested divisions.')
    const s = record(input),
      c = record(s.content)
    const section: Section = { id: text(s.id), size: sizeOf(s.size), content: { kind: 'leaf' } }
    if (c.kind === 'split') {
      if (
        (c.axis !== 'vertical' && c.axis !== 'horizontal') ||
        !['none', 'panel', 'rail'].includes(String(c.division)) ||
        !Array.isArray(c.children) ||
        c.children.length < 2 ||
        c.children.length > 8
      )
        throw Error('Invalid opening division.')
      section.content = {
        kind: 'split',
        axis: c.axis,
        division: c.division as 'none' | 'panel' | 'rail',
        children: c.children.map((child) => walk(child, depth + 1)),
      }
    } else if (c.kind !== 'leaf') throw Error('Unknown opening content.')
    if (s.front !== undefined) {
      const front = record(s.front)
      if (
        front.kind === 'door' &&
        (front.leaves === 1 || front.leaves === 2) &&
        (front.hinge === 'left' || front.hinge === 'right')
      )
        section.front = { kind: 'door', leaves: front.leaves, hinge: front.hinge }
      else if (
        front.kind === 'drawer-front' ||
        front.kind === 'false-front' ||
        front.kind === 'panel'
      )
        section.front = { kind: front.kind }
      else throw Error('Unknown or invalid front.')
    }
    if (s.interior !== undefined) {
      const interior = record(s.interior),
        a = record(interior.adjustable)
      if ((a.rows !== 1 && a.rows !== 2) || a.pitch !== 32)
        throw Error('Unsupported shelf pin pattern.')
      section.interior = {
        fixedShelves: count(interior.fixedShelves, 32),
        adjustable: {
          shelves: count(a.shelves, 32),
          count: count(a.count, 1000),
          rows: a.rows,
          pitch: 32,
          setback: number(a.setback),
          backSetback: number(a.backSetback),
        },
      }
    }
    if (c.kind === 'split' && (section.front || section.interior))
      throw Error('Fronts and shelving must belong to leaf openings.')
    return section
  }
  const section = walk(value, 0)
  const errors = validateSection(section)
  if (errors.length) throw Error(errors.join('; '))
  return section
}
export function parseLayoutLibrary(raw: string): SavedCabinetLayout[] {
  if (new Blob([raw]).size > LAYOUT_FILE_LIMIT)
    throw Error('Layout files must be 512 KiB or smaller.')
  const document = record(JSON.parse(raw) as unknown)
  if (document.format !== 'zimmu-cabinet-layouts' || document.version !== 1)
    throw Error('Unsupported cabinet layout file version.')
  if (!Array.isArray(document.layouts) || document.layouts.length > LAYOUT_ENTRY_LIMIT)
    throw Error('A library may contain at most 100 layouts.')
  const ids = new Set<string>()
  return document.layouts.map((value) => {
    const item = record(value),
      source = record(item.source),
      id = text(item.id)
    if (ids.has(id)) throw Error('Saved layout IDs must be unique.')
    ids.add(id)
    return {
      id,
      name: text(item.name),
      createdAt: number(item.createdAt),
      updatedAt: number(item.updatedAt),
      source: {
        width: number(source.width, Number.MIN_VALUE),
        height: number(source.height, Number.MIN_VALUE),
        depth: number(source.depth, Number.MIN_VALUE),
      },
      section: parseLayoutSection(item.section),
    }
  })
}
export function serializeLayoutLibrary(layouts: SavedCabinetLayout[]): string {
  const raw = JSON.stringify({ format: 'zimmu-cabinet-layouts', version: 1, layouts }, null, 2)
  parseLayoutLibrary(raw)
  return raw
}
export function savedLayout(
  name: string,
  section: Section,
  params: CarcaseParams,
): SavedCabinetLayout {
  const now = Date.now()
  return {
    id: `layout_${crypto.randomUUID()}`,
    name: text(name),
    createdAt: now,
    updatedAt: now,
    source: { width: params.width, height: params.height, depth: params.depth },
    section: parseLayoutSection(section),
  }
}
export function appendLayouts(
  current: SavedCabinetLayout[],
  incoming: SavedCabinetLayout[],
): SavedCabinetLayout[] {
  if (current.length + incoming.length > LAYOUT_ENTRY_LIMIT)
    throw Error('A library may contain at most 100 layouts. Export or delete entries first.')
  const names = new Set(current.map((item) => item.name.toLocaleLowerCase()))
  const added = incoming.map((item) => {
    let name = item.name,
      suffix = 2
    while (names.has(name.toLocaleLowerCase())) name = `${item.name.slice(0, 70)} (${suffix++})`
    names.add(name.toLocaleLowerCase())
    return { ...structuredClone(item), id: `layout_${crypto.randomUUID()}`, name }
  })
  return [...current, ...added]
}
export function layoutSummary(section: Section): string {
  const leaves = openingLeaves(section)
  const doors = leaves.reduce(
    (sum, node) => sum + (node.front?.kind === 'door' ? node.front.leaves : 0),
    0,
  )
  const drawers = leaves.filter((node) => node.front?.kind === 'drawer-front').length
  const shelves = leaves.reduce(
    (sum, node) =>
      sum + (node.interior?.fixedShelves ?? 0) + (node.interior?.adjustable.shelves ?? 0),
    0,
  )
  return `${leaves.length} openings · ${doors} doors · ${drawers} drawer fronts · ${shelves} shelves`
}
