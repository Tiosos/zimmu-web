import type { Scene } from '../scene/types'
import type { OpeningMotion } from '../scene/openingMotionRecipe'
import {
  defaultOpeningSetting,
  motionPartBox,
  targetMotion,
  type OpeningTarget,
} from '../scene/openingMotion'
import { applyMatrixToPoint, multiplyMatrix, resolveWorldMatrix } from '../geom/transform'
export function OpeningMotionViews({
  scene,
  targets,
  settings,
  fractions,
  matrices,
}: {
  scene: Scene
  targets: OpeningTarget[]
  settings: OpeningMotion
  fractions: Record<string, number>
  matrices: Map<string, Float64Array>
}) {
  const map = new Map(scene.components.map((c) => [c.id, c]))
  const rows = targets.map((t) => {
    const c = scene.components.find((c) => c.id === t.cabinetId)!,
      cm = resolveWorldMatrix(c, map),
      e = settings.entries.find((e) => e.frontId === t.id) ?? defaultOpeningSetting(t)
    const box = motionPartBox(t.part, matrices.get(t.id) ?? resolveWorldMatrix(t.part, map))
    const x = t.hinge === 'right' ? t.box.x0 : t.box.x1,
      y = t.box.y0
    const points = Array.from({ length: 19 }, (_, i) =>
      applyMatrixToPoint(multiplyMatrix(cm, targetMotion(t, e, i / 18)), x, y, t.box.z0),
    )
    return { t, e, box, points }
  })
  return (
    <div className="space-y-2">
      {(['Plan', 'Elevation'] as const).map((view) => {
        const points = rows.flatMap((r) => [
          [r.box.x0, view === 'Plan' ? r.box.y0 : r.box.z0],
          [r.box.x1, view === 'Plan' ? r.box.y1 : r.box.z1],
          ...r.points.map((p) => [p[0], view === 'Plan' ? p[1] : p[2]]),
        ])
        const x0 = Math.min(0, ...points.map((p) => p[0])) - 100,
          x1 = Math.max(600, ...points.map((p) => p[0])) + 100,
          y0 = Math.min(0, ...points.map((p) => p[1])) - 100,
          y1 = Math.max(800, ...points.map((p) => p[1])) + 100
        return (
          <svg
            key={view}
            role="img"
            aria-label={`${view} opening motion`}
            viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`}
            className="w-full max-h-52 border rounded"
          >
            <title>{view} motion preview; dimensions in mm</title>
            {rows.map(({ t, e, box, points }) => (
              <g key={t.id}>
                {view === 'Plan' && (
                  <polyline
                    data-motion-path={t.id}
                    points={points.map((p) => `${p[0]},${-p[1]}`).join(' ')}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="4"
                    strokeDasharray={t.kind === 'door' ? '8 4' : undefined}
                  />
                )}
                <rect
                  x={box.x0}
                  y={-(view === 'Plan' ? box.y1 : box.z1)}
                  width={Math.max(2, box.x1 - box.x0)}
                  height={Math.max(2, view === 'Plan' ? box.y1 - box.y0 : box.z1 - box.z0)}
                  fill="#80b7df"
                  stroke="#333"
                  strokeWidth="2"
                >
                  <title>{t.label}</title>
                </rect>
                <text x={box.x0} y={-(view === 'Plan' ? box.y0 : box.z0) + 35} fontSize="24">
                  {t.label}: {(e.limit * (fractions[t.id] ?? 0)).toFixed(1)}
                  {t.kind === 'door' ? '°' : ' mm'} · {(t.box.x1 - t.box.x0).toFixed(1)} ×{' '}
                  {(t.box.z1 - t.box.z0).toFixed(1)} mm
                </text>
              </g>
            ))}
          </svg>
        )
      })}
    </div>
  )
}
