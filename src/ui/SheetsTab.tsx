import type { NestReport } from '../scene/useNest'
import type { MaterialDef } from '../scene/types'
import { buildSheetSvg } from './buildSheetSvg'

interface SheetsTabProps {
  reports: NestReport[]
  pending: boolean
  materials: Record<string, MaterialDef>
  labelOf: (id: string) => string
}

interface Cost {
  total: number
  basis: string
}

// `costPerSheet` prices a job the way a supplier charges for it, so it wins where both exist. The
// areal rate is priced on material actually placed rather than on sheets consumed — the two differ
// by exactly the offcut, and showing which basis produced the figure is what makes it checkable.
function costOf(def: MaterialDef | undefined, sheets: number, placedArea: number): Cost | null {
  if (def?.sheet?.costPerSheet !== undefined) {
    return { total: def.sheet.costPerSheet * sheets, basis: 'per sheet' }
  }
  if (def?.costPerM2 !== undefined) {
    return { total: (placedArea / 1_000_000) * def.costPerM2, basis: 'per m²' }
  }
  return null
}

function placedArea(report: NestReport): number {
  return report.result.sheets.flat().reduce((sum, p) => sum + p.w * p.h, 0)
}

export function SheetsTab({ reports, pending, materials, labelOf }: SheetsTabProps) {
  if (pending) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Nesting… a six-cabinet job takes a few seconds.
      </p>
    )
  }

  if (reports.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        No material has a sheet size yet. Set one in the Library tab.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {reports.map((r) => {
        const sheets = r.result.sheets.length
        const area = placedArea(r)
        const cost = costOf(materials[r.material], sheets, area)
        // A whole percent: the mask is a 1 mm raster, so a finer figure would claim a precision
        // the engine does not have.
        const utilisation =
          sheets === 0
            ? 0
            : Math.round((r.result.utilisation.reduce((s, u) => s + u, 0) / sheets) * 100)

        return (
          <div key={r.material}>
            <div
              data-testid={`sheets-row-${r.material}`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border pb-2"
            >
              <span className="text-xs font-medium">{r.material}</span>
              <span className="text-xs text-muted-foreground">
                {r.sheet.length} × {r.sheet.width} mm
              </span>
              <span className="text-xs">
                <span className="text-muted-foreground">sheets </span>
                <span>{sheets}</span>
              </span>
              <span className="text-xs">
                <span className="text-muted-foreground">used </span>
                <span>{utilisation}%</span>
              </span>
              <span className="text-xs">
                <span className="text-muted-foreground">cost </span>
                {cost === null ? (
                  <span>—</span>
                ) : (
                  <>
                    <span>${cost.total.toFixed(2)}</span>
                    <span className="text-muted-foreground"> {cost.basis}</span>
                  </>
                )}
              </span>
            </div>

            {r.result.unplaced.length > 0 && (
              <p
                role="alert"
                className="mt-2 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1.5 text-[11px] text-amber-200"
              >
                Too big for this stock, so not nested: {r.result.unplaced.map(labelOf).join(', ')}
              </p>
            )}

            <div className="mt-3 space-y-3">
              {r.result.sheets.map((placements, i) => (
                <div key={i}>
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Sheet {i + 1} — {Math.round((r.result.utilisation[i] ?? 0) * 100)}% used
                  </div>
                  {/* The markup is built by `buildSheetSvg`, which escapes every value it
                      interpolates — including part labels, the only user-authored text here. */}
                  <div
                    className="text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: buildSheetSvg(r.sheet, placements, labelOf),
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
