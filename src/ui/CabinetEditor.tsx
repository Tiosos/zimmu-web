import { Button } from '@/components/ui/button'
import { buildDrawingSheets } from '../geom/drawing'
import { CabinetProjection } from './CabinetProjection'
import { SectionElevation } from './SectionElevation'
import { SectionToolbar } from './SectionToolbar'
import { buildDxf } from './buildDxf'
import { buildSvg } from './buildSvg'
import { downloadBlob } from './download'
import { sheetFilename } from './sheetFilename'
import type {
  CarcaseComponent,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
  SectionId,
} from '../scene/types'

// The cabinet edit level: selecting a cabinet turns the main pane into its editor. The tabs are the
// ones a cabinet is actually described by — its elevation, its projections, and the model itself.
//
// 3D is a tab rather than a separate mode because the viewport *is* one of the ways to look at a
// cabinet. It is hidden rather than unmounted, which is why this component renders nothing for it:
// `viewport.tsx` builds its renderer, camera and every mesh in a mount-once effect, so swapping it
// out on a tab change would tear all of that down and rebuild it. `App` owns the showing.
const TABS = ['section', 'front', 'top', 'end', '3d'] as const
export type CabinetTab = (typeof TABS)[number]

const LABELS: Record<CabinetTab, string> = {
  section: 'Section',
  front: 'Front',
  top: 'Top',
  end: 'End',
  '3d': '3D',
}

export function CabinetEditor({
  component,
  materials,
  tab,
  onTabChange,
  selectedSectionId,
  onSelectSection,
  onUpdate,
  parts,
  byId,
  selectedPartId,
  onSelectPart,
  projectName,
}: {
  component: CarcaseComponent
  materials: Record<string, MaterialDef>
  tab: CabinetTab
  onTabChange: (t: CabinetTab) => void
  selectedSectionId: SectionId | null
  onSelectSection: (id: SectionId | null) => void
  onUpdate: (updater: (c: Component) => Component) => void
  parts: Part[]
  byId: Map<ComponentId, Component>
  selectedPartId: PartId | null
  onSelectPart: (id: PartId) => void
  projectName: string
}) {
  // The same sheet object the drawings deck would show, built from the same projector this pane
  // reads, so the two export paths cannot produce different files for the same cabinet.
  const exportSheet = (ext: 'svg' | 'dxf') => {
    const [, sheet] = buildDrawingSheets([], projectName, [
      { cabinet: component, parts, materials, byId },
    ])
    downloadBlob(
      ext === 'svg' ? buildSvg(sheet) : buildDxf(sheet),
      sheetFilename(sheet, projectName, ext),
      ext === 'svg' ? 'image/svg+xml' : 'application/dxf',
    )
  }

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col bg-background">
      <div className="flex items-center border-b border-border px-2 shrink-0">
        <span className="text-xs font-medium text-foreground mr-4 py-2">{component.label}</span>
        <div role="tablist" className="flex">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTabChange(t)}
              className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* A projection is a drawing, so it can be exported as one. Section is an editor and 3D is
          the viewport; neither is what `buildDrawingSheets` would put on a sheet. */}
      {tab !== '3d' && tab !== 'section' && (
        <div className="flex gap-2 px-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => exportSheet('svg')}>
            SVG
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportSheet('dxf')}>
            DXF
          </Button>
        </div>
      )}

      {/* Nothing for 3D: the viewport is behind this component, shown by App. A panel here would
          cover it. */}
      {tab !== '3d' && (
        <div data-testid="cabinet-editor-panel" className="flex-1 min-h-0 overflow-auto p-3">
          {tab === 'section' ? (
            <div className="h-full flex gap-3 min-h-0">
              <div className="flex-1 min-w-0">
                <SectionElevation
                  params={component.params}
                  materials={materials}
                  parts={parts}
                  componentId={component.id}
                  selected={selectedSectionId}
                  onSelect={onSelectSection}
                />
              </div>
              <SectionToolbar
                params={component.params}
                selected={selectedSectionId}
                onUpdate={onUpdate}
              />
            </div>
          ) : (
            <CabinetProjection
              view={LABELS[tab] as 'Front' | 'Top' | 'End'}
              parts={parts}
              byId={byId}
              cabinet={component}
              materials={materials}
              selectedId={selectedPartId}
              onSelect={onSelectPart}
            />
          )}
        </div>
      )}
    </div>
  )
}
