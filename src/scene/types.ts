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

export interface FaceHit {
  partId: PartId
  faceNormal: Vec3 // world-space unit normal, snapped to nearest axis
  faceCenter: Vec3 // world-space face centre — used by computeSnapDelta
  localFaceNormal: Vec3 // canonical local-space normal; exactly one ±1 component, rest 0
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
