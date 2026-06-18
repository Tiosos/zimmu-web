export type PartId = string
export type CutId = string

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type Face = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'

export interface BoxCut {
  kind: 'box'
  id: CutId
  label: string
  face: Face
  position: Vec3
  size: Vec3
  pairedCutId?: string // "{partId}:{cutId}"
}

export interface MitreCut {
  kind: 'mitre'
  id: CutId
  label: string
  end: '+X' | '-X' // which end face is bevelled
  axis: 'Z' | 'Y' // 'Z' = flat mitre (tilt across width), 'Y' = bevel (tilt through thickness)
  angle: number // degrees from a square cut; 0 = square (no-op), 45 = standard
}

export type CutDef = BoxCut | MitreCut

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

export type Part = BoardPart

export interface MaterialDef {
  costPerM2: number // cost per square metre in user's currency
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
