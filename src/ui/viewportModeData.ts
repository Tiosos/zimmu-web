import type { InteractionMode } from '../scene/useInteractionMode'

/**
 * The signed-off 15-mode set for the Viewport Modes perspective (DESIGN-SIGNOFF.md §5, decision
 * D1). This is a specification/data module — no component logic — kept separate so
 * ViewportModes.tsx exports components only (react-refresh).
 *
 * Class A modes map 1:1 to the real `InteractionMode` union and are activated through the real
 * `mode.setMode`. Class B modes are tool/display modes with no such state machine; each declares
 * honestly whether it has a real backend to wire (`wired`) or is an advisory preview (`advisory`).
 */

export type ModeClass = 'A' | 'B'
export type Wiring = 'wired' | 'advisory'

export interface ModeParam {
  label: string
  value: string
  /** true when the value can be changed in the UI; advisory modes render read-only. */
  editable?: boolean
}

export interface ViewportModeSpec {
  id: string
  name: string
  group: 'Navigation' | 'Editing' | 'Joinery' | 'Display'
  modeClass: ModeClass
  /** Authoritative key from §6; only Class A has one. */
  key?: string
  /** The real InteractionMode to activate, present for all 7 Class A modes. */
  interactionMode?: InteractionMode
  /** A short description that matches actual behavior (FR-VM-05). */
  description: string
  steps: [string, string, string]
  params: ModeParam[]
  /** Shown as the live selection/readout in the panel. */
  liveState: string
  /** Shown as the gizmo/readout block. */
  gizmo: string
  wiring: Wiring
  /** For advisory modes: why Apply cannot commit, stated in the panel (FR-VM-05). */
  advisory?: string
}

export const MODE_GROUPS: { group: ViewportModeSpec['group']; ids: string[] }[] = [
  { group: 'Navigation', ids: ['select', 'move', 'measure'] },
  { group: 'Editing', ids: ['addPart', 'snap', 'cut', 'drilling'] },
  { group: 'Joinery', ids: ['dado', 'halflap', 'mortiseTenon', 'finger', 'tongueGroove', 'dowel'] },
  { group: 'Display', ids: ['dimensions', 'visibility'] },
]

