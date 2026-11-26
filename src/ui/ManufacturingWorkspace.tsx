import { useEffect, useMemo, useState } from 'react'
import type { DrawingSheet } from '../geom/drawing'
import { buildDrawingSheets } from '../geom/drawing'
import { componentsById, isNodeVisible } from '../scene/componentTree'
import type { ProjectStructure } from '../scene/projectStructure'
import {
  isReadable,
  sha256Hex,
  type ProductionRelease,
  type ReleaseEntry,
  type ReleaseIntegrity,
} from '../scene/releases'
import type {
  ComponentId,
  HardwareLibraryEntry,
  MaterialDef,
  PartId,
  Scene,
  Selection,
} from '../scene/types'
import { REVIEW_STATUS_LABELS, type ReviewItem } from '../scene/productionReview'
import { drawingDeckInputs } from './drawingDeckInputs'
import { buildSvg } from './buildSvg'
import { buildDxf } from './buildDxf'
import { sheetFilename } from './sheetFilename'
import { downloadBlob } from './download'
import { captureProductionSource } from './captureProductionSource'
import { useProductionReview } from './useProductionReview'
import {
  MANUFACTURING_EXPORTS,
  MANUFACTURING_WORKFLOWS,
  type ManufacturingExportAction,
  type ManufacturingWorkflowId,
} from './manufacturingWorkflowData'

const FINGERPRINT_DELAY_MS = 400

type Tone = 'green' | 'amber' | 'red' | 'cyan'

export interface ManufacturingWorkspaceProps {
  scene: Scene
  project: ProjectStructure
  projectName: string
  materialLibrary: Record<string, MaterialDef>
  hardwareLibrary: Record<string, HardwareLibraryEntry>
  releases: readonly ReleaseEntry[]
  integrity: readonly ReleaseIntegrity[] | null
  onOpenBom: () => void
  onOpenReadiness: () => void
  onOpenDrawings: () => void
  onExportPacket: () => void
  onOpenComparison: () => void
  onOpenChangeReview: () => void
  onVerifyPacket: () => void
  onExportStl: () => void
  onExportStep: () => void
  onInspect: (selection: NonNullable<Selection>) => void
}

function sheetLabel(sheet: DrawingSheet, sheets: readonly DrawingSheet[]): string {
  switch (sheet.kind) {
    case 'cover':
      return 'Cover sheet'
    case 'assembly':
      return `Assembly — ${sheet.cabinetLabel}`
    case 'elevation':
      return `Elevation — ${sheet.roomName} / ${sheet.wallName}`
    case 'installation':
      return `Installation — ${sheet.cabinetLabel} / ${sheet.shelfLabel}`
    default: {
      const partSheets = sheets.filter((s) => s.kind === 'part')
      return `Part ${partSheets.indexOf(sheet) + 1} of ${partSheets.length} — ${sheet.partLabel}`
    }
  }
}

function ReviewRow({
  item,
  onInspect,
}: {
  item: ReviewItem
  onInspect: (selection: NonNullable<Selection>) => void
}) {
  const tone: Tone =
    item.category === 'needs-correction'
      ? 'red'
      : item.category === 'advisory'
        ? 'amber'
        : 'cyan'
  const target = item.targets[0]
  return (
    <div className="zim-mfg-issue">
      <span className={`zim-sdot ${tone}`} aria-hidden="true" />
      <span className="zim-mfg-issue-body">
        <strong>{item.message}</strong>
        <small>
          {item.source} · {item.sourceReferences[0] ?? item.reference}
        </small>
      </span>
      {target && (
        <button
          type="button"
          className="zim-mfg-link"
          aria-label={`Locate ${target.label} from readiness review`}
          onClick={() =>
            onInspect(
              target.kind === 'part'
                ? { kind: 'part', id: target.id as PartId }
                : { kind: 'component', id: target.id as ComponentId },
            )
          }
        >
          Locate
        </button>
      )}
    </div>
  )
}

/**
 * S4 shell (DESIGN-SIGNOFF.md §7). Every card opens an existing, real workflow: the BOM dialog,
 * the readiness report, the drawing viewer, an actual packet download, packet comparison, the
 * recorded-release review, packet verification, or the export action list below. Nothing here
 * claims approval — readiness findings stay visible and verification stays a separate check.
 */
