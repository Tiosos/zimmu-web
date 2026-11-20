import type { CabinetTab } from './CabinetEditor'

/**
 * The four structural groups of the sixteen cabinet tabs (S2 shell). The order here is a
 * presentation of the same `CabinetTab` union the real CabinetEditor owns — it is not a second
 * source of truth. FR-CE-01…16 pin both the membership and the order.
 *
 * Kept in its own module so CabinetGroupNav.tsx exports components only (react-refresh).
 */
export const CABINET_TAB_GROUPS: { group: string; tabs: { id: CabinetTab; label: string; icon: string }[] }[] = [
  {
    group: 'Structure',
    tabs: [
      { id: 'section', label: 'Section', icon: '▤' },
      { id: 'construction', label: 'Construction', icon: '▦' },
      { id: 'placement', label: 'Placement', icon: '✥' },
      { id: 'layout', label: 'Layout', icon: '⊞' },
    ],
  },
  {
    group: 'Appearance',
    tabs: [
      { id: 'finishing', label: 'Finishing', icon: '◐' },
      { id: 'fronts', label: 'Fronts & Drawers', icon: '▥' },
      { id: 'interiors', label: 'Shelves & Interiors', icon: '☷' },
      { id: 'materials', label: 'Materials', icon: '◈' },
      { id: 'edgebanding', label: 'Edgebanding', icon: '▭' },
    ],
  },
  {
    group: 'Services',
    tabs: [
      { id: 'appliances', label: 'Appliance Bays', icon: '▣' },
      { id: 'services', label: 'Service Openings', icon: '⌁' },
      { id: 'hardware', label: 'Hardware', icon: '⚙' },
    ],
  },
  {
    group: 'Views',
    tabs: [
      { id: 'front', label: 'Front', icon: '▯' },
      { id: 'top', label: 'Top', icon: '▱' },
      { id: 'end', label: 'End', icon: '▰' },
      { id: '3d', label: '3D', icon: '◆' },
    ],
  },
]

/** A flat, ordered list of all sixteen tabs — used by the footer counter and by tests. */
export const ALL_CABINET_TABS: CabinetTab[] = CABINET_TAB_GROUPS.flatMap((g) => g.tabs.map((t) => t.id))
