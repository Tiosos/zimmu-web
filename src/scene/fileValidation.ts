import type { MaterialDef, Part, Scene, Vec3, ZimmuFile } from './types'
import { EDGE_KEYS } from './edgeBanding'
import { frontForSection, roomComponentIds, type ProjectStructure } from './projectStructure'

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

function vec2At(value: unknown, path: string): { x: number; y: number } {
  const record = recordAt(value, path)
  return { x: finiteNumberAt(record.x, `${path}.x`), y: finiteNumberAt(record.y, `${path}.y`) }
}

function positiveAt(value: unknown, path: string, allowZero = false): number {
  const number = finiteNumberAt(value, path)
  if (allowZero ? number < 0 : number <= 0) throw new ZimmuFileValidationError(path, 'must be positive')
  return number
}

function validateMaterial(value: unknown, path: string): MaterialDef {
  const material = recordAt(value, path)
  optionalFiniteNumber(material.costPerM2, `${path}.costPerM2`)
  optionalFiniteNumber(material.costPerM, `${path}.costPerM`)
  optionalFiniteNumber(material.thickness, `${path}.thickness`)
  if (material.hasGrain !== undefined && typeof material.hasGrain !== 'boolean') {
    throw new ZimmuFileValidationError(`${path}.hasGrain`, 'must be a boolean')
  }
  if (material.use !== undefined && material.use !== 'edge') {
    throw new ZimmuFileValidationError(`${path}.use`, 'must be "edge"')
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

function validateOperations(value: unknown, path: string): void {
  if (value === undefined) return
  for (const [index, operationValue] of arrayAt(value, path).entries()) {
    const opPath = `${path}[${index}]`
    const op = recordAt(operationValue, opPath)
    if (op.kind !== 'manual-machining') {
      throw new ZimmuFileValidationError(`${opPath}.kind`, 'must be "manual-machining"')
    }
    stringAt(op.id, `${opPath}.id`)
    stringAt(op.label, `${opPath}.label`)
    stringAt(op.hardwareKey, `${opPath}.hardwareKey`)
    stringAt(op.face, `${opPath}.face`)
    vecAt(op.at, `${opPath}.at`)
    finiteNumberAt(op.diameter, `${opPath}.diameter`)
    finiteNumberAt(op.pitch, `${opPath}.pitch`)
    integerAt(op.count, `${opPath}.count`)
    finiteNumberAt(op.angle, `${opPath}.angle`)
    finiteNumberAt(op.edgeOffset, `${opPath}.edgeOffset`)
    stringAt(op.template, `${opPath}.template`)
    stringAt(op.instruction, `${opPath}.instruction`)
    if (op.sourceComponentId !== undefined)
      stringAt(op.sourceComponentId, `${opPath}.sourceComponentId`)
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
  if (kind === 'board') validateOperations(part.operations, `${path}.operations`)

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
  if (part.kind === 'board') validateOperations(part.operations, `${path}.operations`)

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

function validateProject(project: ProjectStructure, scene: Scene): void {
  const root = recordAt(project, 'file.project')
  stringAt(root.id, 'file.project.id')
  const ids = new Set<string>([root.id as string])
  const owned = new Set<string>()
  const ownedParts = new Set<string>()
  const placedCabinets = new Set<string>()
  const roots = new Set(scene.components.filter((c) => c.parentId === null).map((c) => c.id))
  const rootCabinets = new Set(scene.components.filter((c) => c.parentId === null && c.kind === 'carcase').map((c) => c.id))
  const partRoots = new Set(scene.parts.filter((p) => p.parentId === null).map((p) => p.id))
  const unique = (value: unknown, path: string) => {
    const id = stringAt(value, path)
    if (!id || ids.has(id)) throw new ZimmuFileValidationError(path, 'must be a unique non-empty id')
    ids.add(id)
  }
  const areas = arrayAt(root.areas, 'file.project.areas')
  if (!areas.length) throw new ZimmuFileValidationError('file.project.areas', 'must not be empty')
  areas.forEach((rawArea, a) => {
    const path = `file.project.areas[${a}]`
    const area = recordAt(rawArea, path)
    unique(area.id, `${path}.id`)
    stringAt(area.name, `${path}.name`)
    const rooms = arrayAt(area.rooms, `${path}.rooms`)
    if (!rooms.length) throw new ZimmuFileValidationError(`${path}.rooms`, 'must not be empty')
    rooms.forEach((rawRoom, r) => {
      const roomPath = `${path}.rooms[${r}]`
      const room = recordAt(rawRoom, roomPath)
      unique(room.id, `${roomPath}.id`)
      stringAt(room.name, `${roomPath}.name`)
      const items = arrayAt(room.items, `${roomPath}.items`)
      const roomRoots = new Set(items.flatMap((item) => {
        const record = recordAt(item, `${roomPath}.items`)
        return arrayAt(record.rootComponentIds, `${roomPath}.items.rootComponentIds`)
      }))
      const roomComponents = roomComponentIds(roomRoots as Set<string>, scene)
      if (room.geometry !== undefined) {
        const path = `${roomPath}.geometry`
        const geometry = recordAt(room.geometry, path)
        vec2At(geometry.origin, `${path}.origin`)
        finiteNumberAt(geometry.rotation, `${path}.rotation`)
        if (geometry.datum !== undefined) stringAt(geometry.datum, `${path}.datum`)
        if (geometry.siteLevels !== undefined) {
          const levels = arrayAt(geometry.siteLevels, `${path}.siteLevels`)
          if (levels.length && !stringAt(geometry.datum, `${path}.datum`).trim())
            throw new ZimmuFileValidationError(`${path}.datum`, 'must identify the site level datum')
          levels.forEach((rawLevel, n) => {
            const lp = `${path}.siteLevels[${n}]`
            const level = recordAt(rawLevel, lp)
            unique(level.id, `${lp}.id`)
            stringAt(level.name, `${lp}.name`)
            vec2At(level.at, `${lp}.at`)
            const elevation = recordAt(level.elevation, `${lp}.elevation`)
            finiteNumberAt(elevation.value, `${lp}.elevation.value`)
            positiveAt(elevation.uncertainty, `${lp}.elevation.uncertainty`, true)
            if (!stringAt(elevation.source, `${lp}.elevation.source`).trim())
              throw new ZimmuFileValidationError(`${lp}.elevation.source`, 'must identify the measurement source')
            if (!Number.isFinite(Date.parse(stringAt(elevation.recordedAt, `${lp}.elevation.recordedAt`))))
              throw new ZimmuFileValidationError(`${lp}.elevation.recordedAt`, 'must be a valid date')
          })
        }
        const walls = arrayAt(geometry.walls, `${path}.walls`)
        const wallIds = new Set<string>()
        walls.forEach((rawWall, n) => {
          const wp = `${path}.walls[${n}]`
          const wall = recordAt(rawWall, wp)
          unique(wall.id, `${wp}.id`)
          wallIds.add(wall.id as string)
          stringAt(wall.name, `${wp}.name`)
          const start = vec2At(wall.start, `${wp}.start`)
          const end = vec2At(wall.end, `${wp}.end`)
          if (start.x === end.x && start.y === end.y) throw new ZimmuFileValidationError(wp, 'wall must have length')
          if (wall.measuredLength !== undefined) {
            const mp = `${wp}.measuredLength`
            const measurement = recordAt(wall.measuredLength, mp)
            positiveAt(measurement.value, `${mp}.value`)
            if (!stringAt(measurement.source, `${mp}.source`).trim())
              throw new ZimmuFileValidationError(`${mp}.source`, 'must identify the measurement source')
            if (!Number.isFinite(Date.parse(stringAt(measurement.recordedAt, `${mp}.recordedAt`))))
              throw new ZimmuFileValidationError(`${mp}.recordedAt`, 'must be a valid date')
            positiveAt(measurement.uncertainty, `${mp}.uncertainty`, true)
          }
        })
        arrayAt(geometry.openings, `${path}.openings`).forEach((rawOpening, n) => {
          const op = `${path}.openings[${n}]`
          const opening = recordAt(rawOpening, op)
          unique(opening.id, `${op}.id`)
          if (!wallIds.has(opening.wallId as string)) throw new ZimmuFileValidationError(`${op}.wallId`, 'must name a room wall')
          if (opening.kind !== 'door' && opening.kind !== 'window') throw new ZimmuFileValidationError(`${op}.kind`, 'must be door or window')
          positiveAt(opening.offset, `${op}.offset`, true)
          positiveAt(opening.width, `${op}.width`)
          positiveAt(opening.sill, `${op}.sill`, true)
          positiveAt(opening.height, `${op}.height`)
          if (opening.swing !== undefined) {
            if (opening.kind !== 'door') throw new ZimmuFileValidationError(`${op}.swing`, 'only a door can swing')
            const swing = recordAt(opening.swing, `${op}.swing`)
            if (swing.hinge !== 'start' && swing.hinge !== 'end')
              throw new ZimmuFileValidationError(`${op}.swing.hinge`, 'must be start or end')
            if (swing.side !== 'left' && swing.side !== 'right')
              throw new ZimmuFileValidationError(`${op}.swing.side`, 'must be left or right')
            positiveAt(swing.radius, `${op}.swing.radius`)
          }
        })
        arrayAt(geometry.obstacles, `${path}.obstacles`).forEach((rawObstacle, n) => {
          const op = `${path}.obstacles[${n}]`
          const obstacle = recordAt(rawObstacle, op)
          unique(obstacle.id, `${op}.id`)
          stringAt(obstacle.name, `${op}.name`)
          vec2At(obstacle.position, `${op}.position`)
          positiveAt(obstacle.width, `${op}.width`)
          positiveAt(obstacle.depth, `${op}.depth`)
          positiveAt(obstacle.height, `${op}.height`)
        })
        arrayAt(geometry.placements, `${path}.placements`).forEach((rawPlacement, n) => {
          const pp = `${path}.placements[${n}]`
          const placement = recordAt(rawPlacement, pp)
          const cabinetId = stringAt(placement.cabinetId, `${pp}.cabinetId`)
          if (!rootCabinets.has(cabinetId) || !roomRoots.has(cabinetId) || placedCabinets.has(cabinetId)) throw new ZimmuFileValidationError(`${pp}.cabinetId`, 'must name an unplaced cabinet owned by this room')
          placedCabinets.add(cabinetId)
          if (!wallIds.has(placement.wallId as string)) throw new ZimmuFileValidationError(`${pp}.wallId`, 'must name a room wall')
          positiveAt(placement.offset, `${pp}.offset`, true)
          positiveAt(placement.setback, `${pp}.setback`, true)
          vec2At(placement.manualOffset, `${pp}.manualOffset`)
        })
        if (geometry.clearances !== undefined) {
          const assessed = new Set<string>()
          arrayAt(geometry.clearances, `${path}.clearances`).forEach((rawClearance, n) => {
            const cp = `${path}.clearances[${n}]`
            const clearance = recordAt(rawClearance, cp)
            const cabinetId = stringAt(clearance.cabinetId, `${cp}.cabinetId`)
            const sectionId = stringAt(clearance.sectionId, `${cp}.sectionId`)
            const cabinet = scene.components.find((c) => c.id === cabinetId)
            const front = cabinet?.kind === 'carcase' ? frontForSection(cabinet.params.section, sectionId, cabinet.params.frame) : undefined
            const kind = clearance.kind
            if (!roomComponents.has(cabinetId) || !front ||
              (kind === 'door' ? front.kind !== 'door' : kind === 'drawer' ? front.kind !== 'drawer-front' : true))
              throw new ZimmuFileValidationError(cp, 'must name a matching door or drawer front owned by this room')
            const key = `${cabinetId}:${sectionId}`
            if (assessed.has(key)) throw new ZimmuFileValidationError(cp, 'must assess each front only once')
            assessed.add(key)
            positiveAt(clearance.projection, `${cp}.projection`)
          })
        }
      }
      if (!items.length) throw new ZimmuFileValidationError(`${roomPath}.items`, 'must not be empty')
      items.forEach((rawItem, i) => {
        const itemPath = `${roomPath}.items[${i}]`
        const item = recordAt(rawItem, itemPath)
        unique(item.id, `${itemPath}.id`)
        stringAt(item.name, `${itemPath}.name`)
        if (item.jid !== undefined) stringAt(item.jid, `${itemPath}.jid`)
        if (item.cutlistNumber !== undefined && !/^\d{6}$/.test(stringAt(item.cutlistNumber, `${itemPath}.cutlistNumber`)))
          throw new ZimmuFileValidationError(`${itemPath}.cutlistNumber`, 'must be six digits')
        arrayAt(item.rootComponentIds, `${itemPath}.rootComponentIds`).forEach((value, n) => {
          const refPath = `${itemPath}.rootComponentIds[${n}]`
          const id = stringAt(value, refPath)
          if (!roots.has(id) || owned.has(id))
            throw new ZimmuFileValidationError(refPath, 'must name one unassigned root component')
          owned.add(id)
        })
        arrayAt(item.rootPartIds, `${itemPath}.rootPartIds`).forEach((value, n) => {
          const refPath = `${itemPath}.rootPartIds[${n}]`
          const id = stringAt(value, refPath)
          if (!partRoots.has(id) || ownedParts.has(id))
            throw new ZimmuFileValidationError(refPath, 'must name one unassigned root part')
          ownedParts.add(id)
        })
      })
    })
  })
  if (owned.size !== roots.size || ownedParts.size !== partRoots.size)
    throw new ZimmuFileValidationError('file.project', 'must assign every root component and part to one item')
}

function validateEdgeFacts(scene: Scene): void {
  const isEdge = (name: string): boolean => scene.materials[name]?.use === 'edge'
  scene.parts.forEach((part, index) => {
    if (part.kind !== 'board' || part.edgeBanding === undefined) return
    const path = `file.scene.parts[${index}].edgeBanding`
    for (const [key, value] of Object.entries(recordAt(part.edgeBanding, path))) {
      if (!EDGE_KEYS.some((k) => k === key)) {
        throw new ZimmuFileValidationError(`${path}.${key}`, 'is not an edge (x0, x1, y0 or y1)')
      }
      if (value !== null && (typeof value !== 'string' || !isEdge(value))) {
        throw new ZimmuFileValidationError(
          `${path}.${key}`,
          'must be null or the name of an edge-band material',
        )
      }
    }
  })
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
  validateEdgeFacts(file.scene)
  assertUniqueIds(file.scene.components, 'file.scene.components')

  const componentIds = new Set(file.scene.components.map((component) => component.id))
  for (const [index, component] of file.scene.components.entries()) {
    const path = `file.scene.components[${index}]`
    stringAt(component.id, `${path}.id`)
    stringAt(component.label, `${path}.label`)
    vecAt(component.position, `${path}.position`)
    vecAt(component.rotation, `${path}.rotation`)
    if (component.kind === 'carcase' && component.catalogue !== undefined) {
      const catalogue = recordAt(component.catalogue, `${path}.catalogue`)
      if (!stringAt(catalogue.id, `${path}.catalogue.id`).trim())
        throw new ZimmuFileValidationError(`${path}.catalogue.id`, 'must be non-empty')
      if (integerAt(catalogue.version, `${path}.catalogue.version`) < 1)
        throw new ZimmuFileValidationError(`${path}.catalogue.version`, 'must be positive')
      const overrides = recordAt(catalogue.overrides, `${path}.catalogue.overrides`)
      for (const key of Object.keys(overrides)) {
        if (!Object.hasOwn(component.params, key))
          throw new ZimmuFileValidationError(`${path}.catalogue.overrides.${key}`, 'must name a cabinet parameter')
        if (JSON.stringify(overrides[key]) !== JSON.stringify(component.params[key as keyof typeof component.params]))
          throw new ZimmuFileValidationError(`${path}.catalogue.overrides.${key}`, 'must match the saved cabinet parameter')
      }
    }
    if (component.parentId !== null && !componentIds.has(component.parentId)) {
      throw new ZimmuFileValidationError(`${path}.parentId`, 'must name a live component or be null')
    }
    if (component.kind === 'carcase') {
      const edgeMaterial = (component.params as { edgeMaterial?: unknown } | undefined)?.edgeMaterial
      if (edgeMaterial !== undefined) stringAt(edgeMaterial, `${path}.params.edgeMaterial`)
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

  if (file.project !== undefined) validateProject(file.project, file.scene)

  return file
}