export function ManufacturingWorkspace({
  scene,
  project,
  projectName,
  materialLibrary,
  hardwareLibrary,
  releases,
  integrity,
  onOpenBom,
  onOpenReadiness,
  onOpenDrawings,
  onExportPacket,
  onOpenComparison,
  onOpenChangeReview,
  onVerifyPacket,
  onExportStl,
  onExportStep,
  onInspect,
}: ManufacturingWorkspaceProps) {
  const [exportsOpen, setExportsOpen] = useState(false)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [sourceFingerprint, setSourceFingerprint] = useState<{
    scene: Scene
    projectName: string
    hardwareLibrary: Record<string, HardwareLibraryEntry>
    materialLibrary: Record<string, MaterialDef>
    hash: string
  } | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const { review } = useProductionReview(scene, materialLibrary)
  const byId = useMemo(() => componentsById(scene.components), [scene.components])

  const sheets = useMemo(() => {
    const visible = scene.parts.filter((part) => isNodeVisible(part, byId))
    const { cabinets, rooms } = drawingDeckInputs(scene, project, byId)
    return buildDrawingSheets(visible, projectName, cabinets, undefined, undefined, rooms, {
      materials: scene.materials,
      byId,
    })
  }, [scene, project, projectName, byId])

  const sheet = sheets[Math.min(sheetIndex, sheets.length - 1)] ?? null
  const sheetMarkup = useMemo(() => (sheet === null ? '' : buildSvg(sheet)), [sheet])

  const latest = useMemo(() => {
    const readable = releases.flatMap((entry, index) =>
      isReadable(entry) ? [{ entry, index }] : [],
    )
    return readable.reduce<
      { entry: ProductionRelease; index: number } | undefined
    >((best, current) => (!best || current.entry.revision > best.entry.revision ? current : best), undefined)
  }, [releases])
  const baseline: ProductionRelease | null =
    latest && integrity?.[latest.index] === 'ok' ? latest.entry : null
  // The capture is asynchronous, so a stale result must never be shown as this scene's hash.
  // Matching the inputs by identity keeps the displayed value honest without resetting state in
  // an effect (which React's hooks rules disallow).
  const sourceSha =
    sourceFingerprint !== null &&
    sourceFingerprint.scene === scene &&
    sourceFingerprint.projectName === projectName &&
    sourceFingerprint.hardwareLibrary === hardwareLibrary &&
    sourceFingerprint.materialLibrary === materialLibrary
      ? sourceFingerprint.hash
      : null
  const baselineMatched = baseline !== null && sourceSha !== null && sourceSha === baseline.sourceSha256

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const source = captureProductionSource({
            scene,
            projectName,
            hardwareLibrary,
            materialLibrary,
          })
          const hash = await sha256Hex(source)
          if (active)
            setSourceFingerprint({ scene, projectName, hardwareLibrary, materialLibrary, hash })
        } catch {
          if (active)
            setSourceFingerprint({ scene, projectName, hardwareLibrary, materialLibrary, hash: '' })
        }
      })()
    }, FINGERPRINT_DELAY_MS)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [scene, projectName, hardwareLibrary, materialLibrary])

  const cardState: Record<ManufacturingWorkflowId, { label: string; tone: Tone }> = {
    cuttingList: { label: `${scene.parts.length} parts`, tone: 'cyan' },
    readiness: {
      label: review.counts.needsCorrection
        ? `${review.counts.needsCorrection} to fix`
        : review.counts.unassessed > 0
          ? 'Review'
          : 'Clear',
      tone:
        review.counts.needsCorrection > 0
          ? 'red'
          : review.counts.unassessed > 0
            ? 'amber'
            : 'green',
    },
    drawings: { label: `${sheets.length} sheets`, tone: 'cyan' },
    packet: { label: scene.parts.length > 0 ? 'Ready to build' : 'No parts', tone: scene.parts.length > 0 ? 'green' : 'amber' },
    comparison: {
      label: baseline === null ? 'No verified release' : `Revision ${baseline.revision}`,
      tone: baseline === null ? 'amber' : 'green',
    },
    changeReview: {
      label: baseline === null ? 'Needs release' : baselineMatched ? 'No changes' : 'Unreleased changes',
      tone: baseline === null ? 'amber' : baselineMatched ? 'green' : 'amber',
    },
    verify: { label: 'Local check', tone: 'cyan' },
    exports: { label: `${MANUFACTURING_EXPORTS.length} formats`, tone: 'cyan' },
  }

  const openCard = (id: ManufacturingWorkflowId) => {
    switch (id) {
      case 'cuttingList':
        onOpenBom()
        break
      case 'readiness':
        onOpenReadiness()
        break
      case 'drawings':
        onOpenDrawings()
        break
      case 'packet':
        onExportPacket()
        break
      case 'comparison':
        onOpenComparison()
        break
      case 'changeReview':
        onOpenChangeReview()
        break
      case 'verify':
        onVerifyPacket()
        break
      case 'exports':
        setExportsOpen((open) => !open)
        break
    }
  }

  const runExport = (id: ManufacturingExportAction['id']) => {
    switch (id) {
      case 'stl':
        onExportStl()
        break
      case 'step':
        onExportStep()
        break
      case 'drawings':
        onOpenDrawings()
        break
      case 'pdf':
        void (async () => {
          setPdfBusy(true)
          setPdfError(null)
          try {
            const { buildPdf } = await import('./buildPdf')
            const bytes = await buildPdf(sheets)
            downloadBlob(
              bytes as BlobPart,
              `${projectName}-drawings.pdf`,
              'application/pdf',
            )
          } catch (error) {
            setPdfError(
              `PDF export failed: ${error instanceof Error ? error.message : 'Unknown error'}.`,
            )
          } finally {
            setPdfBusy(false)
          }
        })()
        break
      case 'csv':
        onOpenBom()
        break
      case 'packet':
        onExportPacket()
        break
    }
  }

  return (
    <section className="zim-mfg" aria-label="Manufacturing workspace">
      <header className="zim-mfg-head">
        <div>
          <span className="zim-mfg-eyebrow">PERSPECTIVE 04 / FABRICATION</span>
          <h1>Manufacturing</h1>
          <p>
            Review readiness, generate shop drawings, build a production packet and verify what
            leaves the workshop.
          </p>
        </div>
        <div className="zim-mfg-headstats" aria-label="Manufacturing headline counts">
          <span>
            <b>{scene.parts.length}</b> parts
          </span>
          <span>
            <b>{sheets.length}</b> drawing sheets
          </span>
          <span>
            <b>{review.items.length}</b> review items
          </span>
        </div>
      </header>

      <div className="zim-mfg-scroll">
        <div className="zim-mfg-section-head">
          <h2>Production workflow</h2>
          <span>{MANUFACTURING_WORKFLOWS.length} workflows</span>
        </div>
        <div className="zim-mfg-grid" aria-label="Manufacturing workflow cards">
          {MANUFACTURING_WORKFLOWS.map((card) => {
            const state = cardState[card.id]
            return (
              <button
                key={card.id}
                type="button"
                className={`zim-mfg-card ${card.id === 'exports' && exportsOpen ? 'on' : ''}`}
                aria-label={`Open ${card.title} workflow`}
                aria-expanded={card.id === 'exports' ? exportsOpen : undefined}
                onClick={() => openCard(card.id)}
              >
                <span className="zim-mfg-card-top">
                  <span className="zim-mfg-card-icon" aria-hidden="true">
                    {card.icon}
                  </span>
                  <span className={`zim-mfg-badge ${state.tone}`}>{state.label}</span>
                </span>
                <strong>{card.title}</strong>
                <span className="zim-mfg-card-desc">{card.description}</span>
                <span className="zim-mfg-card-foot">
                  {card.group} <span aria-hidden="true">→</span>
                </span>
              </button>
            )
          })}
        </div>

        {exportsOpen && (
          <section className="zim-mfg-exports" aria-label="Export formats">
            <div className="zim-mfg-section-head">
              <h2>Export formats</h2>
              <span>Visible parts for mesh and CAD; ZIP includes the manifest</span>
            </div>
            <div className="zim-mfg-export-grid">
              {MANUFACTURING_EXPORTS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="zim-mfg-export"
                  aria-label={`Export ${action.label}`}
                  disabled={action.id === 'pdf' && pdfBusy}
                  onClick={() => runExport(action.id)}
                >
                  <strong>{action.label}</strong>
                  <span>{action.detail}</span>
                </button>
              ))}
            </div>
            {pdfError && <p role="alert" className="zim-mfg-error">{pdfError}</p>}
          </section>
        )}

        <div className="zim-mfg-panels">
          <section className="zim-mfg-panel" aria-label="Readiness review summary">
            <div className="zim-mfg-panel-head">
              <h2>Readiness review</h2>
              <span className={`zim-mfg-badge ${review.counts.needsCorrection ? 'red' : review.counts.unassessed ? 'amber' : 'green'}`}>
                {REVIEW_STATUS_LABELS[review.status]}
              </span>
            </div>
            <div className="zim-mfg-kpis">
              <span><b>{review.counts.needsCorrection}</b> corrections</span>
              <span><b>{review.counts.advisory}</b> advisories</span>
              <span><b>{review.counts.unassessed}</b> unassessed</span>
            </div>
            <div className="zim-mfg-issues">
              {review.items.slice(0, 4).map((item) => (
                <ReviewRow key={item.reference} item={item} onInspect={onInspect} />
              ))}
              {review.items.length === 0 && (
                <p className="zim-mfg-empty">No findings reported by the completed checks.</p>
              )}
            </div>
            <p className="zim-mfg-note">
              Findings are advisory. Exports remain available regardless of readiness status.
            </p>
            <button type="button" className="zim-mfg-cta" onClick={onOpenReadiness}>
              Open full readiness review
            </button>
          </section>

          <section className="zim-mfg-panel" aria-label="Shop drawing deck">
            <div className="zim-mfg-panel-head">
              <h2>Shop drawings</h2>
              <span className="zim-mfg-badge cyan">{sheets.length} sheets</span>
            </div>
            <div className="zim-mfg-drawings">
              <div className="zim-mfg-sheet-list" aria-label="Drawing sheet list">
                {sheets.slice(0, 20).map((entry, index) => (
                  <button
                    key={`${entry.kind}/${index}`}
                    type="button"
                    className={index === Math.min(sheetIndex, sheets.length - 1) ? 'on' : ''}
                    aria-label={`Show drawing sheet ${index + 1}`}
                    onClick={() => setSheetIndex(index)}
                  >
                    {sheetLabel(entry, sheets)}
                  </button>
                ))}
                {sheets.length === 0 && (
                  <p className="zim-mfg-empty">Add a part to build a drawing deck.</p>
                )}
                {sheets.length > 20 && (
                  <p className="zim-mfg-empty">Showing the first 20 of {sheets.length} sheets.</p>
                )}
              </div>
              <div className="zim-mfg-sheet-preview">
                {sheet === null ? (
                  <p className="zim-mfg-empty">No sheet selected.</p>
                ) : (
                  <>
                    <div
                      className="zim-mfg-svg"
                      aria-label={`Preview of ${sheetLabel(sheet, sheets)}`}
                      dangerouslySetInnerHTML={{ __html: sheetMarkup }}
                    />
                    <div className="zim-mfg-sheet-actions">
                      <button
                        type="button"
                        className="zim-mfg-link"
                        onClick={() =>
                          downloadBlob(
                            buildSvg(sheet),
                            sheetFilename(sheet, projectName, 'svg'),
                            'image/svg+xml',
                          )
                        }
                      >
                        Download sheet SVG
                      </button>
                      <button
                        type="button"
                        className="zim-mfg-link"
                        onClick={() =>
                          downloadBlob(
                            buildDxf(sheet),
                            sheetFilename(sheet, projectName, 'dxf'),
                            'application/dxf',
                          )
                        }
                      >
                        Download sheet DXF
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
            <button type="button" className="zim-mfg-cta" onClick={onOpenDrawings}>
              Open full drawing viewer
            </button>
          </section>

          <section className="zim-mfg-panel" aria-label="Production packet validation">
            <div className="zim-mfg-panel-head">
              <h2>Packet validation</h2>
              <span className={`zim-mfg-badge ${baseline === null ? 'amber' : 'green'}`}>
                {baseline === null ? 'No baseline' : `REV ${baseline.revision}`}
              </span>
            </div>
            <div className="zim-mfg-checks">
              <div><span>Drawing pages indexed</span><b>{sheets.length}</b></div>
              <div><span>Review items recorded</span><b>{review.items.length}</b></div>
              <div>
                <span>Manifest source SHA-256</span>
                <b className="zim-mfg-hash">
                  {sourceSha === null
                    ? 'Capturing…'
                    : sourceSha === ''
                      ? 'Unavailable'
                      : `${sourceSha.slice(0, 16)}…`}
                </b>
              </div>
              <div>
                <span>Recorded baseline</span>
                <b>
                  {baseline === null
                    ? 'None verified'
                    : baselineMatched
                      ? `Matches REV ${baseline.revision}`
                      : `Changes since REV ${baseline.revision}`}
                </b>
              </div>
            </div>
            <p className="zim-mfg-note">
              Build a packet, download it, then verify the ZIP here. Integrity checks confirm that
              the packet matches its own manifest; they do not approve the design for fabrication.
            </p>
            <div className="zim-mfg-actions">
              <button type="button" className="zim-mfg-cta" onClick={onExportPacket}>
                Build production packet
              </button>
              <button type="button" className="zim-mfg-cta ghost" onClick={onVerifyPacket}>
                Verify a downloaded packet
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}
