import { useEffect, useRef, useState } from 'react'
import { wrap } from 'comlink'
import type { NestWorkerApi } from '../nest/nest.worker'
import type { NestResult, SheetSpec } from '../nest/nest'
import { isNestable } from '../ui/buildCsv'
import { shapeKey } from './utils'
import type { BoardPart, MaterialDef, Part } from './types'

export interface NestReport {
  material: string
  sheet: SheetSpec
  result: NestResult
}

// Lazy singleton — not instantiated at module load so vi.stubGlobal('Worker') works in tests, and
// so a session that never opens the Sheets tab never spawns a worker at all.
let _nest: ReturnType<typeof wrap<NestWorkerApi>> | null = null
function getNester() {
  if (!_nest) {
    const w = new Worker(new URL('../nest/nest.worker.ts', import.meta.url), { type: 'module' })
    _nest = wrap<NestWorkerApi>(w)
  }
  return _nest
}

const DEBOUNCE_MS = 400

interface Group {
  material: string
  def: MaterialDef
  parts: BoardPart[]
}

function groupByNestableMaterial(parts: Part[], materials: Record<string, MaterialDef>): Group[] {
  const groups = new Map<string, Group>()
  for (const p of parts) {
    if (p.kind !== 'board') continue
    const def = materials[p.material]
    // A material with no sheet is not nested — dowels, hardware, stock bought to length. Not an
    // error and not a zero-sheet row: it simply keeps its Boards-tab rows and is absent here.
    if (def === undefined || !isNestable(def)) continue
    const existing = groups.get(p.material)
    if (existing) existing.parts.push(p)
    else groups.set(p.material, { material: p.material, def, parts: [p] })
  }
  // Sorted so the report order does not depend on which part happened to come first.
  return [...groups.values()].sort((a, b) => a.material.localeCompare(b.material))
}

// Everything a nest depends on, and nothing else. `parts` and `materials` are fresh objects on
// almost every render — `effectiveMaterials` in BomModal is rebuilt each time — so depending on
// their identity would re-nest on every render, forever. `shapeKey` already encodes exactly what
// changes a board's shape, which is exactly what `occupancyMask` reads.
function jobSignature(groups: Group[], clearance: number): string {
  return JSON.stringify([
    clearance,
    groups.map((g) => [
      g.material,
      g.def.sheet?.length,
      g.def.sheet?.width,
      g.def.hasGrain ?? true,
      g.parts.map((p) => `${p.id}|${shapeKey(p)}|${p.grain}`),
    ]),
  ])
}

export function useNest(
  parts: Part[],
  materials: Record<string, MaterialDef>,
  clearance: number,
  enabled: boolean,
): { reports: NestReport[]; pending: boolean } {
  const [reports, setReports] = useState<NestReport[]>([])
  const [pending, setPending] = useState(false)
  // A nest takes seconds, so two runs overlapping is the normal case. Only the newest may land.
  const runId = useRef(0)

  const groups = enabled ? groupByNestableMaterial(parts, materials) : []
  const signature = enabled ? jobSignature(groups, clearance) : ''
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const clearanceRef = useRef(clearance)
  clearanceRef.current = clearance

  useEffect(() => {
    if (!enabled) {
      setPending(false)
      return
    }
    const pendingGroups = groupsRef.current
    if (pendingGroups.length === 0) {
      setReports([])
      setPending(false)
      return
    }

    const id = ++runId.current
    setPending(true)
    const timer = setTimeout(() => {
      const nester = getNester()
      void Promise.all(
        pendingGroups.map(async (g) => ({
          material: g.material,
          sheet: g.def.sheet!,
          result: await nester.nestJob({
            parts: g.parts,
            clearance: clearanceRef.current,
            sheet: g.def.sheet!,
            // Absent means the stock has grain: the safe default, and the one the Library
            // checkbox shows.
            hasGrain: g.def.hasGrain ?? true,
          }),
        })),
      )
        .then((next) => {
          if (id !== runId.current) return
          setReports(next)
          setPending(false)
        })
        .catch((err: unknown) => {
          if (id !== runId.current) return
          console.error('Failed to nest sheets:', err)
          setPending(false)
        })
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [signature, enabled])

  return { reports, pending }
}
