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
  sourceJointId?: string // set on cuts generated & owned by a Joint (read-only in UI)
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

export interface DowelEndCut {
  kind: 'end'
  id: CutId
  label: string
  end: '+Z' | '-Z' // which cap the cut acts on
  offset: number // mm inward from that end where the cut plane crosses the axis
  angle: number // degrees tilt from perpendicular; 0 = square trim
  azimuth: number // degrees around the axis; direction the tilt faces (used when angle > 0)
}

export interface DowelNotch {
  kind: 'notch'
  id: CutId
  label: string
  position: number // mm along axis — notch center
  width: number // mm extent along axis
  depth: number // mm radial depth (0..diameter); depth = radius ⇒ half-lap
  azimuth: number // degrees around axis — which side the notch faces
}

export interface DowelBoreAxial {
  kind: 'bore-axial'
  id: CutId
  label: string
  end: '+Z' | '-Z' // which end the hole is drilled from
  diameter: number // mm
  depth: number // mm; depth ≥ length ⇒ through
}

export interface DowelBoreTransverse {
  kind: 'bore-transverse'
  id: CutId
  label: string
  position: number // mm along axis — hole center
  azimuth: number // degrees around axis — direction the hole enters
  diameter: number // mm
  depth: number // mm; depth ≥ diameter ⇒ through
}

export type DowelCut = DowelEndCut | DowelNotch | DowelBoreAxial | DowelBoreTransverse

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
  cuts: DowelCut[]
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

export interface DadoJoint {
  kind: 'dado'
  id: string // "joint_<uuid>"
  label: string // "Dado 1"
  housingPartId: PartId // board that carries the groove
  housingFace: Face // face the groove is cut into
  housedPartId: PartId // board that seats into the groove
  housedEnd: Face // the housed board's end face that seats in
  offset: number // mm — groove center along the housing face's narrow axis (housing-local)
  depth: number // mm — groove depth into the housing board
  clearance: number // mm — added to groove width (housedThickness + clearance)
  profile: 'plain' | 'rabbeted' // 'plain' = groove only; 'rabbeted' = groove + tongue
  tongueThickness: number // mm — tongue/groove width when rabbeted
  rabbetFace: '+Z' | '-Z' // housed-board local thickness face the rabbet removes from
  stopStart: number // mm the groove is inset from the run-axis 0 end (0 = through)
  stopEnd: number // mm the groove is inset from the run-axis far end (0 = through)
}

export interface HalfLapJoint {
  kind: 'halflap'
  id: string // "joint_<uuid>"
  label: string // "Half-lap 1"
  partAId: PartId // the two lapping boards — A/B is just an ordering
  partBId: PartId
  split: number // 0..1 — fraction of thickness board A keeps (default 0.5 = true half-lap)
  clearance: number // mm added to each notch's thickness-depth for fit (default 0)
}

export interface MortiseTenonJoint {
  kind: 'mortise-tenon'
  id: string // "joint_<uuid>"
  label: string // "Mortise & tenon 1"
  mortisePartId: PartId // board that carries the pocket
  mortiseFace: Face // face the pocket is cut into
  tenonPartId: PartId // board whose end becomes the tenon
  tenonEnd: Face // the tenon board's end reduced to the tongue
  tenonLength: number // mm — tongue projection = blind mortise depth
  tenonThickness: number // mm — tongue thickness (tenon board local Z)
  tenonWidth: number // mm — tongue width (the non-Z cross-section axis)
  clearance: number // mm — added to pocket cross-section + depth for fit
  through: boolean // false = blind pocket; true = pocket spans the mortise thickness
  offsetU: number // mortise center along mortiseFace's u axis
  offsetV: number // mortise center along mortiseFace's v axis
}

export interface FingerJoint {
  kind: 'finger'
  id: string // "joint_<uuid>"
  label: string // "Finger joint 1"
  partAId: PartId // lead board — keeps EVEN world-segments; stays put
  endA: Face // A's joined end (a non-thickness end)
  partBId: PartId // mating board — keeps ODD world-segments; auto-seats into the corner
  endB: Face // B's joined end
  fingerCount: number // N — the shared joint width split into N equal segments
  clearance: number // mm — widens each cut slot for fit (default 0)
}

export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint

export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef> // keyed by material name string
  hardware: HardwareItem[]
  joints: Joint[]
}

export interface FaceHit {
  partId: PartId
  faceNormal: Vec3
  faceCenter: Vec3
  localFaceNormal: Vec3
  localHitPoint: Vec3
  hitPoint: Vec3 // world-space ray intersection point
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
