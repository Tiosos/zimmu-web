import { useEffect } from 'react'
import type { Part } from '../scene/types'
import { buildCsv } from './buildCsv'

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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <div
        data-testid="cl-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#1e1e21',
          border: '1px solid #2a2a2d',
          borderRadius: 8,
          padding: 24,
          minWidth: 480,
          maxWidth: 640,
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          color: '#ccc',
          fontSize: 13,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#e5e5e7' }}>
            Cutting List
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2a2d', color: '#888', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>Label</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Length (mm)</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Width (mm)</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Thickness (mm)</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Cuts</th>
            </tr>
          </thead>
          <tbody>
            {parts.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '12px 0', color: '#555', textAlign: 'center' }}>
                  No parts
                </td>
              </tr>
            ) : (
              parts.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #1a1a1d' }}>
                  <td style={{ padding: '6px 8px 6px 0' }}>{p.label}</td>
                  <td style={{ padding: '6px 8px' }}>{p.length}</td>
                  <td style={{ padding: '6px 8px' }}>{p.width}</td>
                  <td style={{ padding: '6px 8px' }}>{p.thickness}</td>
                  <td style={{ padding: '6px 8px' }}>{p.cuts.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handleCopy}
            style={{
              background: '#2a2a2d',
              border: '1px solid #3a3a3d',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 13,
              padding: '6px 12px',
            }}
          >
            Copy CSV
          </button>
          <button
            onClick={handleDownload}
            style={{
              background: '#2a2a2d',
              border: '1px solid #3a3a3d',
              borderRadius: 4,
              color: '#ccc',
              cursor: 'pointer',
              fontSize: 13,
              padding: '6px 12px',
            }}
          >
            Download .csv
          </button>
        </div>
      </div>
    </div>
  )
}
