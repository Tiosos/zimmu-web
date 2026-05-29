export type PartId = string

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  color: string
  position: Vec3 // corner at board's local origin, not centroid
  rotation: Vec3
  rotationOrder: 'XYZ'
}

export type Part = BoardPart

export interface Scene {
  parts: Part[]
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
