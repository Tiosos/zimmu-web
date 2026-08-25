import { expose } from 'comlink'
import { occupancyMask } from './mask'
import { nestSheets } from './nest'
import type { NestResult, SheetSpec } from './nest'
import type { BoardPart } from '../scene/types'

export interface NestJob {
  parts: BoardPart[] // one material's boards
  clearance: number
  sheet: SheetSpec
  hasGrain: boolean
}

// The job carries parts, not masks. Masking costs ~6 ms a board and a dilated mask for a 2100 mm
// panel is over a megabyte, so masking on the main thread and posting the results would leave the
// cost on the very thread this worker exists to protect, and transfer megabytes to save nothing.
// `BoardPart` is plain serialisable data, so both steps happen here.
//
// Nothing needs `transfer()`: the OCCT worker uses it because it returns large typed arrays, and a
// `NestResult` is a handful of small objects.
const api = {
  nestJob({ parts, clearance, sheet, hasGrain }: NestJob): NestResult {
    const t0 = performance.now()
    const items = parts.map((p) => ({
      id: p.id,
      mask: occupancyMask(p, clearance),
      grain: p.grain,
    }))
    const result = nestSheets(items, sheet, { hasGrain })
    if (import.meta.env.DEV) {
      console.debug(`zimmu: nestJob ${parts.length} parts ${(performance.now() - t0).toFixed(0)}ms`)
    }
    return result
  },
}

expose(api)

export type NestWorkerApi = typeof api
