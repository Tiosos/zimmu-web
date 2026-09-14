import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import type {
  Part,
  CutDef,
  MaterialDef,
  Scene,
  CameraState,
  ZimmuFile,
  Joint,
  CarcaseParams,
  DrawerComponent,
} from './types'
import * as idb from './idb'
import { breakComponentCycles, promoteOrphans } from './componentTree'
import {
  DEFAULT_BACK_MATERIAL,
  DEFAULT_CARCASE_MATERIAL,
  DEFAULT_FRONT_MATERIAL,
  PRESET_MATERIALS,
} from './carcasePresets'
import { legacyToSection } from './migrateSections'
import { seedInteriors } from './sectionInterior'
import type { Section } from './sectionTree'
import { validateCurrentFile, validateLegacyFileInput } from './fileValidation'

export const FILE_FORMAT_VERSION = 18

const PICKER_TYPES = [{ description: 'Zimmu Project', accept: { 'application/json': ['.zimmu'] } }]

interface UseFileInput {
  scene: Scene
  getCameraState: () => CameraState
  onFileLoaded: (envelope: ZimmuFile) => void
}

export interface UseFileResult {
  fileReady: boolean
  fileName: string | null
  projectName: string
  isDirty: boolean
  fileError: string | null
  newFile: () => Promise<void>
  openFile: () => Promise<void>
  saveFile: () => Promise<void>
  saveAsFile: () => Promise<void>
  setProjectName: (name: string) => void
}

function serialize(envelope: ZimmuFile): string {
  return JSON.stringify(
    envelope,
    (_key, value: unknown) => (typeof value === 'number' ? parseFloat(value.toFixed(6)) : value),
    2,
  )
}

const KNOWN_JOINT_KINDS = ['dado', 'halflap', 'mortise-tenon', 'finger', 'tongue-groove', 'screw']

// Early migration fixtures — and real files from before the full envelope settled — can omit
// project metadata that the scene migration itself never reads. Preserve that historical tolerance
// without weakening validation: defaults are supplied only when a field is absent; an explicitly
// malformed value still overrides the default and is rejected by validateLegacyFileInput.
function withLegacyEnvelopeDefaults(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const root = value as Record<string, unknown>
  return {
    name: 'Untitled',
    appVersion: '0.0.0',
    units: 'mm',
    createdAt: '',
    updatedAt: '',
    camera: {
      position: { x: 250, y: -200, z: 150 },
      target: { x: 0, y: 0, z: 0 },
    },
    ...root,
  }
}

// v13→v14: a pre-v14 file states one thickness per carcase, v14 one thickness per material. Two
// carcases may legally have shared a material name at different thicknesses, which v14 cannot
// represent — so a name already spoken for at another thickness forks into a suffixed one instead
// of being quietly reused, which would resize one of the two cabinets. A definition the file
// already carries keeps its other fields: this adds a thickness, it does not replace the material.
function materialAtThickness(
  materials: Record<string, MaterialDef>,
  name: string,
  thickness: number | undefined,
): string {
  // A v14 file states no per-carcase thickness — its slots already name materials that carry one.
  if (thickness === undefined) return name
  for (let attempt = 0; ; attempt++) {
    const candidate: string =
      attempt === 0
        ? name
        : attempt === 1
          ? `${name} (${thickness}mm)`
          : `${name} (${thickness}mm) ${attempt}`
    const def: MaterialDef | undefined = materials[candidate]
    if (def === undefined) {
      materials[candidate] = { thickness }
      return candidate
    }
    if (def.thickness === undefined) {
      materials[candidate] = { ...def, thickness }
      return candidate
    }
    if (def.thickness === thickness) return candidate
  }
}

