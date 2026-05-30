import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { wrap } from 'comlink'
import type { OcctWorkerApi } from '../geom/occt.worker'
import type { BoardPart, Part, PartId, Scene } from './types'
import { shapeKey } from './utils'

interface HistoryEntry {
  label: string
  undo: () => void
  redo: () => void
  coalesceKey?: string
}

const MAX_HISTORY = 50

const PART_COLORS = [
  '#d4a373',
  '#8ecae6',
  '#95d5b2',
  '#ffb703',
  '#cdb4db',
  '#a8dadc',
  '#f4a261',
  '#b7b7a4',
]

// Lazy singleton — not instantiated at module load so vi.stubGlobal('Worker') works in tests
let _occt: ReturnType<typeof wrap<OcctWorkerApi>> | null = null
function getOcct() {
  if (!_occt) {
    const w = new Worker(new URL('../geom/occt.worker.ts', import.meta.url), { type: 'module' })
    _occt = wrap<OcctWorkerApi>(w)
  }
  return _occt
}

function buildGeometry(data: {
  positions: Float32Array
  normals: Float32Array
}): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3))
  return geo
}

function makeDefaultBoard(): BoardPart {
  return {
    kind: 'board',
    id: `board_${crypto.randomUUID()}`,
    label: 'Board 1',
    length: 200,
    width: 100,
    thickness: 25,
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
  }
}

export interface UseSceneResult {
  scene: Scene
  geometries: Map<PartId, THREE.BufferGeometry>
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  selectedId: PartId | null
  occtReady: boolean
  nextLabel: string
  onAdd: () => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part) => void
  onSelect: (id: PartId | null) => void
  replaceScene: (next: Scene) => void
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  undo: () => void
  redo: () => void
}

