import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { wrap } from 'comlink'
import type { OcctWorkerApi, BuildSpec } from '../geom/occt.worker'
import type { ExportSpec } from '../geom/occt'
import type {
  BoardPart,
  CarcaseComponent,
  FaceFrameParams,
  Component,
  ComponentId,
  GroupComponent,
  HardwareItem,
  MaterialDef,
  Part,
  PartId,
  Scene,
  CutDef,
  CutId,
  Joint,
  FaceHit,
  Selection,
  CarcaseParams,
} from './types'
import { shapeKey } from './utils'
import { faceAxes, localNormalToFaceString } from './snapMath'
import { resolvePlacement } from './resolvePlacement'
import { reconcileJoints } from './reconcileJoints'
import { isJointOwned } from './cutOwnership'
import { regenerateComponents } from './regenerateComponents'
import { regenerateDrawers } from './regenerateDrawers'
import { regenerateFaceFrames } from './regenerateFaceFrames'
import { PRESET_MATERIALS, type CarcasePreset } from './carcasePresets'
import { freshSectionIds } from './sectionTree'
import { componentsById, descendantIds, wouldCycle } from './componentTree'
import { jointInvolves } from './jointInvolves'
import { isValidDadoSeat } from '../geom/dado'
import { isValidMortiseTenon } from '../geom/mortisetenon'
import {
  defaultDadoJoint,
  defaultFingerJoint,
  defaultHalfLapJoint,
  defaultMortiseTenonJoint,
  defaultTongueGrooveJoint,
} from './defaultJoint'
import { isValidFingerJoint } from '../geom/fingerjoint'
import { isValidTongueGroove } from '../geom/tonguegroove'
import { PART_COLORS } from './palette'
import { decomposeMatrix, resolveWorldMatrix } from '../geom/transform'
import { parameterForRole } from './carcaseRoles'

interface HistoryEntry {
  label: string
  undo: () => void
  redo: () => void
  coalesceKey?: string
}

const MAX_HISTORY = 50

// The one place a scene mutation becomes geometry. Five stages, and the order is fixed because
// the dependencies run one way. The face frame leads the generators: it reads nothing any of them
// emit — its inputs are the section tree, the cabinet's front rectangle, the frame parameters and
// the materials. Drawers follow for the same reason: a drawer reads nothing a carcase emits — its
// inputs are the section tree, its own parameters and the materials — while the carcase's slide
// machining is a figure about the box that fills the opening, so a pass run the other way round
// would machine the cabinet against a box it had not built yet. Carcases then emit their parts and
// component-owned cuts, and reconcileJoints derives joint cuts and seats from scene.joints last:
// reversed, joints would be derived against parts that do not exist yet.
// Placement leads, and it has to. regenerateDrawers and regenerateComponents genuinely do not read a
// component's position — they write part positions *local* to the component — but reconcileJoints
// does, transitively: deriveJoint resolves each part's world matrix through its ancestors
// (`resolveWorldMatrix(housed, byId)` in geom/dado.ts), so a joint derived before its cabinet has
// moved is derived against the wrong world placement. Running placement last leaves the pass
// non-idempotent — the second call re-derives joint cuts the first got wrong — which is how this was
// caught. A grep for `.position` does not show it; the dependency is through the matrix.
export function applyPipeline(scene: Scene): Scene {
  return reconcileJoints(
    regenerateComponents(regenerateDrawers(regenerateFaceFrames(resolvePlacement(scene)))),
  )
}

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
    // A hand-made board's grain is unknown, so the nester is left free to rotate it. Only the
    // carcase generator states a direction.
    grain: 'free',
    material: '',
    color: PART_COLORS[0],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    rotationOrder: 'XYZ',
    cuts: [],
    visible: true,
    parentId: null,
    driven: false,
  }
}

