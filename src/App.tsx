import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useScene } from './scene/useScene'
import { useFile } from './scene/useFile'
import { useInteractionMode } from './scene/useInteractionMode'
import { suggestJointsFor, synthHit } from './scene/suggestJoints'
import type { JointSuggestion } from './scene/suggestJoints'
import { Viewport } from './render/viewport'
import { Sidebar } from './ui/sidebar'
import { FileMenu } from './ui/FileMenu'
import { BomModal } from './ui/BomModal'
import { useMaterialLibrary } from './scene/useMaterialLibrary'
import { buildBinaryStl } from './geom/stl'
import { downloadBlob } from './ui/download'
import { buildDrawingSheets } from './geom/drawing'
import type { DrawingSheet } from './geom/drawing'
import { DrawingViewer } from './ui/DrawingViewer'
import type { CameraState, PartId } from './scene/types'

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
    onAddMitre,
    onRemoveCut,
    onLinkCuts,
    onUnlinkCuts,
    onAddJoint,
    onAddHalfLap,
    onAddMortiseTenon,
    onAddFingerJoint,
    onAddTongueGroove,
    onUpdateJoint,
    onRemoveJoint,
    onSelect,
    onToggleVisible,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    undo,
    redo,
    exportStep,
    onUpdateMaterial,
    onUpdateHardware,
  } = useScene()

  const suggestions = useMemo(
    () => suggestJointsFor(selectedId, scene.parts, scene.joints),
    [selectedId, scene.parts, scene.joints],
  )

  const [hoveredNeighborId, setHoveredNeighborId] = useState<PartId | null>(null)
  const applySuggestion = useCallback(
    (s: JointSuggestion) => {
      setHoveredNeighborId(null)
      switch (s.kind) {
        case 'halflap':
          return onAddHalfLap(s.partAId, s.partBId)
        case 'dado':
          return onAddJoint(
            synthHit(s.housingPartId, s.housingFace),
            synthHit(s.housedPartId, s.housedEnd),
          )
        case 'mortise-tenon':
          return onAddMortiseTenon(
            synthHit(s.mortisePartId, s.mortiseFace),
            synthHit(s.tenonPartId, s.tenonEnd),
          )
        case 'tongue-groove':
          return onAddTongueGroove(
            synthHit(s.groovePartId, s.grooveEdge),
            synthHit(s.tonguePartId, s.tongueEdge),
          )
        case 'finger':
          return onAddFingerJoint(synthHit(s.partAId, s.endA), synthHit(s.partBId, s.endB))
      }
    },
    [onAddHalfLap, onAddJoint, onAddMortiseTenon, onAddTongueGroove, onAddFingerJoint],
  )

  const { library, saveRate, deleteEntry } = useMaterialLibrary()

  const [flashTarget, setFlashTarget] = useState<{ id: PartId; seq: number } | null>(null)
  const handleRotationSnap = useCallback(
    (id: PartId) => setFlashTarget({ id, seq: performance.now() }),
    [],
  )

  const mode = useInteractionMode({
    parts: scene.parts,
    onUpdate,
    onSelect,
    onRotationSnap: handleRotationSnap,
    onAddJoint,
    onAddHalfLap,
    onAddMortiseTenon,
    onAddFingerJoint,
    onAddTongueGroove,
  })
  const { setMode, interactionActive } = mode

  const cameraStateRef = useRef<CameraState>({
    position: { x: 250, y: -200, z: 150 },
    target: { x: 0, y: 0, z: 0 },
  })
  const [loadedCamera, setLoadedCamera] = useState<CameraState | null>(null)
  const [cuttingListOpen, setCuttingListOpen] = useState(false)
  const closeCuttingList = useCallback(() => setCuttingListOpen(false), [])
  const [drawingsOpen, setDrawingsOpen] = useState(false)
  const [drawingSheets, setDrawingSheets] = useState<DrawingSheet[]>([])

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
  const closeDrawings = useCallback(() => setDrawingsOpen(false), [])

  const handleOpenDrawings = useCallback(() => {
    setDrawingSheets(buildDrawingSheets(visibleParts, projectName))
    setDrawingsOpen(true)
  }, [visibleParts, projectName])

  const handleExportStl = useCallback(() => {
    downloadBlob(buildBinaryStl(visibleParts, geometries), `${projectName}.stl`, 'model/stl')
  }, [visibleParts, geometries, projectName])

  const handleExportStep = useCallback(() => {
    void (async () => {
      const text = await exportStep(visibleParts)
      downloadBlob(text, `${projectName}.step`, 'application/step')
    })()
  }, [visibleParts, projectName, exportStep])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const mod = e.metaKey || e.ctrlKey

      // Non-modifier shortcuts
      if (!mod) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault()
          setMode('snap')
          return
        }
        if (e.key.toLowerCase() === 'c') {
          e.preventDefault()
          setMode('cut')
          return
        }
        if (e.key.toLowerCase() === 'j') {
          e.preventDefault()
          setMode('dado')
          return
        }
        if (e.key.toLowerCase() === 'l') {
          e.preventDefault()
          setMode('halflap')
          return
        }
        if (e.key.toLowerCase() === 'm') {
          e.preventDefault()
          setMode('mortiseTenon')
          return
        }
        if (e.key.toLowerCase() === 'b') {
          e.preventDefault()
          setMode('finger')
          return
        }
        if (e.key.toLowerCase() === 't') {
          e.preventDefault()
          setMode('tongueGroove')
          return
        }
        if (e.key === 'Escape') {
          setMode('none')
          return
        }
        if (e.key.toLowerCase() === 'h') {
          if (selectedId && !interactionActive) {
            e.preventDefault()
            onToggleVisible(selectedId)
          }
          return
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selectedId && !interactionActive) {
            e.preventDefault()
            onRemove(selectedId)
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
    onRemove,
    onToggleVisible,
    selectedId,
    setMode,
    interactionActive,
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
        onOpenDrawings={handleOpenDrawings}
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
          interactionActive={mode.interactionActive}
          onFaceClick={mode.onFaceClick}
          onFaceHover={mode.onFaceHover}
          sourceFace={mode.sourceFace}
          hoveredFace={mode.hoveredFace}
          snapPhase={mode.snapPhase}
          flashTarget={flashTarget}
          highlightedId={hoveredNeighborId}
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
          onAddMitre={onAddMitre}
          onRemoveCut={onRemoveCut}
          onLinkCuts={onLinkCuts}
          onUnlinkCuts={onUnlinkCuts}
          lastPlacedCutId={mode.lastPlacedCutId}
          selectedId={selectedId}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
          snapActive={mode.activeMode === 'snap'}
          snapPhase={mode.snapPhase}
          onSnapToggle={() => mode.setMode('snap')}
          cutActive={mode.activeMode === 'cut'}
          onCutToggle={() => mode.setMode('cut')}
          dowelTool={mode.dowelTool}
          armDowelTool={mode.armDowelTool}
          onUpdateJoint={onUpdateJoint}
          onRemoveJoint={onRemoveJoint}
          jointActive={mode.activeMode === 'dado'}
          onJointToggle={() => mode.setMode('dado')}
          jointStatus={mode.statuses.dado}
          halfLapActive={mode.activeMode === 'halflap'}
          onHalfLapToggle={() => mode.setMode('halflap')}
          halfLapStatus={mode.statuses.halflap}
          mortiseTenonActive={mode.activeMode === 'mortiseTenon'}
          onMortiseTenonToggle={() => mode.setMode('mortiseTenon')}
          mortiseTenonStatus={mode.statuses.mortiseTenon}
          fingerJointActive={mode.activeMode === 'finger'}
          onFingerJointToggle={() => mode.setMode('finger')}
          fingerJointStatus={mode.statuses.finger}
          tongueGrooveActive={mode.activeMode === 'tongueGroove'}
          onTongueGrooveToggle={() => mode.setMode('tongueGroove')}
          tongueGrooveStatus={mode.statuses.tongueGroove}
          suggestions={suggestions}
          onApplySuggestion={applySuggestion}
          onHoverSuggestion={setHoveredNeighborId}
        />
      </div>
      {cuttingListOpen && (
        <BomModal
          parts={scene.parts}
          materials={scene.materials}
          hardware={scene.hardware}
          projectName={projectName}
          onClose={closeCuttingList}
          onMaterialCostChange={onUpdateMaterial}
          onUpdateHardware={onUpdateHardware}
          library={library}
          onSaveRate={saveRate}
          onDeleteLibraryEntry={deleteEntry}
        />
      )}
      <DrawingViewer
        open={drawingsOpen}
        onClose={closeDrawings}
        sheets={drawingSheets}
        projectName={projectName}
      />
    </div>
  )
}

export default App
