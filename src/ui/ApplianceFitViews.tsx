import type { CarcaseComponent, Scene } from '../scene/types'
import type { FitBox, ResolvedAppliance } from '../scene/applianceBays'
import { materialTargets } from '../scene/cabinetMaterials'
import { cabinetSpaceBox } from '../geom/assembly'
import { componentsById } from '../scene/componentTree'
export function ApplianceFitViews({
  scene,
  cabinet,
  resolved,
}: {
  scene: Scene
  cabinet: CarcaseComponent
  resolved: ResolvedAppliance
}) {
  if (!resolved.body || !resolved.envelope) return null
  const byId = componentsById(scene.components)
  const stock = materialTargets(scene, cabinet.id).map((t) =>
    cabinetSpaceBox(t.board, byId, cabinet),
  )
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(['Front', 'Top', 'End'] as const).map((view) => {
        const horizontal = view === 'End' ? 'y' : 'x',
          vertical = view === 'Top' ? 'y' : 'z'
        const all = [...stock, resolved.body!, resolved.envelope!]
        const minX = Math.min(...all.map((b) => b.min[horizontal])),
          maxX = Math.max(...all.map((b) => b.max[horizontal]))
        const minY = Math.min(...all.map((b) => b.min[vertical])),
          maxY = Math.max(...all.map((b) => b.max[vertical]))
        const rect = (box: FitBox, fill: string, stroke: string, label: string, dashed = false) => (
          <rect
            key={label}
            x={box.min[horizontal]}
            y={view === 'Top' ? box.min[vertical] : -box.max[vertical]}
            width={box.max[horizontal] - box.min[horizontal]}
            height={box.max[vertical] - box.min[vertical]}
            fill={fill}
            fillOpacity="0.3"
            stroke={stroke}
            strokeDasharray={dashed ? '8 5' : undefined}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          >
            <title>{label}</title>
          </rect>
        )
        return (
          <figure key={view}>
            <figcaption>{view}</figcaption>
            <svg
              role="img"
              aria-label={`${view} appliance fit`}
              className="w-full border"
              viewBox={`${minX - 20} ${(view === 'Top' ? minY : -maxY) - 20} ${maxX - minX + 40} ${maxY - minY + 40}`}
            >
              {stock.map((b, i) => rect(b, '#999', '#888', `Cabinet panel ${i + 1}`))}
              {rect(
                resolved.envelope!,
                '#fbbf24',
                '#b45309',
                'Installation clearance envelope',
                true,
              )}
              {rect(resolved.body!, '#60a5fa', '#2563eb', 'Appliance body')}
            </svg>
          </figure>
        )
      })}
    </div>
  )
}
