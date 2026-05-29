import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { wrap } from 'comlink'
import type { OcctWorkerApi } from '../geom/occt.worker'
import type { BoardPart, Part, PartId, Scene } from './types'
import { shapeKey } from './utils'

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
  onUpdate: (part: Part) => void
  onSelect: (id: PartId | null) => void
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
  const [labelCounter, setLabelCounter] = useState(1)
  const colorIndex = useRef(0)

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

  const onAdd = useCallback(() => {
    if (!occtReady) return
    const newCount = labelCounter + 1
    colorIndex.current += 1
    const id: PartId = `board_${crypto.randomUUID()}`
    const part: BoardPart = {
      kind: 'board',
      id,
      label: `Board ${newCount}`,
      length: 200,
      width: 100,
      thickness: 25,
      color: PART_COLORS[colorIndex.current % PART_COLORS.length],
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      rotationOrder: 'XYZ',
    }
    setScene((prev) => ({ parts: [...prev.parts, part] }))
    setSelectedId(id)
    setLabelCounter(newCount)
  }, [occtReady, labelCounter])

  const onRemove = useCallback((id: PartId) => {
    geometriesRef.current.get(id)?.dispose()
    geometriesRef.current.delete(id)
    prevShapeKeys.current.delete(id)
    buildSeq.current.delete(id)
    setGeometries(new Map(geometriesRef.current))
    setScene((prev) => ({ parts: prev.parts.filter((p) => p.id !== id) }))
    setSelectedId((prev) => (prev === id ? null : prev))
  }, [])

  const onDuplicate = useCallback((id: PartId) => {
    setScene((prev) => {
      const idx = prev.parts.findIndex((p) => p.id === id)
      if (idx === -1) return prev
      const orig = prev.parts[idx] as BoardPart
      colorIndex.current += 1
      const clone: BoardPart = {
        ...orig,
        id: `board_${crypto.randomUUID()}`,
        color: PART_COLORS[colorIndex.current % PART_COLORS.length],
        position: { ...orig.position, x: orig.position.x + orig.length + 10 },
        rotation: { x: 0, y: 0, z: 0 },
      }
      const parts = [...prev.parts]
      parts.splice(idx + 1, 0, clone)
      return { parts }
    })
  }, [])

  const onUpdate = useCallback((part: Part) => {
    setScene((prev) => ({ parts: prev.parts.map((p) => (p.id === part.id ? part : p)) }))
  }, [])

  const onSelect = useCallback((id: PartId | null) => {
    setSelectedId(id)
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
  }
}