export function parseFile(text: string): ZimmuFile {
  // JSON is untrusted until the legacy-compatible boundary has proved the container types and the
  // geometry-bearing values the migration code reads. Only historically optional envelope fields
  // are defaulted first; scene data remains untouched and untrusted until validation succeeds.
  const raw = validateLegacyFileInput(withLegacyEnvelopeDefaults(JSON.parse(text) as unknown))
  if (raw.version > FILE_FORMAT_VERSION) {
    console.warn(
      `zimmu: file version ${raw.version} is newer than app version ${FILE_FORMAT_VERSION} — attempting to parse`,
    )
  }
  const parts = (raw.scene?.parts ?? []).filter((p): p is Part => {
    if (p.kind !== 'board' && p.kind !== 'cylinder') {
      console.warn(`zimmu: unknown part kind "${(p as { kind: string }).kind}" — skipped`)
      return false
    }
    return true
  })
  // Hoisted out of the scene literal below because the carcase migration writes into it: each
  // carcase has to see the definitions the ones before it added, or a shared name could not be
  // told apart from a colliding one.
  const materials: Record<string, MaterialDef> = {
    ...((raw.scene.materials as Record<string, MaterialDef> | undefined) ?? {}),
  }
  const scene: Scene = {
    parts: parts.map((p) =>
      p.kind === 'board'
        ? {
            ...p,
            // v2→v3: cuts gained a discriminated `kind`; legacy cuts are box cuts.
            cuts: ((p.cuts ?? []) as unknown as Array<Record<string, unknown>>).map((c) =>
              'kind' in c ? c : { ...c, kind: 'box' },
            ) as unknown as CutDef[],
            visible: p.visible ?? true,
            material: p.material ?? '',
            parentId: p.parentId ?? null,
            driven: p.driven ?? false,
            // Required on BoardPart, so an absent field would reach every read site as undefined.
            // Normalised here and nowhere else — no read site carries `?? 'free'`.
            grain: p.grain ?? 'free',
          }
        : {
            ...p,
            cuts: Array.isArray(p.cuts) ? p.cuts : [],
            visible: p.visible ?? true,
            material: p.material ?? '',
            parentId: p.parentId ?? null,
            driven: p.driven ?? false,
          },
    ),
    materials,
    // Per-item so linkedPartIds/linkedComponentIds default to [] when absent — both are read
    // unguarded (.includes) in the UI, so a file predating either field would otherwise crash.
    hardware: (raw.scene.hardware ?? []).map((h) => ({
      ...h,
      linkedPartIds: h.linkedPartIds ?? [],
      linkedComponentIds: h.linkedComponentIds ?? [],
    })),
    // v4→v5: profile (+ tongueThickness/rabbetFace). v5→v6: stopStart/stopEnd.
    // v6→v7: half-lap joints (kind 'halflap'); legacy joints are all dados.
    // v7→v8: mortise-tenon joints (kind 'mortise-tenon').
    // v8→v9: finger joints (kind 'finger').
    // v9→v10: tongue-groove joints (kind 'tongue-groove').
    // v14→v15: screw joints (kind 'screw').
    joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>)
      // Dropped the way an unknown part kind is, rather than kept verbatim. A newer file version
      // only warns above and parses on, so without this a joint kind from a future release reaches
      // the render path, where the exhaustiveness guard in jointChecklist's jointPairIds throws
      // and blanks the app instead of degrading. Pre-v7 joints carry no kind at all and are
      // dados — those must survive.
      .filter((j) => {
        if (j.kind === undefined || KNOWN_JOINT_KINDS.includes(j.kind as string)) return true
        console.warn(`zimmu: unknown joint kind "${j.kind as string}" — skipped`)
        return false
      })
      .map((j) =>
        // No field defaults: every screw field ships with the kind in v15, so there is no older
        // shape to fill in. The branch exists so a screw joint does not fall through to the dado
        // default below, which would spread a groove's fields across it.
        j.kind === 'screw'
          ? ({ driven: false, ...j } as unknown as Joint)
          : j.kind === 'tongue-groove'
            ? ({
                tongueThickness: 6,
                tongueDepth: 8,
                clearance: 0,
                driven: false,
                ...j,
              } as unknown as Joint)
            : j.kind === 'finger'
              ? ({ fingerCount: 0, clearance: 0, driven: false, ...j } as unknown as Joint)
              : j.kind === 'mortise-tenon'
                ? ({
                    tenonLength: 0,
                    tenonThickness: 0,
                    tenonWidth: 0,
                    clearance: 0,
                    through: false,
                    offsetU: 0,
                    offsetV: 0,
                    driven: false,
                    ...j,
                  } as unknown as Joint)
                : j.kind === 'halflap'
                  ? ({ split: 0.5, clearance: 0, driven: false, ...j } as unknown as Joint)
                  : ({
                      kind: 'dado' as const,
                      profile: 'plain' as const,
                      tongueThickness: 6,
                      rabbetFace: '+Z' as const,
                      stopStart: 0,
                      stopEnd: 0,
                      driven: false,
                      ...j,
                    } as unknown as Joint),
      ),
    // v10→v11: component tree. Legacy files have no components and no parentage.
    components: (raw.scene.components ?? []).map((c) => {
      const base = {
        ...c,
        parentId: c.parentId ?? null,
        visible: c.visible ?? true,
        rotationOrder: 'XYZ' as const,
      }
      // `CarcaseComponent` declares `params` required, so a carcase without them is a shape the
      // type says cannot exist. Demote rather than fabricate defaults: a group keeps the label,
      // the placement and every child part, and loses only the ability to regenerate.
      if (base.kind === 'carcase' && base.params === undefined) {
        console.warn(`zimmu: carcase "${base.id}" has no params — loaded as a group`)
        return {
          kind: 'group' as const,
          id: base.id,
          label: base.label,
          parentId: base.parentId,
          position: base.position,
          rotation: base.rotation,
          rotationOrder: base.rotationOrder,
          visible: base.visible,
        }
      }
      if (base.kind === 'carcase') {
        // v12→v13: `dividers` and `fixedShelves` became the section tree. Converted at the
        // boundary, so the generator never sees a legacy field. Width and thickness come from the
        // same params object: a v12 divider is centred on a fraction of the gross width, and the
        // percentages that reproduce it depend on both.
        const legacy = base.params as unknown as {
          dividers?: number[]
          fixedShelves?: number
          section?: Section
          material?: string
          thickness?: number
          backThickness?: number
          carcaseMaterial?: string
          backMaterial?: string
          // v11→v12: `backSetback` arrived, and a pre-v12 file's own `setback` is the only figure
          // it has to say where its back row went. Defaulted here and nowhere else, so no read
          // site downstream carries a fallback.
          adjustableShelves?: {
            rows: 1 | 2
            setback: number
            backSetback?: number
            count: number
          }
          frontMaterial?: string
          frontMount?: 'overlay' | 'inset'
          frontReveal?: number
        }
        const divided =
          legacy.section ??
          legacyToSection(
            legacy.dividers ?? [],
            legacy.fixedShelves ?? 0,
            base.params.width,
            legacy.thickness ?? 0,
          )
        // v15→v16: a pin row belongs to the section that needs it, not to the cabinet. The one
        // bundle a pre-v16 carcase carried is copied onto every leaf, since nothing in the file
        // says which opening the user meant it for. `startHeight` has no successor — a row now
        // starts above its own section's floor — so a migrated file's rows may sit at a different
        // height, which is the correction the stage exists to make. `shelves: 0`: a pre-v16 file
        // had no shelf boards, and inventing some would change what the user saved.
        const shelves = legacy.adjustableShelves
        const section =
          shelves === undefined
            ? divided
            : seedInteriors(divided, {
                // v16→v17: a pre-v17 interior states no fixed shelves, and it had none.
                fixedShelves: 0,
                adjustable: {
                  shelves: 0,
                  count: shelves.count,
                  rows: shelves.rows,
                  pitch: 32,
                  setback: shelves.setback,
                  backSetback: shelves.backSetback ?? shelves.setback,
                },
              })
        // v13→v14: the back slot has no name to inherit — a pre-v14 file states only how thick
        // the back is — and some carcases name no material at all. A slot the file did not name is
        // named for the thickness it stands for, in the vocabulary a new scene is seeded with, so
        // a default cabinet lands back on `18mm Ply` and a 6 mm back is not called `12mm MDF`.
        const carcaseName =
          legacy.carcaseMaterial ||
          legacy.material ||
          (legacy.thickness !== undefined ? `${legacy.thickness}mm Ply` : DEFAULT_CARCASE_MATERIAL)
        const backName =
          legacy.backMaterial ||
          (legacy.backThickness !== undefined
            ? `${legacy.backThickness}mm MDF`
            : DEFAULT_BACK_MATERIAL)
        const params: CarcaseParams & {
          dividers?: number[]
          fixedShelves?: number
          material?: string
          thickness?: number
          backThickness?: number
          adjustableShelves?: unknown
        } = {
          ...base.params,
          section,
          carcaseMaterial: materialAtThickness(materials, carcaseName, legacy.thickness),
          backMaterial: materialAtThickness(materials, backName, legacy.backThickness),
          // v16→v17: fronts arrive. A pre-v17 file states no front slot, so the three fields are
          // defaulted here and nowhere else — every read site downstream treats them as present,
          // and `carcaseBoxes` dereferences `frontMount` on every call. No `front` is seeded on any
          // section: a door appearing in a saved cabinet is a change to what the user drew, not a
          // migration of it.
          frontMaterial: legacy.frontMaterial ?? DEFAULT_FRONT_MATERIAL,
          frontMount: legacy.frontMount ?? 'overlay',
          frontReveal: legacy.frontReveal ?? 3,
        }
        // Dropped, not kept alongside the tree: two descriptions of the same divisions would
        // disagree the moment either is edited. The same argument retires the per-carcase
        // thicknesses now that the materials carry them.
        delete params.dividers
        delete params.fixedShelves
        delete params.material
        delete params.thickness
        delete params.backThickness
        delete params.adjustableShelves
        return { ...base, params }
      }
      // v17→v18: drawer components. `DrawerComponent` declares `params` and `sectionId` present,
      // so a drawer missing either is a shape the type says cannot exist. Demote rather than
      // fabricate: a group keeps the label, the placement and every child board, and loses only
      // the ability to regenerate.
      //
      // `=== undefined` and not `== null`: a released drawer — detached, its opening gone —
      // serialises `sectionId: null`, which is a drawer the model states and must parse as one.
      if (base.kind === 'drawer' && (base.params === undefined || base.sectionId === undefined)) {
        console.warn(`zimmu: drawer "${base.id}" is incomplete — loaded as a group`)
        return {
          kind: 'group' as const,
          id: base.id,
          label: base.label,
          parentId: base.parentId,
          position: base.position,
          rotation: base.rotation,
          rotationOrder: base.rotationOrder,
          visible: base.visible,
        }
      }
      if (base.kind === 'drawer') {
        return {
          ...base,
          kind: 'drawer' as const,
          // Detached, like every other recovery default in this parser. Reconciliation keeps a
          // drawer only while its opening still wants one, so a drawer that lost this field and
          // names an opening that has since changed would be deleted with its boards. Staleness is
          // recoverable and deletion is not.
          driven: base.driven ?? false,
        } as DrawerComponent
      }
      return base
    }),
  }
  // Migration/defaulting is followed by a second assertion for the current model. That means no
  // caller receives a half-valid `ZimmuFile`: malformed input either degrades through an explicit
  // recovery rule above or fails here with a path-aware validation error.
  return validateCurrentFile({ ...raw, scene: breakComponentCycles(promoteOrphans(scene)) })
}

