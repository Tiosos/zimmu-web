import type { Section } from './sectionTree'

export type { Section, SectionId, SectionSize, SectionContent, DivisionKind } from './sectionTree'

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
  sourceComponentId?: string // set on cuts a component places directly (e.g. toe-kick notch)
}

export interface MitreCut {
  kind: 'mitre'
  id: CutId
  label: string
  end: '+X' | '-X' // which end face is bevelled
  axis: 'Z' | 'Y' // 'Z' = flat mitre (tilt across width), 'Y' = bevel (tilt through thickness)
  angle: number // degrees from a square cut; 0 = square (no-op), 45 = standard
}

export interface HoleArrayCut {
  kind: 'hole-array'
  id: CutId
  label: string
  face: Face // which face the holes are drilled into
  axis: 'U' | 'V' // which of that face's two axes the row runs along
  start: Vec3 // first hole centre, part-local
  pitch: number // mm between hole centres
  count: number
  diameter: number
  depth: number
  sourceComponentId?: string // hole arrays are component-owned, never joint-owned
}

export type CutDef = BoxCut | MitreCut | HoleArrayCut

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

// Which of a panel's three axes carries the material thickness. Lives here rather than in
// carcaseRoles so grain.ts can name it without importing the generator it feeds.
export type ThicknessAxis = 'x' | 'y' | 'z'

// 'free' means the nester may rotate the part 90°. It is the default for a hand-made board and is
// never what the carcase generator emits — a generated panel always states a direction.
export type Grain = 'length' | 'width' | 'free'

export interface BoardPart {
  kind: 'board'
  id: PartId
  label: string
  length: number
  width: number
  thickness: number
  grain: Grain
  material: string // "" means unspecified
  color: string
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  cuts: CutDef[]
  visible: boolean
  parentId: ComponentId | null
  driven: boolean
  role?: string // set only on driven parts; the regeneration identity key
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
  parentId: ComponentId | null
  driven: boolean
  role?: string // set only on driven parts; the regeneration identity key
}

export type Part = BoardPart | CylinderPart

export interface MaterialDef {
  costPerM2?: number // areal rate ($/m²) for sheet/board stock
  costPerM?: number // linear rate ($/m) for round/linear stock (dowels)
  // Absent means the material is not nested — dowels, hardware, solid stock bought to length. Such
  // a material keeps its Boards-tab rows and is simply absent from the yield report.
  sheet?: { length: number; width: number; costPerSheet?: number }
  // MDF and the like: the stock has no direction, so the nester may rotate any part of it 90°
  // regardless of that part's own grain. Absent is treated as "has grain" — the safe default.
  hasGrain?: boolean
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
  linkedComponentIds: string[] // cabinets/groups this item belongs to
}

export type ComponentId = string

export interface CarcaseParams {
  width: number
  height: number
  depth: number
  material: string
  thickness: number
  hasTop: boolean
  backMode: 'captured' | 'applied' | 'none'
  backThickness: number
  baseMode: 'toe-kick' | 'ladder' | 'legs' | 'none'
  toeKickHeight: number
  toeKickSetback: number
  section: Section
  adjustableShelves: {
    rows: 1 | 2
    pitch: 32 // literal, not number: 32 mm *is* the system being modelled
    setback: number // front row, from the panel's front edge
    backSetback: number // back row, from the panel's back edge
    startHeight: number
    count: number
  }
  jointMethod: 'dado-rabbet' | 'finger' | 'dowel' | 'butt-screw' | 'confirmat'
}

export interface GroupComponent {
  kind: 'group'
  id: ComponentId // "cmp_<uuid>"
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
}

export interface CarcaseComponent {
  kind: 'carcase'
  id: ComponentId // "cmp_<uuid>"
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  params: CarcaseParams
}

export type Component = GroupComponent | CarcaseComponent

export type Selection = { kind: 'part'; id: PartId } | { kind: 'component'; id: ComponentId }

export interface DadoJoint {
  kind: 'dado'
  id: string // "joint_<uuid>"
  label: string // "Dado 1"
  sourceComponentId?: string
  driven: boolean
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
  sourceComponentId?: string
  driven: boolean
  partAId: PartId // the two lapping boards — A/B is just an ordering
  partBId: PartId
  split: number // 0..1 — fraction of thickness board A keeps (default 0.5 = true half-lap)
  clearance: number // mm added to each notch's thickness-depth for fit (default 0)
}

export interface MortiseTenonJoint {
  kind: 'mortise-tenon'
  id: string // "joint_<uuid>"
  label: string // "Mortise & tenon 1"
  sourceComponentId?: string
  driven: boolean
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
  sourceComponentId?: string
  driven: boolean
  partAId: PartId // lead board — keeps EVEN world-segments; stays put
  endA: Face // A's joined end (a non-thickness end)
  partBId: PartId // mating board — keeps ODD world-segments; auto-seats into the corner
  endB: Face // B's joined end
  fingerCount: number // N — the shared joint width split into N equal segments
  clearance: number // mm — widens each cut slot for fit (default 0)
}

export interface TongueGrooveJoint {
  kind: 'tongue-groove'
  id: string // "joint_<uuid>"
  label: string // "Tongue & groove 1"
  sourceComponentId?: string
  driven: boolean
  groovePartId: PartId // board carrying the groove — stays put (first click)
  grooveEdge: Face // the long edge (±Y) the groove is cut into
  tonguePartId: PartId // board carrying the centered tongue — auto-seats (second click)
  tongueEdge: Face // the long edge (±Y) the tongue is formed on
  tongueThickness: number // mm — tongue thickness = groove width (before clearance)
  tongueDepth: number // mm — tongue projection = groove depth
  clearance: number // mm — added to groove width for fit (default 0)
}

export type Joint = DadoJoint | HalfLapJoint | MortiseTenonJoint | FingerJoint | TongueGrooveJoint

export interface Scene {
  parts: Part[]
  materials: Record<string, MaterialDef> // keyed by material name string
  hardware: HardwareItem[]
  joints: Joint[]
  components: Component[]
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
