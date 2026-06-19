import { useEffect, useState } from 'react'
import type { MaterialDef, Part } from '../scene/types'
import { groupDowels } from './buildCsv'
import { MaterialPopover } from './CuttingList'

interface DowelListProps {
  parts: Part[]
  materials?: Record<string, MaterialDef>
  onMaterialCostChange?: (name: string, def: MaterialDef) => void
}

export function DowelList({ parts, materials = {}, onMaterialCostChange }: DowelListProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null)

  useEffect(() => {
    if (openPopover === null) return
    const handler = () => setOpenPopover(null)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [openPopover])

  const rows = groupDowels(parts, materials)
  const anyHasCost = rows.some((r) => r.totalCost !== null)
  const subtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)

  return (
    <table className="w-full border-collapse mb-4">
      <thead>
        <tr className="border-b border-border text-muted-foreground text-left">
          <th className="pb-2 pr-2 font-medium text-xs">Qty</th>
          <th className="pb-2 px-2 font-medium text-xs">Labels</th>
          <th className="pb-2 px-2 font-medium text-xs">Material</th>
          <th className="pb-2 px-2 font-medium text-xs">Color</th>
          <th className="pb-2 px-2 font-medium text-xs">Diameter (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
          <th className="pb-2 px-2 font-medium text-xs">Cost/unit</th>
          <th className="pb-2 px-2 font-medium text-xs">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
              No dowels
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
                      title="Click to set $/m rate"
                    >
                      {row.material}
                    </button>
                    {openPopover === row.material && onMaterialCostChange && (
                      <MaterialPopover
                        current={materials[row.material]?.costPerM}
                        unitLabel="$/m"
                        onSave={(num) => {
                          onMaterialCostChange(row.material, {
                            ...materials[row.material],
                            costPerM: num,
                          })
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
              <td className="py-1.5 px-2 text-xs">{row.diameter}</td>
              <td className="py-1.5 px-2 text-xs">{row.length}</td>
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
            <td colSpan={7} className="pt-2 pr-2 text-xs text-right text-muted-foreground">
              Dowel total
            </td>
            <td className="pt-2 px-2 text-xs">${subtotal.toFixed(2)}</td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
