export type PartId = string
export type CutId = string

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CutDef {
  id: CutId
  label: string
  face: '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'
  position: Vec3
  size: Vec3
  pairedCutId?: string // "{partId}:{cutId}"
}

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  material: string // "" means unspecified
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]
  visible: boolean
}

export interface CylinderPart {
  kind: 'cylinder'
  id: PartId
  label: string
  diameter: number // mm
  length: number // mm — extent along local +Z
  material: string // "" means unspecified
  color: string
  position: Vec3 // base-circle center; local origin lies on the axis
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
}

export type Part = BoardPart | CylinderPart

export interface MaterialDef {
  costPerM2?: number // areal rate ($/m²) for sheet/board stock
  costPerM?: number // linear rate ($/m) for round/linear stock (dowels)
}

export interface HardwareItem {
  id: string // UUID — stable across edits
  name: string
  qty: number
  unit: string // "pcs", "m", "kg", "box", etc.
  supplier: string
  partNumber: string
  unitCost: number // cost per single unit
  notes: string
  linkedPartIds: string[] // reserved for future 3D linkage
}

export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef> // keyed by material name string
  hardware: HardwareItem[]
}

export interface FaceHit {
  partId: PartId
  faceNormal: Vec3
  faceCenter: Vec3
  localFaceNormal: Vec3
  localHitPoint: Vec3
}

export interface CameraState {
  position: Vec3
  target: Vec3
}

export interface ZimmuFile {
  version: number
  name: string
  appVersion: string
  units: 'mm'
  createdAt: string
  updatedAt: string
  camera: CameraState
  scene: Scene
}