export function useScene(): UseSceneResult {
  const [scene, setScene] = useState<Scene>(() => ({ parts: [makeDefaultBoard()] }))
  const [geometries, setGeometries] = useState<Map<PartId, THREE.BufferGeometry>>(new Map())
  const [errors, setErrors] = useState<Map<PartId, string>>(new Map())
  const [pendingIds, setPendingIds] = useState<Set<PartId>>(new Set())
  const [selectedId, setSelectedId] = useState<PartId | null>(null)
  const [occtReady, setOcctReady] = useState(false)

  const prevShapeKeys = useRef<Map<PartId, string>>(new Map())
  const buildSeq = useRef<Map<PartId, number>>(new Map())
  const geometriesRef = useRef<Map<PartId, THREE.BufferGeometry>>(new Map())
  const isMounted = useRef(true)
  const occtReadyRef = useRef(false)
  const labelCounter = useMemo(() => {
    const max = scene.parts.reduce((m, p) => {
      const match = /Board (\d+)/.exec(p.label)
      return match ? Math.max(m, parseInt(match[1], 10)) : m
    }, 0)
    return max > 0 ? max : scene.parts.length
  }, [scene])
  const colorIndex = useRef(0)

  const pastRef = useRef<HistoryEntry[]>([])
  const futureRef = useRef<HistoryEntry[]>([])
  const [undoState, setUndoState] = useState({
    canUndo: false,
    canRedo: false,
    undoLabel: null as string | null,
    redoLabel: null as string | null,
  })
  const sceneRef = useRef<Scene>(scene)
  useLayoutEffect(() => {
    sceneRef.current = scene
  }, [scene])

  useEffect(() => {
    isMounted.current = true
    const geos = geometriesRef.current
    return () => {
      isMounted.current = false
      geos.forEach((geo) => geo.dispose())
      geos.clear()
    }
  }, [])

  useEffect(() => {
    const partIds = new Set(scene.parts.map((p) => p.id))

    for (const part of scene.parts) {
      const key = shapeKey(part)
      if (key === prevShapeKeys.current.get(part.id)) continue

      const seq = (buildSeq.current.get(part.id) ?? 0) + 1
      buildSeq.current.set(part.id, seq)
      prevShapeKeys.current.set(part.id, key)
      setPendingIds((prev) => new Set(prev).add(part.id))

      getOcct()
        .buildPart(part.kind, { length: part.length, width: part.width, thickness: part.thickness })
        .then((data) => {
          if (!isMounted.current) return
          if (buildSeq.current.get(part.id) !== seq) return
          const geo = buildGeometry(data)
          geometriesRef.current.get(part.id)?.dispose()
          geometriesRef.current.set(part.id, geo)
          if (!occtReadyRef.current) {
            occtReadyRef.current = true
            setOcctReady(true)
          }
          setErrors((prev) => {
            const m = new Map(prev)
            m.delete(part.id)
            return m
          })
          setPendingIds((prev) => {
            const s = new Set(prev)
            s.delete(part.id)
            return s
          })
          setGeometries(new Map(geometriesRef.current))
        })
        .catch((err: unknown) => {
          if (!isMounted.current || buildSeq.current.get(part.id) !== seq) return
          setPendingIds((prev) => {
            const s = new Set(prev)
            s.delete(part.id)
            return s
          })
          setErrors((prev) =>
            new Map(prev).set(part.id, err instanceof Error ? err.message : String(err)),
          )
        })
    }

    const removed: PartId[] = []
    for (const [id] of geometriesRef.current) {
      if (!partIds.has(id)) removed.push(id)
    }
    for (const id of removed) {
      geometriesRef.current.get(id)?.dispose()
      geometriesRef.current.delete(id)
      prevShapeKeys.current.delete(id)
      buildSeq.current.delete(id)
    }
    if (removed.length > 0) setGeometries(new Map(geometriesRef.current))
  }, [scene])

  const push = useCallback((entry: HistoryEntry) => {
    const last = pastRef.current.at(-1)
    const coalescing = entry.coalesceKey !== undefined && last?.coalesceKey === entry.coalesceKey
    if (coalescing) {
      pastRef.current = [
        ...pastRef.current.slice(0, -1),
        { ...last!, redo: entry.redo, label: entry.label },
      ]
    } else {
      pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), entry]
    }
    futureRef.current = []
    setUndoState({
      canUndo: true,
      canRedo: false,
      undoLabel: entry.label,
      redoLabel: null,
    })
  }, [])

  const undo = useCallback(() => {
    const entry = pastRef.current.at(-1)
    if (!entry) return
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [...futureRef.current, entry]
    entry.undo()
    setUndoState({
      canUndo: pastRef.current.length > 0,
      canRedo: true,
      undoLabel: pastRef.current.at(-1)?.label ?? null,
      redoLabel: entry.label,
    })
  }, [])

  const redo = useCallback(() => {
    const entry = futureRef.current.at(-1)
    if (!entry) return
    futureRef.current = futureRef.current.slice(0, -1)
    pastRef.current = [...pastRef.current, entry]
    entry.redo()
    setUndoState({
      canUndo: true,
      canRedo: futureRef.current.length > 0,
      undoLabel: entry.label,
      redoLabel: futureRef.current.at(-1)?.label ?? null,
    })
  }, [])

  const onAdd = useCallback(() => {
    if (!occtReady) return
    const label = `Board ${labelCounter + 1}`
    colorIndex.current += 1
    const id: PartId = `board_${crypto.randomUUID()}`
    const part: BoardPart = {
      kind: 'board',
      id,
      label,
      length: 200,
      width: 100,
      thickness: 25,
      color: PART_COLORS[colorIndex.current % PART_COLORS.length],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
    }
    setScene((prev) => ({ parts: [...prev.parts, part] }))
    setSelectedId(part.id)
    push({
      label: `Add ${part.label}`,
      undo: () => {
        setScene((prev) => ({ parts: prev.parts.filter((p) => p.id !== part.id) }))
        setSelectedId((prev) => (prev === part.id ? null : prev))
      },
      redo: () => {
        setScene((prev) => ({ parts: [...prev.parts, part] }))
        setSelectedId(part.id)
      },
    })
  }, [occtReady, labelCounter, push])

  const onRemove = useCallback(
    (id: PartId) => {
      const part = sceneRef.current.parts.find((p) => p.id === id)
      if (!part) return
      const index = sceneRef.current.parts.findIndex((p) => p.id === id)
      geometriesRef.current.get(id)?.dispose()
      geometriesRef.current.delete(id)
      prevShapeKeys.current.delete(id)
      buildSeq.current.delete(id)
      setGeometries(new Map(geometriesRef.current))
      setScene((prev) => ({ parts: prev.parts.filter((p) => p.id !== id) }))
      setSelectedId((prev) => (prev === id ? null : prev))
      push({
        label: `Remove ${part.label}`,
        undo: () =>
          setScene((prev) => {
            const parts = [...prev.parts]
            parts.splice(index, 0, part)
            return { parts }
          }),
        redo: () => {
          setScene((prev) => ({ parts: prev.parts.filter((p) => p.id !== id) }))
          setSelectedId((prev) => (prev === id ? null : prev))
        },
      })
    },
    [push],
  )

  const onDuplicate = useCallback(
    (id: PartId) => {
      const orig = sceneRef.current.parts.find((p) => p.id === id) as BoardPart | undefined
      if (!orig) return
      colorIndex.current += 1
      const clone: BoardPart = {
        ...orig,
        id: `board_${crypto.randomUUID()}` as PartId,
        color: PART_COLORS[colorIndex.current % PART_COLORS.length],
        position: { ...orig.position, x: orig.position.x + orig.length + 10 },
        rotation: { x: 0, y: 0, z: 0 },
      }
      setScene((prev) => {
        const idx = prev.parts.findIndex((p) => p.id === id)
        if (idx === -1) return prev
        const parts = [...prev.parts]
        parts.splice(idx + 1, 0, clone)
        return { parts }
      })
      push({
        label: `Duplicate ${orig.label}`,
        undo: () => {
          setScene((prev) => ({ parts: prev.parts.filter((p) => p.id !== clone.id) }))
          setSelectedId((prev) => (prev === clone.id ? null : prev))
        },
        redo: () =>
          setScene((prev) => {
            const idx = prev.parts.findIndex((p) => p.id === id)
            if (idx === -1) return prev
            const parts = [...prev.parts]
            parts.splice(idx + 1, 0, clone)
            return { parts }
          }),
      })
    },
    [push],
  )

  const onUpdate = useCallback(
    (id: PartId, updater: (p: Part) => Part) => {
      const before = sceneRef.current.parts.find((p) => p.id === id)
      if (!before) return
      const after = updater(before)
      setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === id ? after : p)) }))
      push({
        label: `Update ${after.label}`,
        coalesceKey: `update-${id}`,
        undo: () =>
          setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === id ? before : p)) })),
        redo: () =>
          setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === id ? after : p)) })),
      })
    },
    [push],
  )

  const onSelect = useCallback((id: PartId | null) => {
    setSelectedId(id)
  }, [])

  const replaceScene = useCallback((next: Scene) => {
    for (const geo of geometriesRef.current.values()) geo.dispose()
    geometriesRef.current.clear()
    prevShapeKeys.current.clear()
    buildSeq.current.clear()
    pastRef.current = []
    futureRef.current = []
    setUndoState({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null })
    setScene(next)
    setSelectedId(null)
    setPendingIds(new Set())
    setGeometries(new Map())
  }, [])

  return {
    scene,
    geometries,
    errors,
    pendingIds,
    selectedId,
    occtReady,
    nextLabel: `Board ${labelCounter + 1}`,
    onAdd,
    onRemove,
    onDuplicate,
    onUpdate,
    onSelect,
    replaceScene,
    canUndo: undoState.canUndo,
    canRedo: undoState.canRedo,
    undoLabel: undoState.undoLabel,
    redoLabel: undoState.redoLabel,
    undo,
    redo,
  }
}
