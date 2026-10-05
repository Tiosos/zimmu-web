import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type {
  CarcaseComponent,
  HardwareLibraryEntry,
  MaterialDef,
  Scene,
  Selection,
} from '../scene/types'
import { manufacturingParts } from '../scene/manufacturingPart'
import { manufacturingChecks } from '../scene/manufacturingChecks'
import { effectiveMaterialsOf } from '../scene/effectiveMaterials'
import { buildShelfReadiness, type ShelfReadinessRow } from '../scene/shelfReadiness'
import { buildProductionReadiness } from '../scene/productionReadiness'
import { ShelfInsertionPreview } from './ShelfInsertionPreview'
import { createReadinessSnapshot } from '../scene/readinessSnapshot'
import { buildReadinessPdf, readinessPdfFilename } from './buildReadinessPdf'
import { downloadBlob } from './download'
import { ReconciliationSection } from './ReconciliationSection'
import { reconcileScene } from './outputReconciliation'
import { buildProductionPacket, productionPacketFilename } from './buildProductionPacket'

const statusText: Record<ShelfReadinessRow['status'], string> = {
  straight: 'Straight insertion',
  rotated: 'Angled insertion required',
  unverified: 'No verified insertion route',
  unplaced: 'No valid shelf position generated',
  unassessed: 'Unable to assess',
}

const NO_LIBRARY: Record<string, MaterialDef> = {}

