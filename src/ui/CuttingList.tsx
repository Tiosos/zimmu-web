import { useEffect, useRef, useState } from 'react'
import type { MaterialDef, Part } from '../scene/types'
import { buildCsv, groupParts } from './buildCsv'
import { downloadBlob } from './download'
import { Button } from '@/components/ui/button'

interface MaterialPopoverProps {
  current: number | undefined
  onSave: (def: MaterialDef) => void
  onClose: () => void
}

function MaterialPopover({ current, onSave, onClose }: MaterialPopoverProps) {
  const [value, setValue] = useState(current !== undefined ? String(current) : '')
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = () => {
    if (committedRef.current) return
    committedRef.current = true
    const num = parseFloat(value)
    if (!isNaN(num) && num >= 0) {
      if (current === undefined || num !== current) onSave({ costPerM2: num })
      else onClose()
    } else {
      onClose()
    }
  }

  return (
    <div
      className="absolute z-10 top-full left-0 mt-1 bg-card border border-border rounded shadow-lg p-2 flex items-center gap-1.5 text-xs"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="text-muted-foreground whitespace-nowrap">$/m²</span>
      <input
        ref={inputRef}
        type="number"
        min={0}
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') onClose()
        }}
        className="w-20 bg-background border border-border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

interface CuttingListProps {
  parts: Part[]
  projectName: string
  onClose: () => void
  materials?: Record<string, MaterialDef>
  onMaterialCostChange?: (name: string, def: MaterialDef) => void
  hideExportButtons?: boolean
}

export function CuttingList({
  parts,
  projectName,
  onClose,
  materials = {},
  onMaterialCostChange,
  hideExportButtons = false,
}: CuttingListProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null)

  useEffect(() => {
    if (hideExportButtons) return // ESC handled by BomModal when embedded
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, hideExportButtons])

  useEffect(() => {
    if (openPopover === null) return
    const handler = () => setOpenPopover(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [openPopover])

  const csv = buildCsv(parts, materials)
  const rows = groupParts(parts, materials)

  const handleDownload = () => {
    downloadBlob(csv, `${projectName}.csv`, 'text/csv')
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(csv)
  }

  const anyHasCost = rows.some((r) => r.totalCost !== null)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)

  const table = (
    <table className="w-full border-collapse mb-4">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="pb-2 pr-2 font-medium text-xs">Qty</th>
          <th className="pb-2 px-2 font-medium text-xs">Labels</th>
          <th className="pb-2 px-2 font-medium text-xs">Material</th>
          <th className="pb-2 px-2 font-medium text-xs">Color</th>
          <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Width (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Thickness (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Cuts</th>
          <th className="pb-2 px-2 font-medium text-xs">Cost/unit</th>
          <th className="pb-2 px-2 font-medium text-xs">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={10} className="py-3 text-muted-foreground text-center text-xs">
              No parts
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.key} className="border-b border-border/30">
              <td className="py-1.5 pr-2 text-xs">{row.qty}</td>
              <td className="py-1.5 px-2 text-xs">{row.labels}</td>
              <td className="py-1.5 px-2 text-xs">
                {row.material ? (
                  <div className="relative inline-block">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (onMaterialCostChange) {
                          setOpenPopover(openPopover === row.material ? null : row.material)
                        }
                      }}
                      className="underline decoration-dotted cursor-pointer hover:text-foreground text-xs"
                      title="Click to set $/m² rate"
                    >
                      {row.material}
                    </button>
                    {openPopover === row.material && onMaterialCostChange && (
                      <MaterialPopover
                        current={materials[row.material]?.costPerM2}
                        onSave={(def) => {
                          onMaterialCostChange(row.material, def)
                          setOpenPopover(null)
                        }}
                        onClose={() => setOpenPopover(null)}
                      />
                    )}
                  </div>
                ) : (
                  '—'
                )}
              </td>
              <td className="py-1.5 px-2 text-xs">
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ background: row.color }}
                  />
                  {row.color}
                </span>
              </td>
              <td className="py-1.5 px-2 text-xs">{row.length}</td>
              <td className="py-1.5 px-2 text-xs">{row.width}</td>
              <td className="py-1.5 px-2 text-xs">{row.thickness}</td>
              <td className="py-1.5 px-2 text-xs">{row.cuts}</td>
              <td className="py-1.5 px-2 text-xs">
                {row.costPerUnit !== null ? `$${row.costPerUnit.toFixed(2)}` : '—'}
              </td>
              <td className="py-1.5 px-2 text-xs">
                {row.totalCost !== null ? `$${row.totalCost.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))
        )}
        {anyHasCost && (
          <tr className="border-t border-border font-medium">
            <td colSpan={9} className="pt-2 pr-2 text-xs text-right text-muted-foreground">
              Board total
            </td>
            <td className="pt-2 px-2 text-xs">${boardSubtotal.toFixed(2)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )

  // Embedded mode: just the table, no overlay, no header, no export buttons
  if (hideExportButtons) {
    return <div data-testid="cl-panel">{table}</div>
  }

  // Standalone mode: full-screen modal
  return (
    <div
      data-testid="cl-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 min-w-[680px] max-w-[900px] max-h-[80vh] overflow-auto shadow-2xl text-foreground text-sm"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground/90 m-0">Cutting List</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            onClick={onClose}
            className="text-muted-foreground h-6 w-6"
          >
            ×
          </Button>
        </div>
        {table}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            Copy CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            Download .csv
          </Button>
        </div>
      </div>
    </div>
  )
}
