import type { InteractionMode } from '../scene/useInteractionMode'

interface WorkbenchStatusBarProps {
  occtReady: boolean
  partCount: number
  jointCount: number
  activeMode: InteractionMode
  dirty: boolean
  coords?: string
  scale?: string
}

const MODE_LABEL: Record<InteractionMode, string> = {
  none: 'Select (V)',
  snap: 'Snap (F)',
  cut: 'Cut (C)',
  dado: 'Dado (J)',
  halflap: 'Half-lap (L)',
  mortiseTenon: 'Mortise & tenon (M)',
  finger: 'Finger joint (B)',
  tongueGroove: 'Tongue & groove (T)',
}

/**
 * Bottom status strip for the Workbench shell. `none` keeps the inherited
 * legacy label "Select (V)" to preserve existing test expectations while the
 * authoritative shortcut map (DESIGN-SIGNOFF.md §6) plans its own replacement.
 */
export function WorkbenchStatusBar({
  occtReady,
  partCount,
  jointCount,
  activeMode,
  dirty,
  coords = 'X —  Y —  Z —',
  scale = 'Scale 1:20',
}: WorkbenchStatusBarProps) {
  return (
    <div className="zim-statusbar" aria-label="Workbench status">
      <span className="zim-s">
        <span className={`zim-sdot ${occtReady ? 'green' : 'amber'}`} aria-hidden="true" />
        {occtReady ? 'OCCT Ready' : 'OCCT Loading'}
      </span>
      <span className="zim-s">
        {partCount} parts · {jointCount} joints
      </span>
      <span className="zim-s">Mode: {MODE_LABEL[activeMode]}</span>
      <span className="zim-sp" />
      <span className="zim-s">{coords}</span>
      <span className="zim-s">{scale}</span>
      <span className="zim-s">{dirty ? '● Unsaved' : '● Auto-saved'}</span>
    </div>
  )
}
