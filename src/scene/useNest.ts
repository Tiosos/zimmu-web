import { useEffect, useRef, useState } from 'react'
import { wrap } from 'comlink'
import type { NestBoard, NestWorkerApi } from '../nest/nest.worker'
import type { NestResult, SheetSpec } from '../nest/nest'
import { shapeKey } from './utils'
import { isNestable, manufacturingParts, type ManufacturingPart } from './manufacturingPart'
import type { Component, MaterialDef, Part } from './types'

export interface NestReport {
  material: string
  sheet: SheetSpec
  result: NestResult
  excluded?: { id: string; problem: string }[]
}

const DEBOUNCE_MS = 400

interface Group {
  material: string
  def: MaterialDef
  parts: NestBoard[]
  excluded: { id: string; problem: string }[]
}

export function groupByNestableMaterial(
  parts: Part[],
  materials: Record<string, MaterialDef>,
  components: Component[],
): Group[] {
  return groupNestRecords(manufacturingParts(parts, materials, components))
}

export function groupNestRecords(records: ManufacturingPart[]): Group[] {
  const groups = new Map<string, Group>()
  for (const p of records) {
    if (p.kind !== 'board') continue
    const sheet = p.stock.sheet
    if (!sheet || !isNestable(p.stock)) continue
    let group = groups.get(p.material)
    if (!group) {
      group = {
        material: p.material,
        def: { sheet, hasGrain: p.stock.hasGrain },
        parts: [],
        excluded: [],
      }
      groups.set(p.material, group)
    }
    if (p.cut.problem) group.excluded.push({ id: p.id, problem: p.cut.problem })
    else group.parts.push({ kind: 'board', id: p.id, grain: p.grain, ...p.nesting })
  }
  return [...groups.values()].sort((a, b) => a.material.localeCompare(b.material))
}

// Everything a nest depends on, and nothing else. `parts` and `materials` are fresh objects on
// almost every render — `effectiveMaterials` in BomModal is rebuilt each time — so depending on
// their identity would re-nest on every render, forever. `shapeKey` already encodes exactly what
// changes a board's shape, which is exactly what `occupancyMask` reads.
export function jobSignature(groups: Group[], clearance: number): string {
  return JSON.stringify([
    clearance,
    groups.map((g) => [
      g.material,
      g.def.sheet?.length,
      g.def.sheet?.width,
      g.def.hasGrain ?? true,
      g.parts.map((p) => `${p.id}|${shapeKey(p)}|${p.grain}`),
      g.excluded,
    ]),
  ])
}

export function useNest(
  parts: Part[],
  materials: Record<string, MaterialDef>,
  components: Component[],
  clearance: number,
  enabled: boolean,
): { reports: NestReport[]; pending: boolean } {
  // Keyed by the signature it was computed for, so `reports` and `pending` are DERIVED rather than
  // set: no state has to be cleared when the tab closes or the scene changes, and a result that
  // belongs to a different scene can never be shown as current.
  const [stored, setStored] = useState<{ signature: string; reports: NestReport[] }>({
    signature: '',
    reports: [],
  })
  // Stale-result rejection remains even though obsolete workers are terminated: termination stops
  // wasted CPU, while the generation guard protects promise continuations already queued to run.
  const runId = useRef(0)

  const groups = enabled ? groupByNestableMaterial(parts, materials, components) : []
  const signature = enabled ? jobSignature(groups, clearance) : ''
  const fresh = stored.signature === signature

  useEffect(() => {
    if (!enabled || fresh) return
    // Re-derived here rather than captured from render: `signature` is a complete encoding of
    // every input a nest reads, so anything it does not change cannot change the groups either.
    const pendingGroups = groupByNestableMaterial(parts, materials, components)
    if (pendingGroups.length === 0) return

    const id = ++runId.current
    let cancelled = false
    let worker: Worker | null = null

    const stopWorker = () => {
      worker?.terminate()
      worker = null
    }

    const timer = setTimeout(() => {
      // `nestJob` is synchronous CPU work inside the worker. A cancel message cannot interrupt it,
      // because the worker cannot service that message until the current call returns. Give each
      // active signature its own disposable worker instead: cleanup can terminate obsolete work
      // immediately and the next signature starts on a fresh event loop.
      if (pendingGroups.some((g) => g.parts.length > 0))
        worker = new Worker(new URL('../nest/nest.worker.ts', import.meta.url), { type: 'module' })
      const nester = worker ? wrap<NestWorkerApi>(worker) : null

      void Promise.all(
        pendingGroups.map(async (g) => ({
          material: g.material,
          sheet: g.def.sheet!,
          excluded: g.excluded,
          result: g.parts.length
            ? await nester!.nestJob({
                parts: g.parts,
                clearance,
                sheet: g.def.sheet!,
                // Absent means the stock has grain: the safe default, and the one the Library
                // checkbox shows.
                hasGrain: g.def.hasGrain ?? true,
              })
            : { sheets: [], utilisation: [], unplaced: [] },
        })),
      )
        .then((reports) => {
          if (!cancelled && id === runId.current) setStored({ signature, reports })
        })
        .catch((err: unknown) => {
          // Terminating a superseded worker rejects its outstanding Comlink calls. That is expected
          // cancellation, not a nesting failure worth surfacing in the console.
          if (!cancelled && id === runId.current) console.error('Failed to nest sheets:', err)
        })
        .finally(stopWorker)
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
      // Invalidate this generation even if a promise has already settled and queued its `.then`.
      if (runId.current === id) runId.current += 1
      stopWorker()
    }
    // `parts`, `materials` and `clearance` are all encoded in `signature`; depending on their
    // identity would re-nest on every render, since both objects are rebuilt each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, fresh])

  return {
    reports: fresh ? stored.reports : [],
    // The figure on screen is stale from the moment the scene changes until the new one lands —
    // including the debounce window, when nothing is running yet but the answer is already wrong.
    pending: enabled && groups.length > 0 && !fresh,
  }
}
