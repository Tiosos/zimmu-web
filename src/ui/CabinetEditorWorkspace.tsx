import { useState, type ReactNode } from 'react'
import type {
  CarcaseComponent,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
  SectionId,
} from '../scene/types'
import { CabinetProjection } from './CabinetProjection'
import { SectionElevation } from './SectionElevation'
import { CabinetGroupNav } from './CabinetGroupNav'
import { ALL_CABINET_TABS } from './cabinetTabGroups'
import type { CabinetTab } from './CabinetEditor'

type ViewMode = 'Front' | 'Top' | 'End' | 'Section' | 'Exploded'
const VIEW_MODES: ViewMode[] = ['Front', 'Top', 'End', 'Section', 'Exploded']

/**
 * S2 shell around the real CabinetEditor. It owns no scene data and re-implements no parameter
 * control: the `children` element is the existing CabinetEditor with all its callbacks, and the
 * right-hand preview is derived from that same scene (FR-CE-17). `viewMode` is local, reversible
 * display state only — an exploded/section preview is never written back to the file (FR-CE-18) —
 * and the footer reports the live sync state (FR-CE-19).
 */
export function CabinetEditorWorkspace({
  tab,
  onTabChange,
  children,
  preview,
}: {
  tab: CabinetTab
  onTabChange: (t: CabinetTab) => void
  children: ReactNode
  preview: {
    cabinet: CarcaseComponent
    parts: Part[]
    byId: Map<ComponentId, Component>
    materials: Record<string, MaterialDef>
    selectedPartId: PartId | null
    onSelectPart: (id: PartId) => void
    selectedSectionId: SectionId | null
    onSelectSection: (id: SectionId | null) => void
  }
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('Front')
  const position = ALL_CABINET_TABS.indexOf(tab) + 1
  const { cabinet, parts, byId, materials, selectedPartId, onSelectPart, selectedSectionId, onSelectSection } = preview

  const projectionView = viewMode === 'Top' || viewMode === 'End' ? viewMode : 'Front'
  const isExploded = viewMode === 'Exploded'

  return (
    <section className="zim-cep" aria-label="Cabinet editor workspace">
      <div className="zim-cep-head">
        <span className="zim-cep-cab">
          <span aria-hidden="true">▦</span>
          <span>{cabinet.label}</span>
        </span>
        <span className="zim-cep-idx" aria-label={`Tab ${position} of 16`}>
          {tab} · {position} / 16
        </span>
        <span className="zim-cep-sp" />
        <div className="zim-cep-views" role="group" aria-label="Preview mode">
          {VIEW_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={`zim-cep-view ${viewMode === m ? 'on' : ''}`}
              aria-pressed={viewMode === m}
              onClick={() => setViewMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="zim-cep-readonly" title="Preview is derived from scene data and is never saved">
          read-only
        </span>
      </div>

      <div className="zim-cep-body">
        <CabinetGroupNav active={tab} onTabChange={onTabChange} />
        <div className="zim-cep-editor">{children}</div>
        <aside className="zim-cep-preview" aria-label="Live cabinet preview">
          <div className="zim-cep-ptitle">
            Live preview
            <span className="zim-cep-pmode">{viewMode}</span>
          </div>
          <div className={`zim-cep-pstage ${isExploded ? 'exploded' : ''}`}>
            {viewMode === 'Section' ? (
              <SectionElevation
                params={cabinet.params}
                materials={materials}
                parts={parts}
                componentId={cabinet.id}
                selected={selectedSectionId}
                onSelect={onSelectSection}
              />
            ) : (
              <CabinetProjection
                view={projectionView}
                parts={parts}
                byId={byId}
                cabinet={cabinet}
                materials={materials}
                selectedId={selectedPartId}
                onSelect={onSelectPart}
              />
            )}
          </div>
          {isExploded && (
            <p className="zim-cep-pnote">
              Exploded display — preview only, reversible, not written to the file.
            </p>
          )}
          <div className="zim-cep-pdims">
            {cabinet.params.width} × {cabinet.params.depth} × {cabinet.params.height} mm
          </div>
        </aside>
      </div>

      <div className="zim-cep-foot" role="status">
        <span className="zim-sdot green" aria-hidden="true" />
        <span>Geometry in sync</span>
        <span className="zim-cep-sep">·</span>
        <span>{parts.length} parts</span>
        <span className="zim-sp" />
        <span>{tab} · {position} / 16</span>
        <span className="zim-cep-sep">·</span>
        <span>view: {viewMode.toLowerCase()}</span>
      </div>
    </section>
  )
}
