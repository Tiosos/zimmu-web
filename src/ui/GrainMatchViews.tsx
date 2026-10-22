import { useId } from 'react'
import type { GrainLayout } from '../scene/grainMatching'
export function GrainMatchViews({ layout }: { layout: GrainLayout }) {
  const id = useId().replace(/:/g, ''),
    d = layout.group.draft
  return (
    <div className="space-y-3">
      {(['Installed', 'Cutting blank'] as const).map((mode, i) => {
        const W =
            mode === 'Installed'
              ? Math.max(...layout.panels.map((p) => p.installedX + p.finishedWidth))
              : layout.blankWidth,
          H =
            mode === 'Installed'
              ? Math.max(...layout.panels.map((p) => p.installedY + p.finishedHeight))
              : layout.blankHeight
        return (
          <svg
            key={mode}
            role="img"
            aria-label={`${mode} grain matching preview`}
            viewBox={`-10 -35 ${W + 20} ${H + 75}`}
            className="w-full max-h-80 border rounded"
          >
            <title>
              {mode}: {W.toFixed(2)} × {H.toFixed(2)} mm
            </title>
            <defs>
              {layout.panels.map((p) => {
                const dx = mode === 'Installed' ? p.installedX - p.sourceX : 0,
                  dy = mode === 'Installed' ? p.installedY - p.sourceY : 0
                return (
                  <pattern
                    key={p.id}
                    id={`${id}-${i}-${p.sequence}`}
                    width="60"
                    height="120"
                    patternUnits="userSpaceOnUse"
                    patternTransform={`translate(${layout.patternX + dx} ${layout.patternY + dy}) rotate(${d.direction === 'vertical' ? 0 : 90})`}
                  >
                    <rect width="60" height="120" fill="#e4c49a" />
                    <path
                      d="M15 0 C35 30 -5 90 15 120 M45 0 C65 30 25 90 45 120"
                      fill="none"
                      stroke="#8c673f"
                      strokeWidth="2"
                    />
                  </pattern>
                )
              })}
            </defs>
            <text x="0" y="-12" fontSize="20">
              {mode}: {W.toFixed(2)} × {H.toFixed(2)} mm
            </text>
            {mode === 'Cutting blank' && (
              <rect
                x="0"
                y="0"
                width={W}
                height={H}
                fill="none"
                stroke="#8b5cf6"
                strokeDasharray="8 4"
              />
            )}
            {layout.panels.map((p) => {
              const x = mode === 'Installed' ? p.installedX : p.x,
                y = mode === 'Installed' ? p.installedY : p.y,
                w = mode === 'Installed' ? p.finishedWidth : p.width,
                h = mode === 'Installed' ? p.finishedHeight : p.height
              return (
                <g key={p.id} data-grain-member={p.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={`url(#${id}-${i}-${p.sequence})`}
                    stroke="#333"
                    strokeWidth="2"
                  >
                    <title>
                      {p.label}; sequence {p.sequence}; {w.toFixed(2)} × {h.toFixed(2)} mm
                    </title>
                  </rect>
                  <text x={x + 5} y={y + 25} fontSize="20">
                    #{p.sequence}
                  </text>
                </g>
              )
            })}
            <text x="0" y={H + 30} fontSize="16">
              Schematic only · cutting gaps remove intervening grain
            </text>
          </svg>
        )
      })}
    </div>
  )
}
