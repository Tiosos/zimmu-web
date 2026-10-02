import type { ImpactPricing } from './ruleImpact'
import { useState } from 'react'
import { previewCatalogueUpdate, type RulePreview } from '../scene/ruleFlow'
import { RulePreviewDetails } from './CabinetRulesPanel'
import { RULE_LABELS } from './ruleLabels'
import type { RuleKey } from '../scene/constructionRules'
import { Button } from '@/components/ui/button'
import { buildDrawingSheets } from '../geom/drawing'
import { CabinetProjection } from './CabinetProjection'
import { SectionElevation } from './SectionElevation'
import { SectionToolbar } from './SectionToolbar'
import { buildDxf } from './buildDxf'
import { buildSvg } from './buildSvg'
import { downloadBlob } from './download'
import { sheetFilename } from './sheetFilename'
import { catalogueDefinitions, catalogueDefinition, catalogueSources } from '../scene/catalogue'
import type {
  CarcaseComponent,
  Component,
  ComponentId,
  MaterialDef,
  Part,
  PartId,
  SectionId,
  Scene,
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
  scene,
  onApplyRulePreview,
  library,
  hardwareLibrary,
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
  scene?: Scene
  onApplyRulePreview?: (preview: RulePreview) => boolean
} & ImpactPricing) {
  const definition = component.catalogue && catalogueDefinition(component.catalogue.id, component.catalogue.version, scene?.companyCatalogues)
  const sources = catalogueSources(component, scene?.cabinetRules, scene?.companyCatalogues)
  const [version, setVersion] = useState(component.catalogue?.version ?? 1)
  const [preview, setPreview] = useState<RulePreview | null>(null)
  const [updateError, setUpdateError] = useState('')
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
        {component.catalogue && (
          <details className="text-xs text-muted-foreground mr-4 relative">
            <summary className="cursor-pointer">
              {definition ? `${definition.name} v${definition.catalogueVersion}` :
                `Catalogue ${component.catalogue.id} v${component.catalogue.version} unavailable`}
              {definition && Object.values(sources).includes('item') ? ' · item overrides' : ''}
            </summary>
            <div className={`z-20 bg-background border border-border rounded p-3 overflow-auto shadow-md ${preview ? 'fixed inset-x-4 top-24 mx-auto max-w-3xl max-h-[min(70vh,calc(100dvh-7rem))]' : 'absolute max-h-64 min-w-44'}`}>
              {definition && Object.keys(sources).length ? Object.entries(sources).map(([key, source]) =>
                <div key={key}>{RULE_LABELS[key as RuleKey] ?? key}: {{ item: 'Item override', catalogue: 'Catalogue', company: 'Company', project: 'Project' }[source]}</div>) :
                'Saved cabinet geometry is preserved; the catalogue or company rule version cannot be resolved.'}
              {scene && onApplyRulePreview && <div className="space-y-2 mt-2 border-t pt-2">
                {definition?.companyLabel && <p>Pinned company rules: {definition.companyLabel}</p>}
                <label>Installed version <select aria-label="Catalogue update version" value={version}
                  onChange={(event) => { setVersion(Number(event.target.value)); setPreview(null); setUpdateError('') }}>
                  {catalogueDefinitions(scene?.companyCatalogues).filter((entry) => entry.catalogueId === component.catalogue?.id).map((entry) =>
                    <option key={entry.catalogueVersion} value={entry.catalogueVersion}>v{entry.catalogueVersion}</option>)}
                </select></label>
                <p>{definition?.companyLabel ? 'Company publication records' : 'Starter examples'}. Preview before accepting an installed version.</p>
                <Button size="sm" variant="outline" onClick={() => { setPreview(previewCatalogueUpdate(scene, component.id, version)); setUpdateError('') }}>Preview catalogue update</Button>
                {preview && <><Button size="sm" variant="outline" onClick={() => { setPreview(null); setUpdateError('') }}>Close impact review</Button><RulePreviewDetails preview={preview} library={library} hardwareLibrary={hardwareLibrary} />
                  <Button size="sm" disabled={preview.errors.length > 0} onClick={() => {
                    if (onApplyRulePreview(preview)) { setPreview(null); setUpdateError('') }
                    else setUpdateError('The design changed after preview. Preview again before applying.')
                  }}>Apply catalogue update</Button></>}
                {updateError && <p role="alert">{updateError}</p>}
              </div>}

            </div>
          </details>
        )}
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
