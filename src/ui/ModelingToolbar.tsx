import type { InteractionMode } from '../scene/useInteractionMode'
import { Button } from '@/components/ui/button'

/**
 * Refined horizontal modeling toolbar for the Workbench shell (S1).
 *
 * All actions call the same callbacks already wired into Sidebar — this is a
 * second, denser entry point, not a parallel state store. Mode names mirror the
 * real InteractionMode union and the authoritative keyboard map in
 * ui-redesign/DESIGN-SIGNOFF.md §6 (F/C/J/L/M/B/T). No prototype-only keys.
 */
interface ModelingToolbarProps {
  activeMode: InteractionMode
  onSetMode: (mode: InteractionMode) => void
  onAddPart: () => void
  onAddCabinet: () => void
  onFrameAll: () => void
  showGrid: boolean
  onToggleGrid: () => void
}

const JOINERY: { mode: InteractionMode; label: string; key: string }[] = [
  { mode: 'dado', label: 'Dado', key: 'J' },
  { mode: 'halflap', label: 'Half-lap', key: 'L' },
  { mode: 'mortiseTenon', label: 'Mortise & tenon', key: 'M' },
  { mode: 'finger', label: 'Finger', key: 'B' },
  { mode: 'tongueGroove', label: 'Tongue & groove', key: 'T' },
]

export function ModelingToolbar({
  activeMode,
  onSetMode,
  onAddPart,
  onAddCabinet,
  onFrameAll,
  showGrid,
  onToggleGrid,
}: ModelingToolbarProps) {
  const modeButton = (mode: InteractionMode, label: string, key: string) => (
    <button
      key={mode}
      type="button"
      className={`zim-tool ${activeMode === mode ? 'on' : ''}`}
      aria-pressed={activeMode === mode}
      title={`${label} (${key})`}
      onClick={() => onSetMode(mode)}
    >
      <span>{label}</span>
      <kbd>{key}</kbd>
    </button>
  )

  return (
    <div className="zim-toolbar" role="toolbar" aria-label="Modeling tools">
      <div className="zim-toolgroup">
        <span className="zim-glabel">Select</span>
        <button type="button" className="zim-tool" title="Frame all visible parts (Home)" onClick={onFrameAll}>
          <span>Frame</span>
          <kbd>Home</kbd>
        </button>
        <button
          type="button"
          className={`zim-tool ${showGrid ? 'on' : ''}`}
          aria-pressed={showGrid}
          title="Toggle grid"
          onClick={onToggleGrid}
        >
          <span>Grid</span>
        </button>
      </div>
      <div className="zim-toolgroup">
        <span className="zim-glabel">Modeling</span>
        <button type="button" className="zim-tool" title="Add a board part" onClick={onAddPart}>
          <span>Add Part</span>
        </button>
        {modeButton('snap', 'Snap', 'F')}
        {modeButton('cut', 'Cut', 'C')}
      </div>
      <div className="zim-toolgroup">
        <span className="zim-glabel">Joinery</span>
        {JOINERY.map((j) => modeButton(j.mode, j.label, j.key))}
      </div>
      <div className="zim-toolgroup">
        <span className="zim-glabel">Assembly</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[11px] px-2"
          title="Add cabinet component"
          aria-label="Add cabinet from toolbar"
          onClick={onAddCabinet}
        >
          + Cabinet
        </Button>
      </div>
    </div>
  )
}
