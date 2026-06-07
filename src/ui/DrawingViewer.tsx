import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import type { DrawingSheet } from '../geom/drawing'
import { buildSvg } from './buildSvg'
import { buildDxf } from './buildDxf'
import { downloadBlob } from './download'

export interface DrawingViewerProps {
  open: boolean
  onClose: () => void
  sheets: DrawingSheet[]
  projectName: string
}

function sheetFilename(sheet: DrawingSheet, projectName: string, ext: string): string {
  const base = sheet.kind === 'cover' ? `${projectName}-cover` : `${projectName}-${sheet.partLabel}`
  return base.toLowerCase().replace(/\s+/g, '-') + '.' + ext
}

function printSheets(sheetList: DrawingSheet[]): void {
  const iframe = document.createElement('iframe')
  iframe.style.display = 'none'
  document.body.appendChild(iframe)
  const html = sheetList
    .map((s) => `<div style="page-break-after:always">${buildSvg(s)}</div>`)
    .join('')
  iframe.contentDocument?.write(`<!DOCTYPE html><html><body style="margin:0">${html}</body></html>`)
  iframe.contentDocument?.close()
  iframe.contentWindow?.print()
  setTimeout(() => document.body.removeChild(iframe), 1000)
}

export function DrawingViewer({ open, onClose, sheets, projectName }: DrawingViewerProps) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (open) setIdx(0)
  }, [open])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIdx((i) => Math.max(0, i - 1))
      if (e.key === 'ArrowRight') setIdx((i) => Math.min(sheets.length - 1, i + 1))
      if (e.key === 'Escape') onClose()
    },
    [sheets.length, onClose],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, handleKey])

  if (!open || sheets.length === 0) return null

  const sheet = sheets[idx]
  const sheetLabel =
    sheet.kind === 'cover' ? 'Cover' : `Part ${idx} of ${sheets.length - 1} — ${sheet.partLabel}`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
        <span className="font-semibold text-sm">2D Drawings</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="←"
          >
            ←
          </Button>
          <span className="text-sm min-w-[200px] text-center">{sheetLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIdx((i) => Math.min(sheets.length - 1, i + 1))}
            disabled={idx === sheets.length - 1}
            aria-label="→"
          >
            →
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          ✕ Close
        </Button>
      </div>

      {/* SVG preview */}
      <div className="flex-1 overflow-auto flex items-center justify-center bg-muted p-6">
        <div
          className="bg-white shadow-lg"
          style={{ maxWidth: '100%', maxHeight: '100%', aspectRatio: '297 / 210' }}
          dangerouslySetInnerHTML={{ __html: buildSvg(sheet) }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-3 border-t flex-shrink-0">
        <Button variant="outline" size="sm" onClick={() => printSheets([sheet])}>
          Print this sheet
        </Button>
        <Button variant="outline" size="sm" onClick={() => printSheets(sheets)}>
          Print all
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadBlob(buildSvg(sheet), sheetFilename(sheet, projectName, 'svg'), 'image/svg+xml')
          }
        >
          Download SVG
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadBlob(
              buildDxf(sheet),
              sheetFilename(sheet, projectName, 'dxf'),
              'application/dxf',
            )
          }
        >
          Download DXF
        </Button>
      </div>
    </div>
  )
}
