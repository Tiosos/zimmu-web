import type { BoardPart, Scene } from '../../scene/types'
import { manufacturingParts, type ManufacturingBoard } from '../../scene/manufacturingPart'
import { defaultProject } from '../../scene/projectStructure'
import { defaultStockPlan } from '../../scene/stockPlanning'
import type { StockOption } from '../../scene/stockPlanRecipe'
export function stockFixture(count = 2) {
  const board = (id: string): BoardPart => ({
    kind: 'board',
    id,
    label: id,
    length: 100,
    width: 50,
    thickness: 18,
    grain: 'length',
    material: 'Panel',
    color: '#ccc',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  })
  const scene: Scene = {
      parts: Array.from({ length: count }, (_, i) => board(`p${i}`)),
      components: [],
      materials: {
        Panel: {
          thickness: 18,
          hasGrain: true,
          sheet: { length: 220, width: 120, costPerSheet: 20 },
        },
      },
      joints: [],
      hardware: [],
    },
    project = defaultProject(scene, 'Stock'),
    plan = defaultStockPlan(scene.materials, 0),
    records = manufacturingParts(scene.parts, scene.materials, []) as ManufacturingBoard[]
  plan.minLength = 10
  plan.minWidth = 10
  return { scene, project, plan, records }
}
export const stockOption = (change: Partial<StockOption> = {}): StockOption => ({
  id: 's',
  name: 'Stock',
  kind: 'sheet',
  material: 'Panel',
  thickness: 18,
  length: 220,
  width: 120,
  grain: 'length',
  quantity: null,
  price: 20,
  trim: 0,
  enabled: true,
  location: 'Rack A',
  ...change,
})
