import { useState } from 'react'
import type { CarcaseComponent, Scene } from '../scene/types'
import type { LayoutPreview } from '../scene/layoutTools'
import type { RunFitPreview } from '../scene/runFit'
import { CabinetLayoutEditor } from './CabinetLayoutEditor'
import { RunFitEditor } from './RunFitEditor'
export function CabinetLayoutWorkspace({
  cabinet,
  scene,
  onApply,
  onFit,
}: {
  cabinet: CarcaseComponent
  scene: Scene
  onApply: (preview: LayoutPreview) => boolean
  onFit?: (preview: RunFitPreview) => boolean
}) {
  const [mode, setMode] = useState('layout')
  return (
    <div className="space-y-3">
      <label className="text-xs">
        Layout workspace
        <select
          aria-label="Layout workspace"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="border rounded ml-2"
        >
          <option value="layout">Arrange cabinets</option>
          <option value="fit" disabled={!onFit}>
            Fit cabinet run
          </option>
        </select>
      </label>
      {mode === 'fit' && onFit ? (
        <RunFitEditor cabinet={cabinet} scene={scene} onApply={onFit} />
      ) : (
        <CabinetLayoutEditor cabinet={cabinet} scene={scene} onApply={onApply} />
      )}
    </div>
  )
}
