import { expose, transfer } from 'comlink'
import { initOCCT, makeBox, makeCut } from './occt'
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
      const sorted = dims.cuts.slice().sort((a, b) => a.id.localeCompare(b.id))
      let current = makeBox(oc, dims.length, dims.width, dims.thickness)

      for (const cut of sorted) {
        if (cut.size.x <= 0.1 || cut.size.y <= 0.1 || cut.size.z <= 0.1) continue
        const prev = current
        current = makeCut(oc, current, cut.position, cut.size)
        if (prev !== current) prev.delete()
      }

      const data = shapeToMeshData(oc, current, { linearDeflection: 0.1, angularDeflection: 0.5 })
      current.delete()
      return transfer(data, [data.positions.buffer, data.normals.buffer])
    }
    const _: never = kind
    throw new Error(`unknown kind: ${_}`)
  },
}

expose(api)

export type OcctWorkerApi = typeof api
