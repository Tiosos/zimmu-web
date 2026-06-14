import { expose, transfer } from 'comlink'
import { initOCCT, makeShape, writeStep } from './occt'
import type { ExportSpec } from './occt'
import { shapeToMeshData } from './mesh'
import type { Vec3 } from '../scene/types'

const api = {
  async buildPart(
    kind: 'board',
    dims: {
      length: number
      width: number
      thickness: number
      cuts: Array<{ id: string; position: Vec3; size: Vec3 }>
    },
  ) {
    const oc = await initOCCT()
    if (kind === 'board') {
      performance.mark('zimmu:shape-start')
      const shape = makeShape(oc, dims)
      performance.mark('zimmu:shape-end')
      performance.mark('zimmu:mesh-start')
      const data = shapeToMeshData(oc, shape, { linearDeflection: 0.1, angularDeflection: 0.5 })
      performance.mark('zimmu:mesh-end')
      shape.delete()
      if (import.meta.env.DEV) {
        const { duration: shapeMs } = performance.measure(
          'zimmu:shape',
          'zimmu:shape-start',
          'zimmu:shape-end',
        )
        const { duration: meshMs } = performance.measure(
          'zimmu:mesh',
          'zimmu:mesh-start',
          'zimmu:mesh-end',
        )
        console.debug(
          `[occt] shape ${shapeMs.toFixed(0)}ms  mesh ${meshMs.toFixed(0)}ms  (${dims.cuts.length} cut${dims.cuts.length !== 1 ? 's' : ''})`,
        )
      }
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
  async exportStep(specs: ExportSpec[]): Promise<string> {
    const oc = await initOCCT()
    return writeStep(oc, specs)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
