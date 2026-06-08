import { useEffect, useState } from 'react'
import type { HardwareItem, MaterialDef, Part } from '../scene/types'
import { CuttingList } from './CuttingList'
import { HardwareTab } from './HardwareTab'
import { groupParts, buildCsv, buildHardwareCsv } from './buildCsv'
import { downloadBlob } from './download'
import { Button } from '@/components/ui/button'

type Tab = 'boards' | 'hardware'

interface BomModalProps {
  parts: Part[]
  materials: Record<string, MaterialDef>
  hardware: HardwareItem[]
  projectName: string
  onClose: () => void
  onMaterialCostChange: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
}

export function BomModal({
  parts,
  materials,
  hardware,
  projectName,
  onClose,
  onMaterialCostChange,
  onUpdateHardware,
}: BomModalProps) {
  const [tab, setTab] = useState<Tab>('boards')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const rows = groupParts(parts, materials)
  const boardSubtotal = rows.reduce((sum, r) => sum + (r.totalCost ?? 0), 0)
  const hardwareSubtotal = hardware.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const grandTotal = boardSubtotal + hardwareSubtotal

  const handleCopy = () => {
    const csv = tab === 'boards' ? buildCsv(parts, materials) : buildHardwareCsv(hardware)
    void navigator.clipboard.writeText(csv)
  }

  const handleDownload = () => {
    if (tab === 'boards') {
      const csv = buildCsv(parts, materials)
      downloadBlob(csv, `${projectName}-boards.csv`, 'text/csv')
    } else {
      const csv = buildHardwareCsv(hardware)
      downloadBlob(csv, `${projectName}-hardware.csv`, 'text/csv')
    }
  }

  return (
    <div
      data-testid="bom-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="bom-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg flex flex-col min-w-[700px] max-w-[960px] w-[90vw] max-h-[85vh] shadow-2xl text-foreground text-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground/90">Bill of Materials</h2>
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

        {/* Tabs */}
        <div role="tablist" className="flex gap-0 border-b border-border px-6">
          {(['boards', 'hardware'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'boards' ? 'Boards' : 'Hardware'}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {tab === 'boards' ? (
            <CuttingList
              parts={parts}
              projectName={projectName}
              onClose={onClose}
              materials={materials}
              onMaterialCostChange={onMaterialCostChange}
              hideExportButtons
            />
          ) : (
            <HardwareTab hardware={hardware} onUpdateHardware={onUpdateHardware} />
          )}
        </div>

        {/* Footer */}
        <div
          data-testid="bom-grand-total"
          className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/20"
        >
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              Boards:{' '}
              <span className="text-foreground">
                {boardSubtotal === 0 && !rows.some((r) => r.totalCost !== null)
                  ? '—'
                  : `$${boardSubtotal.toFixed(2)}`}
              </span>
            </span>
            <span className="text-border">|</span>
            <span>
              Hardware: <span className="text-foreground">${hardwareSubtotal.toFixed(2)}</span>
            </span>
            <span className="text-border">|</span>
            <span className="font-medium text-foreground">
              Grand total: ${grandTotal.toFixed(2)}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              Copy CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={handleDownload}>
              Download .csv
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
