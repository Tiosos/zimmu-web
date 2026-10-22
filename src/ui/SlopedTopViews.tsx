import type { CarcaseComponent, Scene } from '../scene/types'
import { slopeMetrics } from '../scene/slopedTopRecipe'
import { cabinetSpaceBox } from '../geom/assembly'
export function SlopedTopViews({ scene, cabinet }: { scene: Scene; cabinet: CarcaseComponent }) {
  const p = cabinet.params,
    m = slopeMetrics(p),
    byId = new Map(scene.components.map((c) => [c.id, c])),
    parts = scene.parts.filter((p) => p.parentId === cabinet.id),
    polygons = parts.map((part) => ({
      id: part.id,
      label: part.label,
      corners: cabinetSpaceBox(part, byId, cabinet).corners,
      color: part.color,
    })),
    project = (v: { x: number; y: number; z: number }) => [v.x - v.y * 0.65, -v.z + v.y * 0.3],
    points = polygons.flatMap((p) => p.corners.map(project)),
    x0 = Math.min(...points.map((p) => p[0])),
    x1 = Math.max(...points.map((p) => p[0])),
    y0 = Math.min(...points.map((p) => p[1])),
    y1 = Math.max(...points.map((p) => p[1]))
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ]
  return (
    <div className="space-y-3">
      <svg
        role="img"
        aria-label="Sloped cabinet elevation"
        viewBox={`-40 -40 ${m.span + 80} ${p.height + 90}`}
        className="w-full max-h-72 border"
      >
        <title>
          Roof endpoints {m.start.toFixed(2)} and {m.end.toFixed(2)} mm; angle {m.angle.toFixed(2)}{' '}
          degrees
        </title>
        <polygon
          points={`0,${p.height} ${m.span},${p.height} ${m.span},${p.height - m.end} 0,${p.height - m.start}`}
          fill="#c8a477"
          fillOpacity="0.3"
          stroke="currentColor"
        />
        <text x="5" y="-12" fontSize="20">
          {m.start.toFixed(2)} → {m.end.toFixed(2)} mm · {m.angle.toFixed(2)}°
        </text>
      </svg>
      <svg
        role="img"
        aria-label="Sloped cabinet plan"
        viewBox={`-30 -30 ${p.width + 60} ${p.depth + 60}`}
        className="w-full max-h-40 border"
      >
        <rect x="0" y="0" width={p.width} height={p.depth} fill="none" stroke="currentColor" />
        <text x="10" y="25" fontSize="20">
          {p.slopedTop?.axis ?? 'Flat'} · high {p.slopedTop?.highEnd ?? 'level'} end
        </text>
        <path
          d={
            p.slopedTop?.axis === 'depth'
              ? `M${p.width / 2} 50 L${p.width / 2} ${p.depth - 30}`
              : `M30 ${p.depth / 2} L${p.width - 30} ${p.depth / 2}`
          }
          stroke="#8b5cf6"
          strokeWidth="5"
        />
      </svg>
      <svg
        role="img"
        aria-label="Sloped cabinet generated panel projection"
        viewBox={`${x0 - 20} ${y0 - 20} ${x1 - x0 + 40} ${y1 - y0 + 40}`}
        className="w-full max-h-80 border"
      >
        <title>
          Generated panel profiles in isometric projection; drilling and notches omitted in this
          diagram
        </title>
        {polygons.map((p) => (
          <g key={p.id}>
            {faces.map((face, i) => (
              <polygon
                key={i}
                points={face.map((n) => project(p.corners[n]).join(',')).join(' ')}
                fill={p.color}
                fillOpacity="0.3"
                stroke="currentColor"
                strokeWidth="1"
              >
                <title>{p.label}</title>
              </polygon>
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
