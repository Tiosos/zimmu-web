import { useEffect } from 'react'
import type { Part } from '../scene/types'
import { buildCsv, groupParts } from './buildCsv'
import { Button } from '@/components/ui/button'

interface CuttingListProps {
  parts: Part[]
  projectName: string
  onClose: () => void
}

export function CuttingList({ parts, projectName, onClose }: CuttingListProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const csv = buildCsv(parts)
  const rows = groupParts(parts)

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = () => {
    void navigator.clipboard.writeText(csv)
  }

  return (
    <div
      data-testid="cl-overlay"
      onClick={onClose}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        className="bg-card border border-border rounded-lg p-6 min-w-[560px] max-w-[720px] max-h-[80vh] overflow-auto shadow-2xl text-foreground text-sm"
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
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
                  No parts
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-b border-border/30">
                  <td className="py-1.5 pr-2 text-xs">{row.qty}</td>
                  <td className="py-1.5 px-2 text-xs">{row.labels}</td>
                  <td className="py-1.5 px-2 text-xs">{row.material || '—'}</td>
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
                </tr>
              ))
            )}
          </tbody>
        </table>

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
