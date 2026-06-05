import { useState, useRef, useEffect, useCallback } from 'react'
import { useScene } from './scene/useScene'
import { useFile } from './scene/useFile'
import { useSnap } from './scene/useSnap'
import { useAddCut } from './scene/useAddCut'
import { Viewport } from './render/viewport'
import { Sidebar } from './ui/sidebar'
import { FileMenu } from './ui/FileMenu'
import { CuttingList } from './ui/CuttingList'
import { buildBinaryStl } from './geom/stl'
import { downloadBlob } from './ui/download'
import type { CameraState } from './scene/types'

const supported = 'showOpenFilePicker' in window

function App() {
  const {
    scene,
    replaceScene,
    geometries,
    errors,
    pendingIds,
    selectedId,
    occtReady,
    nextLabel,
    onAdd,
    onRemove,
    onDuplicate,
    onUpdate,
    onUpdateCut,
    onRemoveCut,
    onLinkCuts,
    onUnlinkCuts,
    onSelect,
    onToggleVisible,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo,
    redo,
    exportStep,
  } = useScene()

  const {
    snapActive,
    snapPhase,
    sourceFace,
    hoveredFace,
    activateSnap,
    cancelSnap,
    onFaceClick,
    onFaceHover,
  } = useSnap({ parts: scene.parts, onUpdate })

  const {
    cutActive,
    lastPlacedCutId,
    activateCut,
    cancelCut,
    onFaceClick: onFaceClickCut,
    onFaceHover: onFaceHoverCut,
  } = useAddCut({ parts: scene.parts, onUpdate, onSelect })

  const cameraStateRef = useRef<CameraState>({
    position: { x: 250, y: -200, z: 150 },
    target: { x: 0, y: 0, z: 0 },
  })
  const [loadedCamera, setLoadedCamera] = useState<CameraState | null>(null)
  const [cuttingListOpen, setCuttingListOpen] = useState(false)
  const closeCuttingList = useCallback(() => setCuttingListOpen(false), [])

  const {
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
  } = useFile({
    scene,
    getCameraState: () => cameraStateRef.current,
    onFileLoaded: (envelope) => {
      replaceScene(envelope.scene)
      cameraStateRef.current = envelope.camera
      setLoadedCamera(envelope.camera)
    },
  })

  const visibleParts = scene.parts.filter((p) => p.visible)
  const canExport = visibleParts.length > 0

  const handleExportStl = useCallback(() => {
    downloadBlob(buildBinaryStl(visibleParts, geometries), `${projectName}.stl`, 'model/stl')
  }, [visibleParts, geometries, projectName])

  const handleExportStep = useCallback(() => {
    void (async () => {
      const text = await exportStep(visibleParts)
      downloadBlob(text, `${projectName}.step`, 'application/step')
    })()
  }, [visibleParts, projectName, exportStep])

  const handleActivateCut = useCallback(() => {
    cancelSnap()
    activateCut()
  }, [cancelSnap, activateCut])
  const handleActivateSnap = useCallback(() => {
    cancelCut()
    activateSnap()
  }, [cancelCut, activateSnap])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const mod = e.metaKey || e.ctrlKey

      // Non-modifier shortcuts
      if (!mod) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault()
          handleActivateSnap()
          return
        }
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault()
          handleActivateCut()
          return
        }
        if (e.key === 'Escape') {
          if (cutActive) cancelCut()
          if (snapActive) cancelSnap()
          return
        }
        if (e.key.toLowerCase() === 'h') {
          if (selectedId && !snapActive && !cutActive) {
            e.preventDefault()
            onToggleVisible(selectedId)
          }
          return
        }
        return
      }

      // Modifier shortcuts
      const k = e.key.toLowerCase()
      if (!e.shiftKey && k === 's') {
        e.preventDefault()
        void saveFile()
      }
      if (e.shiftKey && k === 's') {
        e.preventDefault()
        void saveAsFile()
      }
      if (!e.shiftKey && k === 'o') {
        e.preventDefault()
        void openFile()
      }
      if (!e.shiftKey && k === 'n') {
        e.preventDefault()
        void newFile()
      }
      if (!e.shiftKey && k === 'z') {
        e.preventDefault()
        undo()
      }
      if ((e.shiftKey && k === 'z') || (k === 'y' && !e.shiftKey)) {
        e.preventDefault()
        redo()
      }
      if (e.shiftKey && k === 'e') {
        e.preventDefault()
        setCuttingListOpen(true)
      }
      if (!e.shiftKey && k === 'd') {
        if (selectedId) {
          e.preventDefault()
          onDuplicate(selectedId)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    saveFile,
    saveAsFile,
    openFile,
    newFile,
    undo,
    redo,
    onDuplicate,
    onToggleVisible,
    selectedId,
    handleActivateCut,
    handleActivateSnap,
    cancelCut,
    cutActive,
    cancelSnap,
    snapActive,
  ])

  if (!fileReady) return null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <FileMenu
        fileName={fileName}
        projectName={projectName}
        isDirty={isDirty}
        fileError={fileError}
        partsCount={scene.parts.length}
        supported={supported}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onUndo={undo}
        onRedo={redo}
        onNew={() => {
          void newFile()
        }}
        onOpen={() => {
          void openFile()
        }}
        onSave={() => {
          void saveFile()
        }}
        onSaveAs={() => {
          void saveAsFile()
        }}
        onProjectNameChange={setProjectName}
        onCuttingList={() => setCuttingListOpen(true)}
        onExportStl={handleExportStl}
        onExportStep={handleExportStep}
        canExport={canExport}
      />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Viewport
          parts={scene.parts}
          geometries={geometries}
          selectedId={selectedId}
          onPartClick={onSelect}
          cameraStateRef={cameraStateRef}
          loadedCamera={loadedCamera}
          snapActive={snapActive}
          snapPhase={snapPhase}
          sourceFace={sourceFace}
          hoveredFace={hoveredFace}
          onFaceClick={onFaceClick}
          onFaceHover={onFaceHover}
          cutActive={cutActive}
          onFaceClickCut={onFaceClickCut}
          onFaceHoverCut={onFaceHoverCut}
        />
        <Sidebar
          scene={scene}
          occtReady={occtReady}
          errors={errors}
          pendingIds={pendingIds}
          nextLabel={nextLabel}
          onAdd={onAdd}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onUpdate={onUpdate}
          onUpdateCut={onUpdateCut}
          onRemoveCut={onRemoveCut}
          onLinkCuts={onLinkCuts}
          onUnlinkCuts={onUnlinkCuts}
          lastPlacedCutId={lastPlacedCutId}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
          snapActive={snapActive}
          snapPhase={snapPhase}
          onSnapToggle={handleActivateSnap}
          cutActive={cutActive}
          onCutToggle={handleActivateCut}
        />
      </div>
      {cuttingListOpen && (
        <CuttingList parts={scene.parts} projectName={projectName} onClose={closeCuttingList} />
      )}
    </div>
  )
}

export default App
