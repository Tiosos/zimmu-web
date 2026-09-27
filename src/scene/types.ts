import type { Section, SectionId } from './sectionTree'
import type { PartOverrides } from './resolveThickness'
import type { DrawerParams } from './drawerBox'

export type { Section, SectionId, SectionSize, SectionContent, DivisionKind } from './sectionTree'
export type { DrawerParams, RunnerFamily } from './drawerBox'

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
  // A hole array is owned either by a component or by a joint, never both.
  sourceComponentId?: string // set on hole arrays a component places directly (e.g. shelf-pin rows)
  // Set on hole arrays a Joint generates and owns (read-only in the UI), exactly as on a box cut.
  // Screw fixing is the first joint whose geometry is bores rather than a groove; before it, the
  // only joint-owned cut kind was 'box'.
  sourceJointId?: string
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
  // What the user has taken ownership of on an otherwise driven part. Applied on top of the driven
  // value, so the part still follows width, depth and joinery. Absent on almost every part.
  overrides?: PartOverrides
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
  // Panel thickness in mm. Absent means the material is not a sheet good — dowel and hardware
  // stock has no panel thickness — following the same convention as `sheet?`. A material used as a
  // carcase or back slot must have one; `validateCarcaseParams` rejects it otherwise, because a
  // silent zero would collapse every panel derived from it.
  thickness?: number
}

// What a shop knows about a catalogue item that the cabinet cannot: who sells it, under what
// number, for how much. Global rather than per project — a hinge is priced once, not per file —
// which is why it lives in the `hardware` IndexedDB store and never in `ZimmuFile`. The item's
// name and unit come from `hardwareCatalogue.ts`, never from here.
export interface HardwareLibraryEntry {
  supplier: string
  partNumber: string
  // Nullable because an entry can carry a supplier and part number before anyone has priced it,
  // and an unpriced row must not read as a free one. An explicit 0 IS a price.
  unitCost: number | null
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
  // The material slots a role draws its thickness from; `roleThicknessFor` is the one rule that
  // says which. There is no `frontMaterial` until there are fronts to use it.
  carcaseMaterial: string
  backMaterial: string
  // Fronts draw on their own slot, so a shaker door in oak on a ply carcase is one field, not a
  // per-part override on every door. Material is the nest's grouping key, so this also gives the
  // fronts their own sheet count and cost line in the yield report.
  frontMaterial: string
  // Absent IS frameless — the rule anchors already use for detached. A separate `frameMode` would
  // be a second way to say the same thing and a second way for the two to disagree.
  frame?: FaceFrameParams
  // A fourth material slot, not a field on FaceFrameParams: `materialForRole` is the one place the
  // slots are told apart, and a material stored on the parameter bag would be a second mechanism.
  // Every cabinet carries it, framed or not, exactly as every cabinet carries `frontMaterial`.
  frameMaterial: string
  hasTop: boolean
  backMode: 'captured' | 'applied' | 'none'
  baseMode: 'toe-kick' | 'ladder' | 'legs' | 'none'
  toeKickHeight: number
  toeKickSetback: number
  // Inset sits the front in the opening, `y ∈ [0, FT]`; overlay puts it in front of the carcase,
  // `y ∈ [−FT, 0]`. The difference is not cosmetic: an overlay front lands on the carcase face and
  // is a contact pair, an inset one is a reveal clear of everything.
  // 'half-overlay' is legal ONLY on a framed cabinet, and validation refuses it otherwise rather
  // than quietly treating it as overlay. A door laps its OWN stile by half that stile's width: it
  // never reads a neighbour, so `regenerateComponents` stays a pure function of one cabinet's
  // parameters. Two butted cabinets then read as sharing a stile as a consequence, not a rule.
  frontMount: 'overlay' | 'half-overlay' | 'inset'
  // The visible gap, everywhere. One number governs the gap between two fronts, between a front and
  // the carcase, and between the doors of two cabinets standing side by side.
  frontReveal: number
  // The cabinet's interior division *and* its shelving: a pin row belongs to the section that
  // needs it, so there is no cabinet-wide adjustable-shelf bundle to state one.
  section: Section
  jointMethod: 'dado-rabbet' | 'finger' | 'dowel' | 'butt-screw' | 'confirmat'
}