export interface UseSceneResult {
  scene: Scene
  geometries: Map<PartId, THREE.BufferGeometry>
  errors: Map<PartId, string>
  pendingIds: Set<PartId>
  selectedId: PartId | null
  selection: Selection | null
  occtReady: boolean
  nextLabel: string
  onAdd: (kind: 'board' | 'cylinder') => void
  onRemove: (id: PartId) => void
  onDuplicate: (id: PartId) => void
  onToggleVisible: (id: PartId) => void
  onUpdate: (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => void
  onUpdateMaterial: (name: string, def: MaterialDef) => void
  onUpdateHardware: (items: HardwareItem[]) => void
  onUpdateCut: (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => void
  onAddMitre: (partId: PartId) => void
  onRemoveCut: (partId: PartId, cutId: CutId) => void
  onLinkCuts: (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => void
  onUnlinkCuts: (partId: PartId, cutId: CutId) => void
  onAddJoint: (housingHit: FaceHit, housedHit: FaceHit) => void
  onAddHalfLap: (aId: PartId, bId: PartId) => void
  onAddMortiseTenon: (mortiseHit: FaceHit, tenonHit: FaceHit) => void
  onAddFingerJoint: (hitA: FaceHit, hitB: FaceHit) => void
  onAddTongueGroove: (grooveHit: FaceHit, tongueHit: FaceHit) => void
  onAddComponent: (parentId: ComponentId | null) => void
  onAddCarcase: (preset: CarcasePreset) => void
  onSetFrame: (id: ComponentId, frame: FaceFrameParams | undefined) => void
  onDetachPart: (id: PartId, updater?: (p: Part) => Part) => void
  parameterFor: (
    id: PartId,
    dimension: 'length' | 'width' | 'thickness',
  ) => keyof CarcaseParams | null
  onRemoveComponent: (id: ComponentId) => void
  onReparentComponent: (id: ComponentId, newParentId: ComponentId | null) => void
  onUpdateComponent: (id: ComponentId, updater: (c: Component) => Component) => void
  onUpdateJoint: (jointId: string, updater: (j: Joint) => Joint) => void
  onRemoveJoint: (jointId: string) => void
  onSelect: (next: Selection | null) => void
  replaceScene: (next: Scene) => void
  exportStep: (parts: Part[]) => Promise<string>
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  undo: () => void
  redo: () => void
}

export function buildSpecForPart(part: Part): BuildSpec {
  if (part.kind === 'board') {
    return {
      kind: 'board',
      length: part.length,
      width: part.width,
      thickness: part.thickness,
      cuts: part.cuts,
    }
  }
  return { kind: 'cylinder', diameter: part.diameter, length: part.length, cuts: part.cuts }
}

export function useScene(): UseSceneResult {
  const [scene, setScene] = useState<Scene>(() => ({
    parts: [makeDefaultBoard()],
    // Seeded, not empty: a carcase preset names its materials, and a panel whose material is not
    // in the scene has no thickness to resolve — the first cabinet dropped into a new file would
    // fail validation and never appear.
    materials: { ...PRESET_MATERIALS },
    hardware: [],
    joints: [],
    components: [],
  }))
  const [geometries, setGeometries] = useState<Map<PartId, THREE.BufferGeometry>>(new Map())
  const [errors, setErrors] = useState<Map<PartId, string>>(new Map())
  const [pendingIds, setPendingIds] = useState<Set<PartId>>(new Set())
  const [selection, setSelection] = useState<Selection | null>(null)
  const selectedId = selection?.kind === 'part' ? selection.id : null
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
  const componentLabelCounter = useMemo(() => {
    const max = scene.components.reduce((m, c) => {
      const match = /Group (\d+)/.exec(c.label)
      return match ? Math.max(m, parseInt(match[1], 10)) : m
    }, 0)
    return max > 0 ? max : scene.components.length
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
        .buildPart(buildSpecForPart(part))
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

    // `buildSeq` is the lifecycle registry, not `geometriesRef`: a part enters it before its worker
    // request starts, so it also covers a part deleted before its first geometry ever exists.
    const removed: PartId[] = []
    for (const id of buildSeq.current.keys()) {
      if (!partIds.has(id)) removed.push(id)
    }
    for (const id of removed) {
      geometriesRef.current.get(id)?.dispose()
      geometriesRef.current.delete(id)
      prevShapeKeys.current.delete(id)
      // Deleting the sequence invalidates any in-flight completion: its captured seq can no longer
      // equal the current entry, so stale geometry and stale errors cannot land after deletion.
      buildSeq.current.delete(id)
    }
    if (removed.length > 0) {
      const removedSet = new Set(removed)
      setGeometries(new Map(geometriesRef.current))
      setPendingIds((prev) => {
        const next = new Set(prev)
        for (const id of removedSet) next.delete(id)
        return next
      })
      setErrors((prev) => {
        const next = new Map(prev)
        for (const id of removedSet) next.delete(id)
        return next
      })
    }
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

  // Apply a scene mutation, regenerate component-driven geometry, and record a single
  // undo entry (whole-scene snapshot). Used by every joint- or component-affecting mutation.
  const commitReconciled = useCallback(
    (mutate: (s: Scene) => Scene, label: string, coalesceKey?: string) => {
      const before = sceneRef.current
      const after = applyPipeline(mutate(before))
      setScene(after)
      push({ label, coalesceKey, undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )

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

  const onAdd = useCallback(
    (kind: 'board' | 'cylinder') => {
      if (!occtReady) return
      colorIndex.current += 1
      const color = PART_COLORS[colorIndex.current % PART_COLORS.length]
      let part: Part
      if (kind === 'board') {
        part = {
          kind: 'board',
          id: `board_${crypto.randomUUID()}` as PartId,
          label: `Board ${labelCounter + 1}`,
          length: 200,
          width: 100,
          thickness: 25,
          grain: 'free',
          material: '',
          color,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          cuts: [],
          visible: true,
          parentId: null,
          driven: false,
        }
      } else {
        const dowelMax = sceneRef.current.parts.reduce((m, p) => {
          const match = /^Dowel (\d+)$/.exec(p.label)
          return match ? Math.max(m, parseInt(match[1], 10)) : m
        }, 0)
        part = {
          kind: 'cylinder',
          id: `dowel_${crypto.randomUUID()}` as PartId,
          label: `Dowel ${dowelMax + 1}`,
          diameter: 8,
          length: 100,
          material: '',
          color,
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          rotationOrder: 'XYZ',
          cuts: [],
          visible: true,
          parentId: null,
          driven: false,
        }
      }
      setScene((prev) => ({ ...prev, parts: [...prev.parts, part] }))
      setSelection({ kind: 'part', id: part.id })
      push({
        label: `Add ${part.label}`,
        undo: () => {
          setScene((prev) => ({ ...prev, parts: prev.parts.filter((p) => p.id !== part.id) }))
          setSelection((prev) => (prev?.kind === 'part' && prev.id === part.id ? null : prev))
        },
        redo: () => {
          setScene((prev) => ({ ...prev, parts: [...prev.parts, part] }))
          setSelection({ kind: 'part', id: part.id })
        },
      })
    },
    [occtReady, labelCounter, push],
  )

  const onRemove = useCallback(
    (id: PartId) => {
      const before = sceneRef.current
      const part = before.parts.find((p) => p.id === id)
      if (!part) return
      geometriesRef.current.get(id)?.dispose()
      geometriesRef.current.delete(id)
      prevShapeKeys.current.delete(id)
      // Also invalidate an in-flight build even when this part has never produced geometry yet.
      buildSeq.current.delete(id)
      setGeometries(new Map(geometriesRef.current))
      setPendingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setErrors((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      const after = applyPipeline({
        ...before,
        parts: before.parts.filter((p) => p.id !== id),
        joints: before.joints.filter((j) => !jointInvolves(j, id)),
      })
      setScene(after)
      setSelection((prev) => (prev?.kind === 'part' && prev.id === id ? null : prev))
      push({
        label: `Remove ${part.label}`,
        undo: () => {
          setScene(before)
          setSelection({ kind: 'part', id })
        },
        redo: () => {
          setScene(after)
          setSelection((prev) => (prev?.kind === 'part' && prev.id === id ? null : prev))
        },
      })
    },
    [push],
  )

  const onDuplicate = useCallback(
    (id: PartId) => {
      const orig = sceneRef.current.parts.find((p) => p.id === id)
      if (!orig) return
      colorIndex.current += 1
      const color = PART_COLORS[colorIndex.current % PART_COLORS.length]
      let clone: Part
      if (orig.kind === 'board') {
        clone = {
          ...orig,
          id: `board_${crypto.randomUUID()}` as PartId,
          color,
          position: { ...orig.position, x: orig.position.x + orig.length + 10 },
          rotation: { x: 0, y: 0, z: 0 },
          visible: true,
          cuts: orig.cuts
            .filter((c) => !isJointOwned(c))
            .map((c) =>
              c.kind === 'box'
                ? { ...c, id: `cut_${crypto.randomUUID()}` as CutId, pairedCutId: undefined }
                : { ...c, id: `cut_${crypto.randomUUID()}` as CutId },
            ),
        }
      } else {
        clone = {
          ...orig,
          id: `dowel_${crypto.randomUUID()}` as PartId,
          color,
          position: { ...orig.position, x: orig.position.x + orig.diameter + 10 },
          rotation: { x: 0, y: 0, z: 0 },
          visible: true,
          cuts: orig.cuts.map((c) => ({ ...c, id: `cut_${crypto.randomUUID()}` as CutId })),
        }
      }
      setScene((prev) => {
        const idx = prev.parts.findIndex((p) => p.id === id)
        if (idx === -1) return prev
        const parts = [...prev.parts]
        parts.splice(idx + 1, 0, clone)
        return { ...prev, parts }
      })
      setSelection({ kind: 'part', id: clone.id })
      push({
        label: `Duplicate ${orig.label}`,
        undo: () => {
          setScene((prev) => ({ ...prev, parts: prev.parts.filter((p) => p.id !== clone.id) }))
          setSelection((prev) =>
            prev?.kind === 'part' && prev.id === clone.id ? { kind: 'part', id } : prev,
          )
        },
        redo: () => {
          setScene((prev) => {
            const idx = prev.parts.findIndex((p) => p.id === id)
            if (idx === -1) return prev
            const parts = [...prev.parts]
            parts.splice(idx + 1, 0, clone)
            return { ...prev, parts }
          })
          setSelection({ kind: 'part', id: clone.id })
        },
      })
    },
    [push],
  )

  const onToggleVisible = useCallback(
    (id: PartId) => {
      const part = sceneRef.current.parts.find((p) => p.id === id)
      if (!part) return
      const wasVisible = part.visible
      const nowVisible = !wasVisible
      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => (p.id === id ? { ...p, visible: nowVisible } : p)),
      }))
      push({
        label: wasVisible ? `Hide ${part.label}` : `Show ${part.label}`,
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => (p.id === id ? { ...p, visible: wasVisible } : p)),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => (p.id === id ? { ...p, visible: nowVisible } : p)),
          })),
      })
    },
    [push],
  )

  const onUpdate = useCallback(
    (id: PartId, updater: (p: Part) => Part, historyLabel?: string) => {
      const before = sceneRef.current
      const beforePart = before.parts.find((p) => p.id === id)
      if (!beforePart) return
      const afterPart = updater(beforePart)
      const label = historyLabel ?? `Update ${afterPart.label}`
      const coalesceKey = historyLabel !== undefined ? undefined : `update-${id}`
      // A driven part's dimensions are owned by its carcase, so an edit to one has to go through
      // the pipeline that regenerates it. Skipping it here would leave the scene in a state where
      // a part disagrees with the parameters that produced it until some unrelated mutation
      // happens to reconcile it — and exports and the geometry cache would capture the disagreement.
      const needsPipeline = before.joints.some((j) => jointInvolves(j, id)) || beforePart.driven

      if (needsPipeline) {
        const after = applyPipeline({
          ...before,
          parts: before.parts.map((p) => (p.id === id ? afterPart : p)),
        })
        setScene(after)
        push({ label, coalesceKey, undo: () => setScene(before), redo: () => setScene(after) })
        return
      }

      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => (p.id === id ? afterPart : p)),
      }))
      push({
        label,
        coalesceKey,
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => (p.id === id ? beforePart : p)),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => (p.id === id ? afterPart : p)),
          })),
      })
    },
    [push],
  )

  const onUpdateCut = useCallback(
    (partId: PartId, cutId: CutId, updater: (c: CutDef) => CutDef) => {
      const part = sceneRef.current.parts.find((p) => p.id === partId)
      if (part?.kind !== 'board') return
      const beforeA = part.cuts.find((c) => c.id === cutId)
      if (!beforeA) return
      if (isJointOwned(beforeA)) return // derived cut — edit via the joint
      const afterA = updater(beforeA)

      if (afterA.kind === 'box' && afterA.pairedCutId) {
        const colonIdx = afterA.pairedCutId.indexOf(':')
        const pairedPartId = afterA.pairedCutId.slice(0, colonIdx) as PartId
        const pairedCutIdStr = afterA.pairedCutId.slice(colonIdx + 1) as CutId
        const pairedPart = sceneRef.current.parts.find((p) => p.id === pairedPartId)
        const beforeB =
          pairedPart?.kind === 'board'
            ? pairedPart.cuts.find((c) => c.id === pairedCutIdStr)
            : undefined

        if (pairedPart && beforeB && beforeB.kind === 'box') {
          const axesA = faceAxes(afterA.face)
          const axesB = faceAxes(beforeB.face)
          const afterB: CutDef = {
            ...beforeB,
            size: {
              ...beforeB.size,
              [axesB.u]: afterA.size[axesA.u],
              [axesB.v]: afterA.size[axesA.v],
            },
          }

          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partId)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) }
              if (p.id === pairedPartId)
                return { ...p, cuts: p.cuts.map((c) => (c.id === pairedCutIdStr ? afterB : c)) }
              return p
            }),
          }))

          push({
            label: 'Edit cut',
            coalesceKey: `cut-${partId}-${cutId}`,
            undo: () =>
              setScene((prev) => ({
                ...prev,
                parts: prev.parts.map((p) => {
                  if (p.kind !== 'board') return p
                  if (p.id === partId)
                    return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? beforeA : c)) }
                  if (p.id === pairedPartId)
                    return {
                      ...p,
                      cuts: p.cuts.map((c) => (c.id === pairedCutIdStr ? beforeB : c)),
                    }
                  return p
                }),
              })),
            redo: () =>
              setScene((prev) => ({
                ...prev,
                parts: prev.parts.map((p) => {
                  if (p.kind !== 'board') return p
                  if (p.id === partId)
                    return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) }
                  if (p.id === pairedPartId)
                    return { ...p, cuts: p.cuts.map((c) => (c.id === pairedCutIdStr ? afterB : c)) }
                  return p
                }),
              })),
          })
          return
        }
      }

      // No paired cut — single-part update
      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) =>
          p.id === partId && p.kind === 'board'
            ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) }
            : p,
        ),
      }))
      push({
        label: 'Edit cut',
        coalesceKey: `cut-${partId}-${cutId}`,
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) =>
              p.id === partId && p.kind === 'board'
                ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? beforeA : c)) }
                : p,
            ),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) =>
              p.id === partId && p.kind === 'board'
                ? { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? afterA : c)) }
                : p,
            ),
          })),
      })
    },
    [push],
  )

  const onAddMitre = useCallback(
    (partId: PartId) => {
      const part = sceneRef.current.parts.find((p) => p.id === partId)
      if (part?.kind !== 'board') return
      const mitreCount = part.cuts.filter((c) => c.kind === 'mitre').length
      const mitre: CutDef = {
        kind: 'mitre',
        id: `cut_${crypto.randomUUID()}` as CutId,
        label: `Mitre ${mitreCount + 1}`,
        end: '+X',
        axis: 'Z',
        angle: 45,
      }
      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) =>
          p.id === partId && p.kind === 'board' ? { ...p, cuts: [...p.cuts, mitre] } : p,
        ),
      }))
      push({
        label: 'Add mitre',
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) =>
              p.id === partId && p.kind === 'board'
                ? { ...p, cuts: p.cuts.filter((c) => c.id !== mitre.id) }
                : p,
            ),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) =>
              p.id === partId && p.kind === 'board' ? { ...p, cuts: [...p.cuts, mitre] } : p,
            ),
          })),
      })
    },
    [push],
  )

  const onRemoveCut = useCallback(
    (partId: PartId, cutId: CutId) => {
      const part = sceneRef.current.parts.find((p) => p.id === partId)
      if (part?.kind !== 'board') return
      const removedCut = part.cuts.find((c) => c.id === cutId)
      if (!removedCut) return
      if (isJointOwned(removedCut)) return // derived cut — remove the joint

      const affectedPairs: Array<{ partId: PartId; cutId: CutId }> = []
      for (const p of sceneRef.current.parts) {
        if (p.kind !== 'board') continue
        for (const c of p.cuts) {
          if (c.kind === 'box' && c.pairedCutId === `${partId}:${cutId}`) {
            affectedPairs.push({ partId: p.id, cutId: c.id })
          }
        }
      }

      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => {
          if (p.kind !== 'board') return p
          if (p.id === partId) return { ...p, cuts: p.cuts.filter((c) => c.id !== cutId) }
          const pair = affectedPairs.find((ap) => ap.partId === p.id)
          if (pair) {
            return {
              ...p,
              cuts: p.cuts.map((c) => (c.id === pair.cutId ? { ...c, pairedCutId: undefined } : c)),
            }
          }
          return p
        }),
      }))

      push({
        label: 'Remove cut',
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partId) return { ...p, cuts: [...p.cuts, removedCut] }
              const pair = affectedPairs.find((ap) => ap.partId === p.id)
              if (pair) {
                return {
                  ...p,
                  cuts: p.cuts.map((c) =>
                    c.id === pair.cutId ? { ...c, pairedCutId: `${partId}:${cutId}` } : c,
                  ),
                }
              }
              return p
            }),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partId) return { ...p, cuts: p.cuts.filter((c) => c.id !== cutId) }
              const pair = affectedPairs.find((ap) => ap.partId === p.id)
              if (pair) {
                return {
                  ...p,
                  cuts: p.cuts.map((c) =>
                    c.id === pair.cutId ? { ...c, pairedCutId: undefined } : c,
                  ),
                }
              }
              return p
            }),
          })),
      })
    },
    [push],
  )

  const onLinkCuts = useCallback(
    (partIdA: PartId, cutIdA: CutId, partIdB: PartId, cutIdB: CutId) => {
      const partA = sceneRef.current.parts.find((p) => p.id === partIdA)
      const partB = sceneRef.current.parts.find((p) => p.id === partIdB)
      if (partA?.kind !== 'board' || partB?.kind !== 'board') return
      const cutA = partA.cuts.find((c) => c.id === cutIdA)
      const cutB = partB.cuts.find((c) => c.id === cutIdB)
      if (!cutA || !cutB) return
      if (cutA.kind !== 'box' || cutB.kind !== 'box') return // linking is box-only
      if (isJointOwned(cutA) || isJointOwned(cutB)) return // derived cuts can't be paired

      const axesA = faceAxes(cutA.face)
      const axesB = faceAxes(cutB.face)

      const linkedA: CutDef = { ...cutA, pairedCutId: `${partIdB}:${cutIdB}` }
      const linkedB: CutDef = {
        ...cutB,
        pairedCutId: `${partIdA}:${cutIdA}`,
        size: { ...cutB.size, [axesB.u]: cutA.size[axesA.u], [axesB.v]: cutA.size[axesA.v] },
      }

      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => {
          if (p.kind !== 'board') return p
          if (p.id === partIdA)
            return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdA ? linkedA : c)) }
          if (p.id === partIdB)
            return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdB ? linkedB : c)) }
          return p
        }),
      }))

      push({
        label: 'Link cuts',
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partIdA)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdA ? cutA : c)) }
              if (p.id === partIdB)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdB ? cutB : c)) }
              return p
            }),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partIdA)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdA ? linkedA : c)) }
              if (p.id === partIdB)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutIdB ? linkedB : c)) }
              return p
            }),
          })),
      })
    },
    [push],
  )

  const onUnlinkCuts = useCallback(
    (partId: PartId, cutId: CutId) => {
      const part = sceneRef.current.parts.find((p) => p.id === partId)
      if (part?.kind !== 'board') return
      const cut = part.cuts.find((c) => c.id === cutId)
      if (!cut || cut.kind !== 'box' || !cut.pairedCutId) return

      const sep = cut.pairedCutId.indexOf(':')
      const matingPartId = cut.pairedCutId.slice(0, sep) as PartId
      const matingCutId = cut.pairedCutId.slice(sep + 1) as CutId
      const matingPart = sceneRef.current.parts.find((p) => p.id === matingPartId)
      const matingCut =
        matingPart?.kind === 'board' ? matingPart.cuts.find((c) => c.id === matingCutId) : undefined

      const unlinked = { ...cut, pairedCutId: undefined }
      const unlinkedMating =
        matingCut && matingCut.kind === 'box' ? { ...matingCut, pairedCutId: undefined } : null

      setScene((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => {
          if (p.kind !== 'board') return p
          if (p.id === partId)
            return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? unlinked : c)) }
          if (p.id === matingPartId && unlinkedMating) {
            return { ...p, cuts: p.cuts.map((c) => (c.id === matingCutId ? unlinkedMating : c)) }
          }
          return p
        }),
      }))

      push({
        label: 'Unlink cuts',
        undo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partId)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? cut : c)) }
              if (p.id === matingPartId && matingCut) {
                return { ...p, cuts: p.cuts.map((c) => (c.id === matingCutId ? matingCut : c)) }
              }
              return p
            }),
          })),
        redo: () =>
          setScene((prev) => ({
            ...prev,
            parts: prev.parts.map((p) => {
              if (p.kind !== 'board') return p
              if (p.id === partId)
                return { ...p, cuts: p.cuts.map((c) => (c.id === cutId ? unlinked : c)) }
              if (p.id === matingPartId && unlinkedMating) {
                return {
                  ...p,
                  cuts: p.cuts.map((c) => (c.id === matingCutId ? unlinkedMating : c)),
                }
              }
              return p
            }),
          })),
      })
    },
    [push],
  )

  const onAddJoint = useCallback(
    (housingHit: FaceHit, housedHit: FaceHit) => {
      const s = sceneRef.current
      const housing = s.parts.find((p) => p.id === housingHit.partId)
      const housed = s.parts.find((p) => p.id === housedHit.partId)
      if (housing?.kind !== 'board' || housed?.kind !== 'board' || housing.id === housed.id) return
      const housingFace = localNormalToFaceString(housingHit.localFaceNormal)
      const housedEnd = localNormalToFaceString(housedHit.localFaceNormal)
      const byId = componentsById(s.components)
      if (!isValidDadoSeat(housing, housingFace, housed, housedEnd, byId)) return

      const n = s.joints.filter((j) => j.kind === 'dado').length + 1
      const joint: Joint = defaultDadoJoint(
        housing,
        housed,
        housingFace,
        housedEnd,
        `joint_${crypto.randomUUID()}`,
        `Dado ${n}`,
        byId,
      )
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add dado')
      setSelection({ kind: 'part', id: housing.id })
    },
    [commitReconciled],
  )

  const onAddHalfLap = useCallback(
    (aId: PartId, bId: PartId) => {
      const s = sceneRef.current
      const a = s.parts.find((p) => p.id === aId)
      const b = s.parts.find((p) => p.id === bId)
      if (a?.kind !== 'board' || b?.kind !== 'board' || a.id === b.id) return
      const n = s.joints.filter((j) => j.kind === 'halflap').length + 1
      const joint: Joint = defaultHalfLapJoint(
        a,
        b,
        `joint_${crypto.randomUUID()}`,
        `Half-lap ${n}`,
      )
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add half-lap')
      setSelection({ kind: 'part', id: a.id })
    },
    [commitReconciled],
  )

  const onAddMortiseTenon = useCallback(
    (mortiseHit: FaceHit, tenonHit: FaceHit) => {
      const s = sceneRef.current
      const mortise = s.parts.find((p) => p.id === mortiseHit.partId)
      const tenon = s.parts.find((p) => p.id === tenonHit.partId)
      if (mortise?.kind !== 'board' || tenon?.kind !== 'board' || mortise.id === tenon.id) return
      const mortiseFace = localNormalToFaceString(mortiseHit.localFaceNormal)
      const tenonEnd = localNormalToFaceString(tenonHit.localFaceNormal)
      const byId = componentsById(s.components)
      if (!isValidMortiseTenon(mortise, mortiseFace, tenon, tenonEnd, byId)) return
      const n = s.joints.filter((j) => j.kind === 'mortise-tenon').length + 1
      const joint: Joint = defaultMortiseTenonJoint(
        mortise,
        tenon,
        mortiseFace,
        tenonEnd,
        `joint_${crypto.randomUUID()}`,
        `Mortise & tenon ${n}`,
        byId,
      )
      commitReconciled(
        (prev) => ({ ...prev, joints: [...prev.joints, joint] }),
        'Add mortise & tenon',
      )
      setSelection({ kind: 'part', id: mortise.id })
    },
    [commitReconciled],
  )

  const onAddFingerJoint = useCallback(
    (hitA: FaceHit, hitB: FaceHit) => {
      const s = sceneRef.current
      const a = s.parts.find((p) => p.id === hitA.partId)
      const b = s.parts.find((p) => p.id === hitB.partId)
      if (a?.kind !== 'board' || b?.kind !== 'board' || a.id === b.id) return
      const endA = localNormalToFaceString(hitA.localFaceNormal)
      const endB = localNormalToFaceString(hitB.localFaceNormal)
      if (!isValidFingerJoint(a, endA, b, endB, componentsById(s.components))) return
      const n = s.joints.filter((j) => j.kind === 'finger').length + 1
      const joint: Joint = defaultFingerJoint(
        a,
        b,
        endA,
        endB,
        `joint_${crypto.randomUUID()}`,
        `Finger joint ${n}`,
      )
      commitReconciled((prev) => ({ ...prev, joints: [...prev.joints, joint] }), 'Add finger joint')
      setSelection({ kind: 'part', id: a.id })
    },
    [commitReconciled],
  )

  const onAddTongueGroove = useCallback(
    (grooveHit: FaceHit, tongueHit: FaceHit) => {
      const s = sceneRef.current
      const groove = s.parts.find((p) => p.id === grooveHit.partId)
      const tongue = s.parts.find((p) => p.id === tongueHit.partId)
      if (groove?.kind !== 'board' || tongue?.kind !== 'board' || groove.id === tongue.id) return
      const grooveEdge = localNormalToFaceString(grooveHit.localFaceNormal)
      const tongueEdge = localNormalToFaceString(tongueHit.localFaceNormal)
      const byId = componentsById(s.components)
      if (!isValidTongueGroove(groove, grooveEdge, tongue, tongueEdge, byId)) return
      const n = s.joints.filter((j) => j.kind === 'tongue-groove').length + 1
      const joint: Joint = defaultTongueGrooveJoint(
        groove,
        tongue,
        grooveEdge,
        tongueEdge,
        `joint_${crypto.randomUUID()}`,
        `Tongue & groove ${n}`,
      )
      commitReconciled(
        (prev) => ({ ...prev, joints: [...prev.joints, joint] }),
        'Add tongue & groove',
      )
      setSelection({ kind: 'part', id: groove.id })
    },
    [commitReconciled],
  )

  const onUpdateJoint = useCallback(
    (jointId: string, updater: (j: Joint) => Joint) => {
      if (!sceneRef.current.joints.some((j) => j.id === jointId)) return
      commitReconciled(
        (prev) => ({
          ...prev,
          joints: prev.joints.map((j) => (j.id === jointId ? updater(j) : j)),
        }),
        'Edit joint',
        `joint-${jointId}`,
      )
    },
    [commitReconciled],
  )

  const onRemoveJoint = useCallback(
    (jointId: string) => {
      const joint = sceneRef.current.joints.find((j) => j.id === jointId)
      if (!joint) return
      const label =
        joint.kind === 'screw'
          ? 'Remove screw fixing'
          : joint.kind === 'tongue-groove'
            ? 'Remove tongue & groove'
            : joint.kind === 'finger'
              ? 'Remove finger joint'
              : joint.kind === 'mortise-tenon'
                ? 'Remove mortise & tenon'
                : joint.kind === 'halflap'
                  ? 'Remove half-lap'
                  : 'Remove dado'
      commitReconciled(
        (prev) => ({ ...prev, joints: prev.joints.filter((j) => j.id !== jointId) }),
        label,
      )
    },
    [commitReconciled],
  )

  const onSelect = useCallback((next: Selection | null) => {
    setSelection(next)
  }, [])

  const onUpdateMaterial = useCallback(
    (name: string, def: MaterialDef) => {
      const beforeMaterials = sceneRef.current.materials
      setScene((prev) => ({ ...prev, materials: { ...prev.materials, [name]: def } }))
      push({
        label: `Set ${name} cost`,
        coalesceKey: `material:${name}`,
        undo: () => setScene((prev) => ({ ...prev, materials: beforeMaterials })),
        redo: () =>
          setScene((prev) => ({ ...prev, materials: { ...prev.materials, [name]: def } })),
      })
    },
    [push],
  )

  const onUpdateHardware = useCallback(
    (items: HardwareItem[]) => {
      const beforeHardware = sceneRef.current.hardware
      setScene((prev) => ({ ...prev, hardware: items }))
      push({
        label: 'Edit hardware',
        undo: () => setScene((prev) => ({ ...prev, hardware: beforeHardware })),
        redo: () => setScene((prev) => ({ ...prev, hardware: items })),
      })
    },
    [push],
  )

  const onAddComponent = useCallback(
    (parentId: ComponentId | null) => {
      const component: GroupComponent = {
        kind: 'group',
        id: `cmp_${crypto.randomUUID()}`,
        label: `Group ${componentLabelCounter + 1}`,
        parentId,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
      }
      setScene((prev) => ({ ...prev, components: [...prev.components, component] }))
      push({
        label: 'Add group',
        undo: () =>
          setScene((prev) => ({
            ...prev,
            components: prev.components.filter((c) => c.id !== component.id),
          })),
        redo: () => setScene((prev) => ({ ...prev, components: [...prev.components, component] })),
      })
    },
    [componentLabelCounter, push],
  )

  const onDetachPart = useCallback(
    (id: PartId, updater?: (p: Part) => Part) => {
      const before = sceneRef.current
      // The edit that prompted the detach has to land in this same transition. `sceneRef` only
      // catches up after render, so a separate `onUpdate` call from the same handler would read
      // the still-driven part and regenerate the detachment away.
      //
      // Clearing `role` is the load-bearing half: it is the only thing that stops a later
      // regeneration from reclaiming the part when its role comes back.
      // Piped like every other mutation: the freed role has no part and the joints still name the
      // detached one until something reconciles them, and nothing else here will.
      const after = applyPipeline({
        ...before,
        parts: before.parts.map((p) =>
          p.id === id ? { ...(updater ? updater(p) : p), driven: false, role: undefined } : p,
        ),
      })
      setScene(after)
      push({ label: 'Detach part', undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )

  const parameterFor = useCallback(
    (id: PartId, dimension: 'length' | 'width' | 'thickness'): keyof CarcaseParams | null => {
      const part = sceneRef.current.parts.find((p) => p.id === id)
      if (!part || !part.driven || part.parentId === null) return null
      const owner = sceneRef.current.components.find((c) => c.id === part.parentId)
      if (owner?.kind !== 'carcase') return null
      return parameterForRole(part.role, dimension, owner.params)
    },
    [],
  )

  const onAddCarcase = useCallback(
    (preset: CarcasePreset) => {
      const component: CarcaseComponent = {
        kind: 'carcase',
        id: `cmp_${crypto.randomUUID()}`,
        label: preset.name,
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        rotationOrder: 'XYZ',
        visible: true,
        // Re-id, never share. `preset.params` is one object built at module evaluation, so assigning
        // it directly gives every cabinet from that preset the same section ids — and role keys
        // carry those ids, so two Base 600s name the same openings and the same
        // `front-{sectionId}-0` boards. Every consumer then needs a cabinet id beside the section id
        // to tell them apart, and the ones that forget are silently wrong rather than broken.
        params: { ...preset.params, section: freshSectionIds(preset.params.section) },
      }
      // One undo entry covers the component and every part the pipeline generates from it.
      commitReconciled(
        (before) => ({ ...before, components: [...before.components, component] }),
        `Add ${preset.name}`,
      )
    },
    [commitReconciled],
  )

  // Turning a frame on is the moment a cabinet first needs its frame material, and an old file
  // does not carry it — the migration deliberately adds none. So it is added here, in the same undo
  // step as the frame: one gesture, one entry. Only when the scene has no material of that name at
  // all, so a user's own definition of it is never overwritten.
  const onSetFrame = useCallback(
    (id: ComponentId, frame: FaceFrameParams | undefined) => {
      commitReconciled(
        (before) => {
          const cabinet = before.components.find((c) => c.id === id)
          if (cabinet?.kind !== 'carcase') return before
          const name = cabinet.params.frameMaterial
          const seed = frame !== undefined && before.materials[name] === undefined
          const preset = PRESET_MATERIALS[name]
          return {
            ...before,
            materials:
              seed && preset !== undefined
                ? { ...before.materials, [name]: preset }
                : before.materials,
            components: before.components.map((c) =>
              c.id === id && c.kind === 'carcase' ? { ...c, params: { ...c.params, frame } } : c,
            ),
          }
        },
        frame === undefined ? 'Remove face frame' : 'Add face frame',
      )
    },
    [commitReconciled],
  )

  const onRemoveComponent = useCallback(
    (id: ComponentId) => {
      const doomed = new Set<ComponentId>([
        id,
        ...descendantIds(id, sceneRef.current.components, sceneRef.current.parts).componentIds,
      ])
      commitReconciled((before) => {
        const { componentIds, partIds } = descendantIds(id, before.components, before.parts)
        const doomedComponents = new Set([id, ...componentIds])
        // Built from the pre-delete component list: the parts being promoted still reference
        // components that are about to be removed, so their world placement must be resolved
        // against the tree as it stands now, not as it will be.
        const doomedById = componentsById(before.components)
        const doomedParts = before.parts
          .filter((p) => p.driven && partIds.includes(p.id))
          .map((p) => p.id)

        return {
          ...before,
          components: before.components.filter((c) => !doomedComponents.has(c.id)),
          // A detached part is the user's, not the component's: it survives its container
          // and returns to top level rather than being deleted with it.
          parts: before.parts
            .filter((p) => !doomedParts.includes(p.id))
            .map((p) => {
              if (p.parentId === null || !doomedComponents.has(p.parentId)) return p
              // A detached part survives its container, and must survive it in place: its local
              // placement was relative to a component that no longer exists, so bake the resolved
              // world placement in rather than letting the part jump by the lost transform.
              const { position, rotation } = decomposeMatrix(resolveWorldMatrix(p, doomedById))
              return { ...p, parentId: null, position, rotation }
            }),
          joints: before.joints.filter(
            (j) =>
              (j.sourceComponentId === undefined || !doomedComponents.has(j.sourceComponentId)) &&
              !doomedParts.some((partId) => jointInvolves(j, partId)),
          ),
        }
      }, 'Delete component')
      // A selection pointing at a component that is gone — or at a section of one — is a dangling
      // reference: for a component the panel would try to render it, and for a section it would
      // leave a pick naming an opening in a cabinet nothing holds. A part selection is left
      // alone: the part itself may well have survived.
      setSelection((prev) => {
        if (prev?.kind === 'component' && doomed.has(prev.id)) return null
        if (prev?.kind === 'section' && doomed.has(prev.cabinetId)) return null
        return prev
      })
    },
    [commitReconciled],
  )

  const onReparentComponent = useCallback(
    (id: ComponentId, newParentId: ComponentId | null) => {
      const before = sceneRef.current
      if (wouldCycle(before.components, id, newParentId)) return
      const after: Scene = {
        ...before,
        components: before.components.map((c) =>
          c.id === id ? { ...c, parentId: newParentId } : c,
        ),
      }
      setScene(after)
      push({ label: 'Move component', undo: () => setScene(before), redo: () => setScene(after) })
    },
    [push],
  )

  const onUpdateComponent = useCallback(
    (id: ComponentId, updater: (c: Component) => Component) => {
      commitReconciled(
        (before) => ({
          ...before,
          components: before.components.map((c) => (c.id === id ? updater(c) : c)),
        }),
        'Edit component',
        `component-${id}`,
      )
    },
    [commitReconciled],
  )

  const replaceScene = useCallback((next: Scene) => {
    for (const geo of geometriesRef.current.values()) geo.dispose()
    geometriesRef.current.clear()
    prevShapeKeys.current.clear()
    buildSeq.current.clear()
    pastRef.current = []
    futureRef.current = []
    setUndoState({ canUndo: false, canRedo: false, undoLabel: null, redoLabel: null })
    setScene(applyPipeline(next))
    setSelection(null)
    setPendingIds(new Set())
    setErrors(new Map())
    setGeometries(new Map())
  }, [])

  const exportStep = useCallback(async (parts: Part[]): Promise<string> => {
    const byId = componentsById(sceneRef.current.components)
    const specs: ExportSpec[] = parts.map((p) =>
      p.kind === 'board'
        ? {
            kind: 'board',
            label: p.label,
            length: p.length,
            width: p.width,
            thickness: p.thickness,
            cuts: p.cuts,
            matrix: Array.from(resolveWorldMatrix(p, byId)),
          }
        : {
            kind: 'cylinder',
            label: p.label,
            diameter: p.diameter,
            length: p.length,
            cuts: p.cuts,
            matrix: Array.from(resolveWorldMatrix(p, byId)),
          },
    )
    return getOcct().exportStep(specs)
  }, [])

  return {
    scene,
    geometries,
    errors,
    pendingIds,
    selectedId,
    selection,
    occtReady,
    nextLabel: `Board ${labelCounter + 1}`,
    onAdd,
    onRemove,
    onDuplicate,
    onToggleVisible,
    onUpdate,
    onUpdateMaterial,
    onUpdateHardware,
    onUpdateCut,
    onAddMitre,
    onRemoveCut,
    onLinkCuts,
    onUnlinkCuts,
    onAddJoint,
    onAddHalfLap,
    onAddMortiseTenon,
    onAddFingerJoint,
    onAddTongueGroove,
    onAddComponent,
    onAddCarcase,
    onSetFrame,
    onDetachPart,
    parameterFor,
    onRemoveComponent,
    onReparentComponent,
    onUpdateComponent,
    onUpdateJoint,
    onRemoveJoint,
    onSelect,
    replaceScene,
    exportStep,
    canUndo: undoState.canUndo,
    canRedo: undoState.canRedo,
    undoLabel: undoState.undoLabel,
    redoLabel: undoState.redoLabel,
    undo,
    redo,
  }
}
