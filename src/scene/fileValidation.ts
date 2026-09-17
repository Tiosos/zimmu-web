import type { MaterialDef, Part, Scene, Vec3, ZimmuFile } from './types'

export class ZimmuFileValidationError extends Error {
  constructor(path: string, message: string) {
    super(`${path} ${message}`)
    this.name = 'ZimmuFileValidationError'
  }
}

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordAt(value: unknown, path: string): RecordValue {
  if (!isRecord(value)) throw new ZimmuFileValidationError(path, 'must be an object')
  return value
}

function arrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ZimmuFileValidationError(path, 'must be an array')
  return value
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ZimmuFileValidationError(path, 'must be a string')
  return value
}

function finiteNumberAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ZimmuFileValidationError(path, 'must be a finite number')
  }
  return value
}

function integerAt(value: unknown, path: string): number {
  const n = finiteNumberAt(value, path)
  if (!Number.isInteger(n) || n < 0) {
    throw new ZimmuFileValidationError(path, 'must be a non-negative integer')
  }
  return n
}

function optionalFiniteNumber(value: unknown, path: string): void {
  if (value !== undefined) finiteNumberAt(value, path)
}

function vecAt(value: unknown, path: string): Vec3 {
  const record = recordAt(value, path)
  return {
    x: finiteNumberAt(record.x, `${path}.x`),
    y: finiteNumberAt(record.y, `${path}.y`),
    z: finiteNumberAt(record.z, `${path}.z`),
  }
}

function validateMaterial(value: unknown, path: string): MaterialDef {
  const material = recordAt(value, path)
  optionalFiniteNumber(material.costPerM2, `${path}.costPerM2`)
  optionalFiniteNumber(material.costPerM, `${path}.costPerM`)
  optionalFiniteNumber(material.thickness, `${path}.thickness`)
  if (material.hasGrain !== undefined && typeof material.hasGrain !== 'boolean') {
    throw new ZimmuFileValidationError(`${path}.hasGrain`, 'must be a boolean')
  }
  if (material.sheet !== undefined) {
    const sheet = recordAt(material.sheet, `${path}.sheet`)
    finiteNumberAt(sheet.length, `${path}.sheet.length`)
    finiteNumberAt(sheet.width, `${path}.sheet.width`)
    optionalFiniteNumber(sheet.costPerSheet, `${path}.sheet.costPerSheet`)
  }
  return value as MaterialDef
}

function validateCuts(value: unknown, path: string): void {
  if (value === undefined) return
  for (const [index, cutValue] of arrayAt(value, path).entries()) {
    const cut = recordAt(cutValue, `${path}[${index}]`)
    if (cut.kind !== undefined && typeof cut.kind !== 'string') {
      throw new ZimmuFileValidationError(`${path}[${index}].kind`, 'must be a string')
    }
    if (cut.id !== undefined) stringAt(cut.id, `${path}[${index}].id`)
  }
}

function validateLegacyPart(value: unknown, path: string): Part | null {
  const part = recordAt(value, path)
  const kind = stringAt(part.kind, `${path}.kind`)

  // Preserve the existing forward-compatibility rule: an unknown future part kind is skipped
  // instead of making the entire project unreadable.
  if (kind !== 'board' && kind !== 'cylinder') {
    console.warn(`zimmu: unknown part kind "${kind}" — skipped`)
    return null
  }

  stringAt(part.id, `${path}.id`)
  stringAt(part.label, `${path}.label`)
  finiteNumberAt(part.length, `${path}.length`)
  vecAt(part.position, `${path}.position`)
  vecAt(part.rotation, `${path}.rotation`)
  validateCuts(part.cuts, `${path}.cuts`)

  if (kind === 'board') {
    finiteNumberAt(part.width, `${path}.width`)
    finiteNumberAt(part.thickness, `${path}.thickness`)
    if (
      part.grain !== undefined &&
      part.grain !== 'free' &&
      part.grain !== 'length' &&
      part.grain !== 'width'
    ) {
      throw new ZimmuFileValidationError(`${path}.grain`, 'must be free, length, or width')
    }
  } else {
    finiteNumberAt(part.diameter, `${path}.diameter`)
  }

  return value as Part
}

function optionalRecordArray(value: unknown, path: string): RecordValue[] {
  if (value === undefined) return []
  return arrayAt(value, path).map((entry, index) => recordAt(entry, `${path}[${index}]`))
}

/**
 * Validate the data shape the migration code is allowed to read.
 *
 * This is intentionally legacy-compatible: fields introduced by later file versions may still be
 * absent and are normalised by `parseFile`. Wrong container types and wrong geometry-bearing value
 * types are rejected before TypeScript's current-version model is allowed to touch them.
 */
