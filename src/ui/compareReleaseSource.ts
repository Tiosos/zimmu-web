import type { ProductionPacketInput } from './buildProductionPacket'
import { buildPacketPartInventory } from './packetPartInventory'
import { manufacturingParts } from '../scene/manufacturingPart'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { componentsById } from '../scene/componentTree'
import { resolveWorldMatrix } from '../geom/transform'
import { carcaseHardware } from '../scene/carcaseHardware'
import { groupHardware } from './groupHardware'
import { validateCurrentFile } from '../scene/fileValidation'
import { productionLimitIssue } from '../scene/readinessLimits'

export interface SourceChange {
  key: string
  entity: 'part' | 'hardware'
  id: string
  label: string
  partIds: string[]
  change: 'added' | 'removed' | 'modified'
  fields: {
    name: string
    classification: 'manufacturing' | 'metadata'
    before: unknown
    after: unknown
  }[]
  classification: 'manufacturing' | 'metadata'
}
export interface SourceComparison {
  changes: SourceChange[]
  otherSourceChanges: string[]
}

// Object insertion order is immaterial; array order and every recorded value remain significant.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}
function readSource(text: string): ProductionPacketInput {
  const input = JSON.parse(text) as ProductionPacketInput
  if (
    !input ||
    typeof input.projectName !== 'string' ||
    !input.scene ||
    !input.materialLibrary ||
    Array.isArray(input.materialLibrary) ||
    typeof input.materialLibrary !== 'object' ||
    !input.hardwareLibrary ||
    Array.isArray(input.hardwareLibrary) ||
    typeof input.hardwareLibrary !== 'object'
  )
    throw new Error('The recorded production source is not supported.')
  // Validate without migrating, regenerating or rounding the frozen snapshot.
  validateCurrentFile({
    version: 28,
    name: input.projectName,
    units: 'mm',
    appVersion: '',
    createdAt: '',
    updatedAt: '',
    camera: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } },
    scene: input.scene,
  })
  return input
}
interface Descriptor {
  entity: SourceChange['entity']
  id: string
  label: string
  partIds: string[]
  fields: Record<string, unknown>
}
function descriptors(input: ProductionPacketInput): Map<string, Descriptor> {
  const { scene } = input
  for (const component of scene.components) {
    if (component.kind === 'carcase') {
      const issue = productionLimitIssue(component)
      if (issue) throw new Error(`Comparison unavailable for ${component.label}: ${issue}`)
    }
  }
  const byId = componentsById(scene.components)
  const records = manufacturingParts(
    scene.parts,
    effectiveMaterialsOf(input.materialLibrary, scene.materials),
    scene.components,
  )
  const inventory = buildPacketPartInventory(records)
  const result = new Map<string, Descriptor>()
  const add = (descriptor: Descriptor) => {
    const key = JSON.stringify([descriptor.entity, descriptor.id])
    if (result.has(key)) throw new Error('The production source contains duplicate identities.')
    result.set(key, descriptor)
  }
  inventory.parts.forEach((part, index) => {
    const raw = scene.parts[index]
    const { id, label, ...physical } = part
    add({
      entity: 'part',
      id,
      label,
      partIds: [id],
      fields: {
        ...physical,
        label,
        color: raw.color,
        visible: raw.visible,
        placement: Array.from(resolveWorldMatrix(raw, byId)),
        cuts: raw.cuts,
        instructions: records[index].operations,
      },
    })
  })
  for (const item of scene.hardware) {
    const { id, name, linkedPartIds, ...fields } = item
    if (typeof id !== 'string' || typeof name !== 'string' || !Array.isArray(linkedPartIds))
      throw new Error('Unsupported hardware record.')
    add({
      entity: 'hardware',
      id: `manual:${id}`,
      label: name,
      partIds: linkedPartIds,
      fields: { ...fields, label: name, linkedPartIds },
    })
  }
  for (const row of groupHardware(carcaseHardware(scene), input.hardwareLibrary)) {
    const { componentId, key, name, cabinetLabel, ...fields } = row
    add({
      entity: 'hardware',
      id: `generated:${JSON.stringify([componentId, key])}`,
      label: `${cabinetLabel}: ${name}`,
      partIds: records
        .filter((part) => part.provenance.cabinetId === componentId)
        .map((part) => part.id),
      fields: { ...fields, label: name, cabinetLabel },
    })
  }
  return result
}
const METADATA = new Set([
  'label',
  'color',
  'visible',
  'provenance',
  'cabinetLabel',
  'notes',
  'unitCost',
  'totalCost',
])

export function compareReleaseSource(beforeSource: string, afterSource: string): SourceComparison {
  const before = readSource(beforeSource),
    after = readSource(afterSource)
  const a = descriptors(before),
    b = descriptors(after)
  const changes: SourceChange[] = []
  for (const key of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const old = a.get(key),
      next = b.get(key)
    const fields: SourceChange['fields'] = [
      ...new Set([...Object.keys(old?.fields ?? {}), ...Object.keys(next?.fields ?? {})]),
    ]
      .sort()
      .flatMap((name) => {
        const before = old?.fields[name],
          after = next?.fields[name]
        return canonical(before) === canonical(after)
          ? []
          : [
              {
                name,
                classification: METADATA.has(name)
                  ? ('metadata' as const)
                  : ('manufacturing' as const),
                before: before ?? null,
                after: after ?? null,
              },
            ]
      })
    if (!old || !next || fields.length) {
      const entry = (next ?? old)!
      changes.push({
        key,
        entity: entry.entity,
        id: entry.id,
        label: entry.label,
        partIds: next?.partIds ?? [],
        change: old ? (next ? 'modified' : 'removed') : 'added',
        fields,
        classification:
          !old || !next || fields.some((field) => field.classification === 'manufacturing')
            ? 'manufacturing'
            : 'metadata',
      })
    }
  }
  // Keep source changes outside the item projections visible, without calling them harmless.
  const otherSourceChanges = [
    ['Project name', before.projectName, after.projectName],
    ['Part source records', before.scene.parts, after.scene.parts],
    ['Manual hardware source records', before.scene.hardware, after.scene.hardware],
    ['Material library', before.materialLibrary, after.materialLibrary],
    ['Hardware library', before.hardwareLibrary, after.hardwareLibrary],
    ...[...new Set([...Object.keys(before.scene), ...Object.keys(after.scene)])]
      .filter((key) => !['parts', 'hardware'].includes(key))
      .sort()
      .map((key) => [
        `Scene ${key}`,
        before.scene[key as keyof typeof before.scene],
        after.scene[key as keyof typeof after.scene],
      ]),
  ]
    .filter(([, a, b]) => canonical(a) !== canonical(b))
    .map(([label]) => String(label))
  return { changes, otherSourceChanges }
}