export interface FaceFrameParams {
  stileWidth: number
  railWidth: number
  // A centre stile is customarily wider than an edge one, because two half-overlay doors each
  // cover half of it. Unused until stage 2 adds divisions, but present from v20 so a stage-1 file
  // stays readable by a stage-2 build.
  midStileWidth: number
  midRailWidth: number
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

// Where a cabinet stands relative to another. The position it implies is DERIVED; a carcase with no
// anchor is free-placed and its `position` is the user's. Presence or absence says which, so no
// `driven` flag is needed — the same distinction `driven: false` draws for a part.
export interface Anchor {
  to: ComponentId
  // A face of the TARGET, in the target's own frame.
  face: 'left' | 'right' | 'front' | 'back'
  // Clearance along that face's normal. 0 butts the two cabinets together.
  gap: number
  // Offset within the face's plane, measured from the target's minimum corner on each of the two
  // axes the normal is not, taken in x < y < z order. {0, 0} is flush, but which edges that means
  // depends on the face: for left/right the in-plane axes are (y, z), so flush is front-flush and
  // floor-flush; for front/back — whose own normal already runs the front-back axis — the in-plane
  // axes are (x, z), so flush is left-flush and floor-flush.
  offset: { u: number; v: number }
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
  anchor?: Anchor
}

export interface DrawerComponent {
  kind: 'drawer'
  id: ComponentId // "cmp_<uuid>"
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  // Which opening this drawer fills. Reconciliation is by (parentId, sectionId) and never by
  // index: the v12 divider shim rebuilds section ids on every keystroke, so an index would rebind
  // a drawer to a different bay. `null` on a detached drawer whose opening is gone: the section id
  // is released so a later pass cannot reclaim it, exactly as a detached part's role key is.
  sectionId: SectionId | null
  params: DrawerParams
  // No other component carries this. A detached drawer is the user's — no regeneration, no
  // deletion — exactly as a detached part is. Carcases and groups are deliberately left out: a
  // detached carcase has no defined meaning today and inventing one here would be unearned scope.
  driven: boolean
}

export interface FaceFrameComponent {
  kind: 'faceFrame'
  id: ComponentId // "cmp_<uuid>"
  label: string
  parentId: ComponentId | null
  position: Vec3
  rotation: Vec3
  rotationOrder: 'XYZ'
  visible: boolean
  // Same rule as a drawer: a detached frame is the user's — no regeneration, no deletion. Carcases
  // and groups deliberately lack it, because a detached carcase has no defined meaning.
  driven: boolean
}

export type Component =
  | GroupComponent
  | CarcaseComponent
  | DrawerComponent
  | FaceFrameComponent

export type Selection =
  | { kind: 'part'; id: PartId }
  | { kind: 'component'; id: ComponentId }
  // Carries the cabinet id as well: finding which cabinet owns a section id otherwise means
  // scanning every carcase's tree. Consumers must check `cabinetId` against the open cabinet —
  // section ids are NOT unique across cabinets built from one preset, so an unchecked stale pick
  // can name a live opening in whichever cabinet is open and edit the wrong bay.
  | { kind: 'section'; cabinetId: ComponentId; sectionId: SectionId }

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

export interface ScrewJoint {
  kind: 'screw'
  id: string // "joint_<uuid>"
  label: string // "Screw fixing 1"
  sourceComponentId?: string
  driven: boolean
  throughPartId: PartId // panel screwed through — clearance holes on its face
  throughFace: Face // the face the screws enter
  receivingPartId: PartId // panel receiving them — pilots into its end
  receivingEnd: Face // the end face the screws are driven into
  screwCount: number // holes in each row; the spacing follows from the joint line's length
  endInset: number // mm — first and last screw, from each end of the joint line
  clearanceDiameter: number // mm — shank clearance, bored right through the through panel
  pilotDiameter: number // mm — narrower, so the thread bites
  pilotDepth: number // mm — never through: a screw that bursts out the far face is a defect
}

export type Joint =
  | DadoJoint
  | HalfLapJoint
  | MortiseTenonJoint
  | FingerJoint
  | TongueGrooveJoint
  | ScrewJoint

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
