import type { ConstructionDraft } from './constructionDraft'

export const CONSTRUCTION_PRESETS_KEY = 'zimmu:construction-presets:v1'
export const PRESET_FILE_LIMIT = 256 * 1024
export const PRESET_ENTRY_LIMIT = 100
export const CONSTRUCTION_GROUPS = {
  shell: ['hasTop', 'backMode'],
  base: ['baseMode', 'toeKickHeight', 'toeKickSetback'],
  fronts: ['frontMount', 'frontReveal'],
  frame: ['frameEnabled', 'stileWidth', 'railWidth', 'midStileWidth', 'midRailWidth', 'pairStile'],
  materials: ['carcaseMaterial', 'backMaterial', 'frontMaterial', 'frameMaterial'],
  joinery: ['jointMethod'],
} as const satisfies Record<string, readonly (keyof ConstructionDraft)[]>
export type ConstructionGroup = keyof typeof CONSTRUCTION_GROUPS
export type PresetKey = (typeof CONSTRUCTION_GROUPS)[ConstructionGroup][number]
export type ConstructionSettings = Pick<ConstructionDraft, PresetKey>
export interface ConstructionPreset {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  settings: ConstructionSettings
}
const keys = Object.values(CONSTRUCTION_GROUPS).flat()
const enums = {
  backMode: ['captured', 'applied', 'none'],
  baseMode: ['toe-kick', 'ladder', 'legs', 'none'],
  frontMount: ['overlay', 'inset', 'half-overlay'],
  jointMethod: ['butt-screw', 'dado-rabbet', 'finger', 'dowel', 'confirmat'],
}
const numeric = [
  'toeKickHeight',
  'toeKickSetback',
  'frontReveal',
  'stileWidth',
  'railWidth',
  'midStileWidth',
  'midRailWidth',
]
const positive = ['stileWidth', 'railWidth', 'midStileWidth', 'midRailWidth']
const booleans = ['hasTop', 'frameEnabled', 'pairStile']
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected a preset object.')
  return value as Record<string, unknown>
}
function text(value: unknown, description = false): string {
  if (
    typeof value !== 'string' ||
    value.length > (description ? 500 : 80) ||
    (!description && !value.trim())
  )
    throw Error(
      description
        ? 'Descriptions must be at most 500 characters.'
        : 'Names and IDs must contain 1–80 characters.',
    )
  return value.trim()
}
function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw Error('Preset timestamps must be finite and non-negative.')
  return value
}
export function constructionSettings(input: unknown): ConstructionSettings {
  const source = object(input)
  const entries = keys.map((key) => {
    let value = source[key]
    if (numeric.includes(key)) {
      const n = typeof value === 'string' && value.trim() ? Number(value) : NaN
      if (!Number.isFinite(n) || (positive.includes(key) ? n <= 0 : n < 0))
        throw Error(
          `${key} must be a finite ${positive.includes(key) ? 'positive' : 'non-negative'} number.`,
        )
      value = String(n)
    } else if (booleans.includes(key)) {
      if (typeof value !== 'boolean') throw Error(`${key} must be a boolean.`)
    } else if (key in enums) {
      if (!enums[key as keyof typeof enums].includes(value as string))
        throw Error(`Unsupported ${key}.`)
    } else value = text(value)
    return [key, value]
  })
  return Object.fromEntries(entries) as ConstructionSettings
}
export function parseConstructionPresets(raw: string): ConstructionPreset[] {
  if (new Blob([raw]).size > PRESET_FILE_LIMIT)
    throw Error('Preset JSON must be 256 KiB or smaller.')
  const doc = object(JSON.parse(raw) as unknown)
  if (doc.format !== 'zimmu-construction-presets' || doc.version !== 1)
    throw Error('Unsupported construction preset format or version.')
  if (!Array.isArray(doc.presets) || doc.presets.length > PRESET_ENTRY_LIMIT)
    throw Error('A library may contain at most 100 construction presets.')
  const ids = new Set<string>()
  return doc.presets.map((value) => {
    const p = object(value),
      id = text(p.id)
    if (ids.has(id)) throw Error('Construction preset IDs must be unique.')
    ids.add(id)
    return {
      id,
      name: text(p.name),
      description: text(p.description, true),
      createdAt: timestamp(p.createdAt),
      updatedAt: timestamp(p.updatedAt),
      settings: constructionSettings(p.settings),
    }
  })
}
export function serializeConstructionPresets(presets: ConstructionPreset[]): string {
  const raw = JSON.stringify({ format: 'zimmu-construction-presets', version: 1, presets }, null, 2)
  const clean = parseConstructionPresets(raw)
  return JSON.stringify(
    { format: 'zimmu-construction-presets', version: 1, presets: clean },
    null,
    2,
  )
}
export function captureConstructionPreset(
  name: string,
  description: string,
  draft: ConstructionDraft,
): ConstructionPreset {
  const now = Date.now()
  return {
    id: `construction_${crypto.randomUUID()}`,
    name: text(name),
    description: text(description, true),
    createdAt: now,
    updatedAt: now,
    settings: constructionSettings(draft),
  }
}
export function appendConstructionPresets(
  current: ConstructionPreset[],
  incoming: ConstructionPreset[],
): ConstructionPreset[] {
  if (current.length + incoming.length > PRESET_ENTRY_LIMIT)
    throw Error(
      'A library may contain at most 100 construction presets. Export or delete entries first.',
    )
  const names = new Set(current.map((p) => p.name.toLocaleLowerCase()))
  return [
    ...current,
    ...incoming.map((p) => {
      let name = p.name,
        suffix = 2
      while (names.has(name.toLocaleLowerCase())) name = `${p.name.slice(0, 70)} (${suffix++})`
      names.add(name.toLocaleLowerCase())
      return { ...p, settings: { ...p.settings }, name, id: `construction_${crypto.randomUUID()}` }
    }),
  ]
}
export function stageConstructionPreset(
  draft: ConstructionDraft,
  preset: ConstructionPreset,
  groups: ConstructionGroup[],
): ConstructionDraft {
  const settings = constructionSettings(preset.settings)
  const patch = Object.fromEntries(
    groups.flatMap((group) => CONSTRUCTION_GROUPS[group].map((key) => [key, settings[key]])),
  )
  return { ...draft, ...patch }
}
export function constructionDifferences(
  before: ConstructionDraft,
  after: ConstructionDraft,
): { key: PresetKey; before: string; after: string }[] {
  return keys
    .filter((key) => before[key] !== after[key])
    .map((key) => ({ key, before: String(before[key]), after: String(after[key]) }))
}