export function useFile({ scene, getCameraState, onFileLoaded }: UseFileInput): UseFileResult {
  const [fileReady, setFileReady] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [projectName, setProjectNameState] = useState('Untitled')
  const [isDirty, setIsDirty] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const handleRef = useRef<FileSystemFileHandle | null>(null)
  const lastSavedSceneRef = useRef(JSON.stringify(scene))
  const lastSavedProjectNameRef = useRef('Untitled')
  const createdAtRef = useRef<string | null>(null)
  const sceneRef = useRef(scene)
  const getCameraStateRef = useRef(getCameraState)
  const onFileLoadedRef = useRef(onFileLoaded)
  const projectNameRef = useRef('Untitled')
  const isDirtyRef = useRef(false)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    sceneRef.current = scene
  })
  useLayoutEffect(() => {
    getCameraStateRef.current = getCameraState
  })
  useLayoutEffect(() => {
    onFileLoadedRef.current = onFileLoaded
  })

  useEffect(() => {
    const dirty =
      JSON.stringify(scene) !== lastSavedSceneRef.current ||
      projectNameRef.current !== lastSavedProjectNameRef.current
    isDirtyRef.current = dirty
    setIsDirty(dirty)
  }, [scene])

  useEffect(
    () => () => {
      if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current)
    },
    [],
  )

  const showError = useCallback((msg: string) => {
    setFileError(msg)
    if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => {
      setFileError(null)
      errorTimerRef.current = null
    }, 5000)
  }, [])

  // startup: reopen last file
  useEffect(() => {
    void (async () => {
      try {
        const handle = await idb.readHandle()
        if (handle) {
          const perm = await handle.queryPermission({ mode: 'readwrite' })
          if (perm === 'granted') {
            const file = await handle.getFile()
            const envelope = parseFile(await file.text())
            lastSavedSceneRef.current = JSON.stringify(envelope.scene)
            lastSavedProjectNameRef.current = envelope.name
            createdAtRef.current = envelope.createdAt
            handleRef.current = handle
            projectNameRef.current = envelope.name
            setFileName(handle.name)
            setProjectNameState(envelope.name)
            onFileLoadedRef.current(envelope)
          }
        }
      } catch {
        // fall back silently
      }
      setFileReady(true)
    })()
  }, [])

  const guardUnsaved = useCallback((): boolean => {
    if (!isDirtyRef.current) return true
    return window.confirm('You have unsaved changes. Continue?')
  }, [])

  const buildEnvelope = (): ZimmuFile => {
    const now = new Date().toISOString()
    return {
      version: FILE_FORMAT_VERSION,
      name: projectNameRef.current,
      appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0',
      units: 'mm',
      createdAt: createdAtRef.current ?? now,
      updatedAt: now,
      camera: getCameraStateRef.current(),
      scene: sceneRef.current,
    }
  }

  const saveAsFile = useCallback(async () => {
    try {
      const handle = await window.showSaveFilePicker({ types: PICKER_TYPES })
      const content = serialize(buildEnvelope())
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      if (createdAtRef.current === null) createdAtRef.current = new Date().toISOString()
      await idb.writeHandle(handle)
      handleRef.current = handle
      lastSavedSceneRef.current = JSON.stringify(sceneRef.current)
      lastSavedProjectNameRef.current = projectNameRef.current
      isDirtyRef.current = false
      setFileName(handle.name)
      setIsDirty(false)
      setFileError(null)
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') showError('Save failed')
    }
  }, [showError])

  const saveFile = useCallback(async () => {
    if (!handleRef.current) {
      await saveAsFile()
      return
    }
    try {
      const content = serialize(buildEnvelope())
      const writable = await handleRef.current.createWritable()
      await writable.write(content)
      await writable.close()
      await idb.writeHandle(handleRef.current)
      lastSavedSceneRef.current = JSON.stringify(sceneRef.current)
      lastSavedProjectNameRef.current = projectNameRef.current
      isDirtyRef.current = false
      setIsDirty(false)
      setFileError(null)
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError') showError('Save failed')
    }
  }, [saveAsFile, showError])

  const openFile = useCallback(async () => {
    if (!guardUnsaved()) return
    try {
      const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES })
      const file = await handle.getFile()
      const envelope = parseFile(await file.text())
      lastSavedSceneRef.current = JSON.stringify(envelope.scene)
      lastSavedProjectNameRef.current = envelope.name
      createdAtRef.current = envelope.createdAt
      handleRef.current = handle
      projectNameRef.current = envelope.name
      await idb.writeHandle(handle)
      setFileName(handle.name)
      setProjectNameState(envelope.name)
      isDirtyRef.current = false
      setIsDirty(false)
      setFileError(null)
      onFileLoadedRef.current(envelope)
    } catch (err) {
      if ((err as { name?: string }).name !== 'AbortError')
        showError('Could not read file — invalid format')
    }
  }, [guardUnsaved, showError])

  const newFile = useCallback(async () => {
    if (!guardUnsaved()) return
    const now = new Date().toISOString()
    // The same seed a freshly mounted scene starts from, and written into the saved snapshot too:
    // a new file that differed from its own baseline would open dirty.
    const emptyScene = () => ({
      parts: [],
      materials: { ...PRESET_MATERIALS },
      hardware: [],
      joints: [],
      components: [],
    })
    const envelope: ZimmuFile = {
      version: FILE_FORMAT_VERSION,
      name: 'Untitled',
      appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0',
      units: 'mm',
      createdAt: now,
      updatedAt: now,
      camera: getCameraStateRef.current(),
      scene: emptyScene(),
    }
    handleRef.current = null
    createdAtRef.current = null
    projectNameRef.current = 'Untitled'
    lastSavedSceneRef.current = JSON.stringify(emptyScene())
    lastSavedProjectNameRef.current = 'Untitled'
    isDirtyRef.current = false
    setFileName(null)
    setProjectNameState('Untitled')
    setIsDirty(false)
    setFileError(null)
    await idb.clearHandle()
    onFileLoadedRef.current(envelope)
  }, [guardUnsaved])

  const setProjectName = useCallback((name: string) => {
    const trimmed = name.trim() || 'Untitled'
    projectNameRef.current = trimmed
    setProjectNameState(trimmed)
    isDirtyRef.current = true
    setIsDirty(true)
  }, [])

  return {
    fileReady,
    fileName,
    projectName,
    isDirty,
    fileError,
    newFile,
    openFile,
    saveFile,
    saveAsFile,
    setProjectName,
  }
}