export function validateLegacyFileInput(value: unknown): ZimmuFile {
  const root = recordAt(value, 'file')
  integerAt(root.version, 'file.version')
  stringAt(root.name, 'file.name')
  stringAt(root.appVersion, 'file.appVersion')
  if (root.units !== 'mm') throw new ZimmuFileValidationError('file.units', 'must be "mm"')
  stringAt(root.createdAt, 'file.createdAt')
  stringAt(root.updatedAt, 'file.updatedAt')

  const camera = recordAt(root.camera, 'file.camera')
  vecAt(camera.position, 'file.camera.position')
  vecAt(camera.target, 'file.camera.target')

  const scene = recordAt(root.scene, 'file.scene')
  const parts = (scene.parts === undefined ? [] : arrayAt(scene.parts, 'file.scene.parts'))
    .map((part, index) => validateLegacyPart(part, `file.scene.parts[${index}]`))
    .filter((part): part is Part => part !== null)

  const materialsRecord =
    scene.materials === undefined ? {} : recordAt(scene.materials, 'file.scene.materials')
  const materials: Record<string, MaterialDef> = {}
  for (const [name, def] of Object.entries(materialsRecord)) {
    materials[name] = validateMaterial(def, `file.scene.materials.${JSON.stringify(name)}`)
  }

  const hardware = optionalRecordArray(scene.hardware, 'file.scene.hardware')
  const joints = optionalRecordArray(scene.joints, 'file.scene.joints')
  const components = optionalRecordArray(scene.components, 'file.scene.components')

  // From this point the migration code receives only the container/value categories it reads.
  // Legacy omissions remain omissions; `parseFile` owns their historical defaults.
  return {
    ...(root as unknown as ZimmuFile),
    scene: {
      ...(scene as unknown as Scene),
      parts,
      materials,
      hardware: hardware as unknown as Scene['hardware'],
      joints: joints as unknown as Scene['joints'],
      components: components as unknown as Scene['components'],
    },
  }
}

function assertUniqueIds(items: readonly { id: string }[], path: string): void {
  const seen = new Set<string>()
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) {
      throw new ZimmuFileValidationError(`${path}[${index}].id`, `duplicates id "${item.id}"`)
    }
    seen.add(item.id)
  }
}

function validateCurrentPart(part: Part, index: number): void {
  const path = `file.scene.parts[${index}]`
  stringAt(part.id, `${path}.id`)
  stringAt(part.label, `${path}.label`)
  finiteNumberAt(part.length, `${path}.length`)
  vecAt(part.position, `${path}.position`)
  vecAt(part.rotation, `${path}.rotation`)
  if (part.rotationOrder !== 'XYZ') {
    throw new ZimmuFileValidationError(`${path}.rotationOrder`, 'must be "XYZ"')
  }
  if (typeof part.visible !== 'boolean') {
    throw new ZimmuFileValidationError(`${path}.visible`, 'must be a boolean')
  }
  if (typeof part.driven !== 'boolean') {
    throw new ZimmuFileValidationError(`${path}.driven`, 'must be a boolean')
  }
  if (part.parentId !== null && typeof part.parentId !== 'string') {
    throw new ZimmuFileValidationError(`${path}.parentId`, 'must be a string or null')
  }
  stringAt(part.material, `${path}.material`)
  validateCuts(part.cuts, `${path}.cuts`)

  if (part.kind === 'board') {
    finiteNumberAt(part.width, `${path}.width`)
    finiteNumberAt(part.thickness, `${path}.thickness`)
    if (part.grain !== 'free' && part.grain !== 'length' && part.grain !== 'width') {
      throw new ZimmuFileValidationError(`${path}.grain`, 'must be free, length, or width')
    }
  } else {
    finiteNumberAt(part.diameter, `${path}.diameter`)
  }
}

/** Final assertion for the current model after all migrations/defaults/repairs have run. */
export function validateCurrentFile(file: ZimmuFile): ZimmuFile {
  integerAt(file.version, 'file.version')
  stringAt(file.name, 'file.name')
  if (file.units !== 'mm') throw new ZimmuFileValidationError('file.units', 'must be "mm"')
  vecAt(file.camera.position, 'file.camera.position')
  vecAt(file.camera.target, 'file.camera.target')

  if (!Array.isArray(file.scene.parts)) {
    throw new ZimmuFileValidationError('file.scene.parts', 'must be an array')
  }
  if (!Array.isArray(file.scene.hardware)) {
    throw new ZimmuFileValidationError('file.scene.hardware', 'must be an array')
  }
  if (!Array.isArray(file.scene.joints)) {
    throw new ZimmuFileValidationError('file.scene.joints', 'must be an array')
  }
  if (!Array.isArray(file.scene.components)) {
    throw new ZimmuFileValidationError('file.scene.components', 'must be an array')
  }

  file.scene.parts.forEach(validateCurrentPart)
  assertUniqueIds(file.scene.parts, 'file.scene.parts')
  assertUniqueIds(file.scene.components, 'file.scene.components')

  const componentIds = new Set(file.scene.components.map((component) => component.id))
  for (const [index, component] of file.scene.components.entries()) {
    const path = `file.scene.components[${index}]`
    stringAt(component.id, `${path}.id`)
    stringAt(component.label, `${path}.label`)
    vecAt(component.position, `${path}.position`)
    vecAt(component.rotation, `${path}.rotation`)
    if (component.parentId !== null && !componentIds.has(component.parentId)) {
      throw new ZimmuFileValidationError(`${path}.parentId`, 'must name a live component or be null')
    }
    // An anchor's target is the same kind of reference parentId is, over a different graph.
    // resolvePlacement detaches a dangling one at runtime, but a file that names a component it does
    // not carry is malformed rather than merely stale, so it is refused at the boundary.
    const anchor = (component as { anchor?: unknown }).anchor
    if (anchor !== undefined && anchor !== null) {
      if (typeof anchor !== 'object') {
        throw new ZimmuFileValidationError(`${path}.anchor`, 'must be an object')
      }
      const to = (anchor as { to?: unknown }).to
      if (typeof to !== 'string' || !componentIds.has(to)) {
        throw new ZimmuFileValidationError(`${path}.anchor.to`, 'must name a live component')
      }
    }
  }

  for (const [name, material] of Object.entries(file.scene.materials)) {
    validateMaterial(material, `file.scene.materials.${JSON.stringify(name)}`)
  }

  return file
}