export const MODES: Record<string, ViewportModeSpec> = {
  // ---- Class A: real interaction state machine, authoritative keys ----
  snap: {
    id: 'snap', name: 'Face Snap', group: 'Editing', modeClass: 'A', key: 'F', interactionMode: 'snap',
    description: 'Click a source face, then a target face; the moving part aligns and seats automatically.',
    steps: ['Click the source face on the moving part', 'Click the target face on the stationary part', 'The part aligns and seats automatically'],
    params: [{ label: 'Alignment', value: 'Flush', editable: true }, { label: 'Keep Z-up', value: 'On', editable: true }],
    liveState: 'Source → Target faces selected',
    gizmo: 'Phase: source-pick\nSource: +X face\nGap: 0.0 mm',
    wiring: 'wired',
  },
  cut: {
    id: 'cut', name: 'Cut', group: 'Editing', modeClass: 'A', key: 'C', interactionMode: 'cut',
    description: 'Click a face, drag a cut rectangle, and confirm to rebuild geometry.',
    steps: ['Click the face to cut into', 'Drag the cut rectangle handles', 'Confirm to rebuild geometry'],
    params: [{ label: 'Type', value: 'Box cut', editable: true }, { label: 'Width', value: '40 mm', editable: true }, { label: 'Depth', value: '18 mm', editable: true }],
    liveState: 'BC-02 · front face · cut preview',
    gizmo: 'Cut: 40 × 18 mm\nDepth: 18.0 mm\nLinked: yes',
    wiring: 'wired',
  },
  dado: {
    id: 'dado', name: 'Dado', group: 'Joinery', modeClass: 'A', key: 'J', interactionMode: 'dado',
    description: 'Click a housing face, then the housed board end, to cut a parametric groove.',
    steps: ['Click the housing face', 'Click the housed board end', 'Adjust profile and stops in the inspector'],
    params: [{ label: 'Profile', value: 'Standard', editable: true }, { label: 'Depth', value: '12 mm', editable: true }, { label: 'Clearance', value: '0.2 mm', editable: true }],
    liveState: 'Housing → housed board seats into groove',
    gizmo: 'Type: Dado\nGroove: 18 × 12\nStops: through',
    wiring: 'wired',
  },
  halflap: {
    id: 'halflap', name: 'Half-lap', group: 'Joinery', modeClass: 'A', key: 'L', interactionMode: 'halflap',
    description: 'Click two overlapping boards to cut matched notches on the split plane.',
    steps: ['Click the first overlapping board', 'Click the second board', 'Adjust split plane and clearance'],
    params: [{ label: 'Split', value: '0 (50%)', editable: true }, { label: 'Clearance', value: '0.2 mm', editable: true }],
    liveState: 'Board A ↔ Board B · notch preview',
    gizmo: 'Split: 50%\nClear: 0.2 mm\nNotches: 2',
    wiring: 'wired',
  },
  mortiseTenon: {
    id: 'mortiseTenon', name: 'Mortise & Tenon', group: 'Joinery', modeClass: 'A', key: 'M', interactionMode: 'mortiseTenon',
    description: 'Click a mortise face, then the perpendicular tenon end, to size the pocket and tenon.',
    steps: ['Click the mortise face', 'Click the perpendicular tenon end', 'Size the tenon and pocket'],
    params: [{ label: 'Tenon length', value: '30 mm', editable: true }, { label: 'Thickness', value: '8 mm', editable: true }, { label: 'Through', value: 'Off', editable: true }],
    liveState: 'Mortise board → tenon board',
    gizmo: 'Tenon: 40 × 8 × 30\nPocket: blind\nShoulders: 2',
    wiring: 'wired',
  },
  finger: {
    id: 'finger', name: 'Finger Joint', group: 'Joinery', modeClass: 'A', key: 'B', interactionMode: 'finger',
    description: 'Click two equal-width board ends to lay out interlocking fingers.',
    steps: ['Click one board end', 'Click the perpendicular equal-width end', 'Set finger count and clearance'],
    params: [{ label: 'Fingers', value: '6', editable: true }, { label: 'Clearance', value: '0.2 mm', editable: true }],
    liveState: 'End A ↔ End B · interlocking fingers',
    gizmo: 'Fingers: 6\nClear: 0.2 mm\nCorner: seated',
    wiring: 'wired',
  },
  tongueGroove: {
    id: 'tongueGroove', name: 'Tongue & Groove', group: 'Joinery', modeClass: 'A', key: 'T', interactionMode: 'tongueGroove',
    description: 'Click two facing long edges to form a coplanar tongue and groove.',
    steps: ['Click the first board long edge', 'Click the facing edge of the second board', 'Set tongue thickness and depth'],
    params: [{ label: 'Thickness', value: '6 mm', editable: true }, { label: 'Depth', value: '8 mm', editable: true }],
    liveState: 'Edge A ↔ Edge B · coplanar boards',
    gizmo: 'Tongue: 6 × 8\nFit: 0.2 mm\nLength: full',
    wiring: 'wired',
  },

  // ---- Class B: tool/display modes, formally promoted (D1) ----
  select: {
    id: 'select', name: 'Select', group: 'Navigation', modeClass: 'B',
    description: 'Pick parts and faces in the viewport; drives the inspector selection.',
    steps: ['Click a part in the viewport', 'Shift-click to add to the selection', 'Press H to hide the selected part'],
    params: [{ label: 'Selection mode', value: 'Single / Multi' }, { label: 'Filter', value: 'Visible parts' }],
    liveState: 'Base Cabinet 02 · Carcase',
    gizmo: 'Selected ID: bc-02-a4f2\nParts: 1 · Joints: 2\nFace: +Z (front)',
    wiring: 'wired',
  },
  move: {
    id: 'move', name: 'Move', group: 'Navigation', modeClass: 'B',
    description: 'Translate the selected carcase with the drag gizmo; commits to undo history.',
    steps: ['Select a carcase to show the gizmo', 'Drag an axis handle to translate', 'Release to commit to undo history'],
    params: [{ label: 'Snap to grid', value: 'On', editable: true }, { label: 'Constrain to axis', value: 'Off', editable: true }],
    liveState: 'Base Cabinet 02 · moving on X',
    gizmo: 'ΔX: +120.0 mm\nΔY: 0.0 mm\nΔZ: 0.0 mm',
    wiring: 'wired',
  },
  measure: {
    id: 'measure', name: 'Measure', group: 'Navigation', modeClass: 'B',
    description: 'Measure the distance between two faces (reference readout only).',
    steps: ['Click the first reference face', 'Click the second reference face', 'Read the distance in the panel'],
    params: [{ label: 'Distance', value: '1240.0 mm' }, { label: 'Axis', value: 'X (horizontal)' }],
    liveState: 'Face A → Face B',
    gizmo: 'Distance: 1240.0 mm\nΔX: 1240.0\nΔY: 0.0',
    wiring: 'advisory',
    advisory: 'No 3D measurement renderer is available yet; distances shown here are reference values and cannot be committed to the model. The `M` key opens Mortise & Tenon, not Measure.',
  },
  addPart: {
    id: 'addPart', name: 'Add Part', group: 'Editing', modeClass: 'B',
    description: 'Add a board part from the material library at the chosen thickness.',
    steps: ['Choose material and thickness', 'Use Add Part to place a board', 'Adjust dimensions in the inspector'],
    params: [{ label: 'Length', value: '600 mm', editable: true }, { label: 'Width', value: '480 mm', editable: true }, { label: 'Thickness', value: '18 mm', editable: true }],
    liveState: 'Placing new board part',
    gizmo: 'Part: PB-107\nSize: 600 × 480 × 18\nMaterial: Alpine Walnut',
    wiring: 'wired',
  },
  drilling: {
    id: 'drilling', name: 'Drilling', group: 'Editing', modeClass: 'B',
    description: 'Place a drilling row with diameter, pitch, count and depth.',
    steps: ['Click the drilling face', 'Set diameter, pitch and count', 'Confirm to cut and schedule the row'],
    params: [{ label: 'Diameter', value: 'Ø8 mm' }, { label: 'Pitch', value: '32 mm' }, { label: 'Count', value: '8' }],
    liveState: 'Back Panel · drilling row preview',
    gizmo: 'Row: 8 × Ø8\nPitch: 32 mm\nDepth: 12 mm',
    wiring: 'advisory',
    advisory: 'Drilling geometry is validated on commit in the cabinet editors, but there is no interactive drilling-row placement mode in the 3D viewport yet.',
  },
  dowel: {
    id: 'dowel', name: 'Dowel', group: 'Joinery', modeClass: 'B',
    description: 'Place dowels at system pitch across two mating faces.',
    steps: ['Arm a dowel cut tool', 'Click the first mating face', 'Click the second face to place dowels'],
    params: [{ label: 'Diameter', value: 'Ø8 mm', editable: true }, { label: 'Pitch', value: '32 mm', editable: true }, { label: 'Count', value: '4' }],
    liveState: 'Face A ↔ Face B · dowel positions',
    gizmo: 'Dowels: 4 × Ø8\nPitch: 32 mm\nDepth: 16 mm',
    wiring: 'wired',
  },
  dimensions: {
    id: 'dimensions', name: 'Dimensions', group: 'Display', modeClass: 'B',
    description: 'Toggle overall dimensions, cut labels and joint callouts on drawings.',
    steps: ['Open the 2D Drawings workflow', 'Toggle the annotation layers', 'Export the annotated sheet'],
    params: [{ label: 'Overall sizes', value: 'On' }, { label: 'Cut labels', value: 'On' }, { label: 'Joint callouts', value: 'On' }],
    liveState: 'BC-02 · dimensions are a drawing-layer concern',
    gizmo: 'W: 600 mm\nD: 560 mm\nH: 720 mm',
    wiring: 'advisory',
    advisory: 'Dimensions are rendered on 2D drawing sheets, not as a 3D viewport overlay. Use the Drawings workflow to toggle and export annotations.',
  },
  visibility: {
    id: 'visibility', name: 'Visibility', group: 'Display', modeClass: 'B',
    description: 'Toggle part visibility from the scene tree; hidden parts stay in the BOM.',
    steps: ['Select a part in the scene tree', 'Press H or click its eye icon', 'Hidden parts remain in the BOM'],
    params: [{ label: 'Ghost hidden parts', value: 'On', editable: true }, { label: 'Hide hardware', value: 'Off', editable: true }],
    liveState: 'Base Cabinet 03 · hidden',
    gizmo: 'Visible: 40 parts\nHidden: 2 parts\nGhost: on',
    wiring: 'wired',
  },
}

export const ALL_MODE_IDS: string[] = MODE_GROUPS.flatMap((g) => g.ids)

export const CLASS_A_IDS: string[] = ALL_MODE_IDS.filter((id) => MODES[id].modeClass === 'A')
export const CLASS_B_IDS: string[] = ALL_MODE_IDS.filter((id) => MODES[id].modeClass === 'B')
