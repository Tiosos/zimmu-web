/**
 * S4 workflow catalogue (DESIGN-SIGNOFF.md §7.1, FR-MF-01…08). Kept data-only so the perspective
 * shell, component tests and e2e tests all read the same eight entries and the same order.
 */
export type ManufacturingWorkflowId =
  | 'cuttingList'
  | 'readiness'
  | 'drawings'
  | 'packet'
  | 'comparison'
  | 'changeReview'
  | 'verify'
  | 'exports'

export interface ManufacturingWorkflowCard {
  id: ManufacturingWorkflowId
  title: string
  description: string
  icon: string
  group: 'Preparation' | 'Release'
}

export const MANUFACTURING_WORKFLOWS: readonly ManufacturingWorkflowCard[] = [
  {
    id: 'cuttingList',
    title: 'Cutting List',
    description: 'Boards, hardware and library rates with sheet nesting and CSV output.',
    icon: '▤',
    group: 'Preparation',
  },
  {
    id: 'readiness',
    title: 'Readiness Review',
    description: 'Corrections, advisories and unassessed checks with source references.',
    icon: '⚑',
    group: 'Preparation',
  },
  {
    id: 'drawings',
    title: 'Shop Drawings',
    description: 'Dimensioned front, edge and end projections with cut labels.',
    icon: '⌗',
    group: 'Preparation',
  },
  {
    id: 'packet',
    title: 'Production Packet',
    description: 'Machining schedules, drawing index, cutting lists and hashed manifest.',
    icon: '▣',
    group: 'Preparation',
  },
  {
    id: 'comparison',
    title: 'Release Comparison',
    description: 'Compare two verified packets and select the parts that changed.',
    icon: '⇄',
    group: 'Release',
  },
  {
    id: 'changeReview',
    title: 'Local Change Review',
    description: 'Acknowledge changes and bind reviewer notes to both packet hashes.',
    icon: '✓',
    group: 'Release',
  },
  {
    id: 'verify',
    title: 'Verify Packet',
    description: 'Check a downloaded ZIP inventory, hashes, schedules and drawing IDs.',
    icon: '⌕',
    group: 'Release',
  },
  {
    id: 'exports',
    title: 'Exports',
    description: 'STL, STEP, SVG, DXF, PDF, CSV and production ZIP outputs.',
    icon: '⇩',
    group: 'Release',
  },
] as const

export interface ManufacturingExportAction {
  id: 'stl' | 'step' | 'drawings' | 'pdf' | 'csv' | 'packet'
  label: string
  detail: string
}

export const MANUFACTURING_EXPORTS: readonly ManufacturingExportAction[] = [
  { id: 'stl', label: 'STL mesh', detail: 'Binary, world space, visible parts' },
  { id: 'step', label: 'STEP solids', detail: 'Named solids through OCCT' },
  { id: 'drawings', label: 'Shop drawings', detail: 'SVG and DXF per sheet' },
  { id: 'pdf', label: 'Shop PDF', detail: 'Printable drawing deck' },
  { id: 'csv', label: 'Cutting CSV', detail: 'Board, hardware and nesting lists' },
  { id: 'packet', label: 'Production ZIP', detail: 'Full packet with hashed manifest' },
] as const