export function ManufacturingReadiness({
  scene,
  onClose,
  onOpenSheet,
  onInspect,
  projectName = 'Project',
  hardwareLibrary = {},
  materialLibrary = NO_LIBRARY,
}: {
  scene: Scene
  onClose: () => void
  onOpenSheet: (cabinet: CarcaseComponent, role: string) => void
  onInspect?: (selection: NonNullable<Selection>) => void
  projectName?: string
  hardwareLibrary?: Record<string, HardwareLibraryEntry>
  materialLibrary?: Record<string, MaterialDef>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [exporting, setExporting] = useState(false)
  const [packetExporting, setPacketExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportPdf = async () => {
    setExporting(true)
    setExportError(null)
    try {
      const snapshot = createReadinessSnapshot(scene, projectName, new Date(), materialLibrary)
      const bytes = await buildReadinessPdf(snapshot)
      downloadBlob(bytes as BlobPart, readinessPdfFilename(snapshot.projectName), 'application/pdf')
    } catch (error) {
      setExportError(
        `PDF export failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      )
    } finally {
      setExporting(false)
    }
  }
  const exportPacket = async () => {
    setPacketExporting(true)
    setExportError(null)
    try {
      const bytes = await buildProductionPacket({
        scene,
        projectName,
        hardwareLibrary,
        materialLibrary,
      })
      downloadBlob(bytes as BlobPart, productionPacketFilename(projectName), 'application/zip')
    } catch (error) {
      setExportError(
        `Packet export failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
      )
    } finally {
      setPacketExporting(false)
    }
  }
  const report = useMemo(() => buildShelfReadiness(scene), [scene])
  const production = useMemo(() => buildProductionReadiness(scene), [scene])
  const manufacturing = useMemo(
    () =>
      manufacturingChecks(
        manufacturingParts(
          scene.parts,
          effectiveMaterialsOf(materialLibrary, scene.materials),
          scene.components,
        ),
      ),
    [scene, materialLibrary],
  )
  const reconciliation = useMemo(
    () => reconcileScene(scene, materialLibrary),
    [scene, materialLibrary],
  )
  const sum = (field: 'requested' | 'generated' | 'missing' | 'angled' | 'unverified') => {
    let total = 0
    for (const entry of report) {
      const value = entry[field]
      if (value === null || !Number.isSafeInteger(total + value)) return 'unknown'
      total += value
    }
    return total
  }
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  return createPortal(
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      onCancel={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      className="m-auto w-[min(1050px,96vw)] max-h-[92vh] overflow-auto rounded-lg border border-border bg-background text-foreground p-5 backdrop:bg-black/70"
    >
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
        <h2 id={heading} className="font-semibold">
          Manufacturing readiness
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={exporting || packetExporting}
          onClick={() => void exportPdf()}
        >
          {exporting ? 'Preparing PDF…' : 'Export readiness PDF'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={exporting || packetExporting}
          onClick={() => void exportPacket()}
        >
          {packetExporting ? 'Preparing packet…' : 'Export production packet'}
        </Button>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close readiness report
        </Button>
      </div>
      {exportError && (
        <p role="alert" className="text-sm text-amber-300 mb-3">
          {exportError}
        </p>
      )}
      <p className="text-sm mb-2">
        Production checks for all cabinets and boards, including hidden items. Shelf counts refer to
        shelf boards in the current scene.
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Report-only: exports remain available. Checks cover cabinet parameters, material thickness,
        generated parts, joinery and shelf access. Hardware suitability, machining accuracy and
        physical installation still need review. A recorded joint does not certify its geometry.
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Production packet (ZIP): readiness PDF, shop drawings with available installation sheets,
        board/dowel/hardware CSVs, machining schedule CSV/JSON, manufacturing checks JSON, and a
        snapshot manifest. Includes hidden items. It is advisory and does not save a project
        revision.
      </p>
      <section aria-label="Production checks" className="border rounded p-3 mb-4">
        <h3 className="font-medium">Production checks</h3>
        <p className="text-sm mb-2">
          {production.findings.length} findings · {production.intentionalContacts ?? 'unknown'}{' '}
          intentional contacts · Joinery scan{' '}
          {production.joineryComplete ? 'complete' : 'incomplete'}
        </p>
        <p className="text-xs text-muted-foreground mb-2">
          Intentional contacts are not missing joints. Detached assemblies are not checked for
          generated-part completeness.
        </p>
        {production.findings.length === 0 && <p>No issues found by the completed checks.</p>}
        {production.findings.slice(0, 200).map((finding, i) => (
          <div key={i} className="border-t py-2 text-sm">
            <p>
              <strong>{finding.kind === 'unassessed' ? 'Not assessed' : finding.kind}:</strong>{' '}
              {finding.message}
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              {finding.targets.map((target) =>
                onInspect ? (
                  <Button
                    key={`${target.selection.kind}/${target.selection.id}`}
                    size="sm"
                    variant="outline"
                    onClick={() => onInspect(target.selection)}
                  >
                    Inspect {target.label}
                  </Button>
                ) : (
                  <span key={`${target.selection.kind}/${target.selection.id}`}>
                    {target.label}
                  </span>
                ),
              )}
            </div>
          </div>
        ))}
        {production.findings.length > 200 && (
          <p className="text-amber-300">
            Showing the first 200 findings. Resolve these and reopen the report to review the
            remaining findings.
          </p>
        )}
      </section>
      <section aria-label="Manufacturing record checks" className="border rounded p-3 mb-4">
        <h3 className="font-medium">Manufacturing record checks</h3>
        <p className="text-sm">
          {manufacturing.checkedParts} parts checked · {manufacturing.findings.length} findings
        </p>
        <p className="text-xs text-muted-foreground">
          Not assessed: {manufacturing.unassessed.join(', ')}.
        </p>
        {manufacturing.findings.length === 0 && <p>No issues found by these checks.</p>}
        {manufacturing.findings.slice(0, 200).map((finding) => (
          <div key={finding.reference} className="border-t py-2 text-sm">
            <p>
              <strong>
                {finding.reference} · {finding.code}:
              </strong>{' '}
              {finding.message}
            </p>
            {finding.operation && (
              <p className="text-xs text-muted-foreground">
                Cut {finding.operation.id} · {finding.operation.kind}
                {finding.operation.sourceComponentId &&
                  ` · Component ${finding.operation.sourceComponentId}`}
                {finding.operation.sourceJointId && ` · Joint ${finding.operation.sourceJointId}`}
              </p>
            )}
            {finding.targets.map((target) =>
              onInspect ? (
                <Button
                  key={target.id}
                  size="sm"
                  variant="outline"
                  onClick={() => onInspect({ kind: 'part', id: target.id })}
                >
                  Inspect {target.label || target.id}
                </Button>
              ) : (
                <p key={target.id}>
                  {target.label} [{target.id}]
                </p>
              ),
            )}
          </div>
        ))}
        {manufacturing.findings.length > 200 && (
          <p>Showing the first 200 findings. PDF and production packet include all findings.</p>
        )}
      </section>
      <ReconciliationSection result={reconciliation} onInspect={onInspect} />
      <h3 className="font-medium mb-2">Shelf access</h3>
      <p role="status" className="text-sm border rounded p-3 mb-4">
        {sum('requested')} requested · {sum('generated')} generated · {sum('missing')} missing ·{' '}
        {sum('unverified')} without a verified route · {sum('angled')} requiring angled insertion
      </p>
      {report.length === 0 && <p>No cabinets to assess.</p>}
      {report.map((entry) => (
        <section
          key={entry.cabinet.id}
          aria-label={entry.cabinet.label}
          className="border rounded p-3 mb-3"
        >
          <h3 className="font-medium">{entry.cabinet.label}</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-2">
            {entry.requested ?? 'unknown'} requested / {entry.generated} generated
          </p>
          {entry.issues.map((issue, i) => (
            <p key={i} className="text-sm text-amber-300">
              Unable to confirm readiness: {issue}
            </p>
          ))}
          {entry.shelves.length === 0 ? (
            <p className="text-sm">
              {entry.missing === null
                ? 'Shelf details unavailable: this cabinet was not assessed.'
                : 'No adjustable shelves requested.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">Shelf</th>
                    <th className="p-2">Generated</th>
                    <th className="p-2">Access</th>
                    <th className="p-2">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.shelves.map((shelf, i) => (
                    <tr key={shelf.role} className="border-b align-top">
                      <td className="p-2">
                        {i + 1}. {shelf.label}
                      </td>
                      <td className="p-2">
                        {shelf.generated ? (
                          'Yes'
                        ) : (
                          <span className="text-amber-300">No — omitted</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={shelf.status === 'straight' ? '' : 'text-amber-300'}>
                          {statusText[shelf.status]}
                        </span>
                        {!shelf.generated && shelf.access?.path && (
                          <p className="text-xs text-amber-300 mt-1">
                            Route verified, but its board is missing from the scene.
                          </p>
                        )}
                      </td>
                      <td className="p-2">
                        {shelf.access ? (
                          <div className="flex flex-wrap gap-2 items-center">
                            <ShelfInsertionPreview
                              results={[shelf.access]}
                              label={`${entry.cabinet.label} / ${shelf.label}`}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => onOpenSheet(entry.cabinet, shelf.role)}
                            >
                              Installation sheet
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No pose available for preview or sheet.
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </dialog>,
    document.body,
  )
}
