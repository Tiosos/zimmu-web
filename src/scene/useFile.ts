import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import type { Part, CutDef, MaterialDef, Scene, CameraState, ZimmuFile, Joint } from './types'
import * as idb from './idb'

export const FILE_FORMAT_VERSION = 5

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

export function parseFile(text: string): ZimmuFile {
  const raw = JSON.parse(text) as ZimmuFile
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
  return {
    ...raw,
    scene: {
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
            }
          : {
              ...p,
              cuts: Array.isArray(p.cuts) ? p.cuts : [],
              visible: p.visible ?? true,
              material: p.material ?? '',
            },
      ),
      materials: (raw.scene.materials as Record<string, MaterialDef> | undefined) ?? {},
      hardware: raw.scene.hardware ?? [],
      // v4→v5: joints gained a `profile` field (+ tongueThickness/rabbetFace); legacy joints are plain dados.
      joints: ((raw.scene.joints ?? []) as unknown as Array<Record<string, unknown>>).map(
        (j) =>
          ({
            profile: 'plain' as const,
            tongueThickness: 6,
            rabbetFace: '+Z' as const,
            ...j,
          }) as unknown as Joint,
      ),
    },
  }
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
    const envelope: ZimmuFile = {
      version: FILE_FORMAT_VERSION,
      name: 'Untitled',
      appVersion: import.meta.env.VITE_APP_VERSION ?? '0.0.0',
      units: 'mm',
      createdAt: now,
      updatedAt: now,
      camera: getCameraStateRef.current(),
      scene: { parts: [], materials: {}, hardware: [], joints: [] },
    }
    handleRef.current = null
    createdAtRef.current = null
    projectNameRef.current = 'Untitled'
    lastSavedSceneRef.current = JSON.stringify({
      parts: [],
      materials: {},
      hardware: [],
      joints: [],
    })
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
