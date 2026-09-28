import { useEffect, useId, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { CarcaseComponent, Scene } from '../scene/types'
import { buildShelfReadiness, type ShelfReadinessRow } from '../scene/shelfReadiness'
import { ShelfInsertionPreview } from './ShelfInsertionPreview'

const statusText: Record<ShelfReadinessRow['status'], string> = {
  straight: 'Straight insertion',
  rotated: 'Angled insertion required',
  unverified: 'No verified insertion route',
  unplaced: 'No valid shelf position generated',
  unassessed: 'Unable to assess',
}

export function ManufacturingReadiness({
  scene,
  onClose,
  onOpenSheet,
}: {
  scene: Scene
  onClose: () => void
  onOpenSheet: (cabinet: CarcaseComponent, role: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const report = useMemo(() => buildShelfReadiness(scene), [scene])
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
      <div className="flex justify-between items-center gap-3 mb-3">
        <h2 id={heading} className="font-semibold">
          Manufacturing readiness
        </h2>
        <Button size="sm" variant="outline" onClick={onClose}>
          Close readiness report
        </Button>
      </div>
      <p className="text-sm mb-2">
        Shelf access report for all cabinets, including hidden cabinets. Generated counts refer to
        shelf boards in the current scene.
      </p>
      <p className="text-xs text-muted-foreground mb-4">
        Report-only: exports remain available. This checks adjustable shelf access, not every
        manufacturing requirement.
      </p>
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
