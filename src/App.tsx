import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useScene } from './scene/useScene'
import { useFile } from './scene/useFile'
import { useInteractionMode } from './scene/useInteractionMode'
import { suggestJointsFor, suggestJointsForScene, synthHit, pairIdsOf } from './scene/suggestJoints'
import { suggestionOutlines } from './scene/suggestionOutline'
import { ancestorsOf, componentsById, descendantIds, isNodeVisible } from './scene/componentTree'
import type { JointSuggestion } from './scene/suggestJoints'
import { Viewport } from './render/viewport'
import { Sidebar } from './ui/sidebar'
import { CabinetEditor, type CabinetTab } from './ui/CabinetEditor'
import { FileMenu } from './ui/FileMenu'
import { BomModal } from './ui/BomModal'
import { useMaterialLibrary } from './scene/useMaterialLibrary'
import { useNest } from './scene/useNest'
import { buildBinaryStl } from './geom/stl'
import { downloadBlob } from './ui/download'
import { buildDrawingSheets } from './geom/drawing'
import type { DrawingSheet } from './geom/drawing'
import { DrawingViewer } from './ui/DrawingViewer'
import type {
  CameraState,
  CarcaseComponent,
  ComponentId,
  MaterialDef,
  PartId,
  SectionId,
  Selection,
} from './scene/types'

const supported = 'showOpenFilePicker' in window

function App() {
  const {
    scene,
    replaceScene,
    geometries,
    errors,
    pendingIds,
    selectedId,
    selection,
    occtReady,
    nextLabel,
    onAdd,
    onAddComponent,
    onAddCarcase,
    parameterFor,
    onDetachPart,
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
    onUpdateComponent,
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

  const componentMap = useMemo(() => componentsById(scene.components), [scene.components])

  // Derived here rather than in the sidebar, which is where it used to live: with the editor in the
  // main pane two panes need the answer, and deriving it twice is how they come to disagree about
  // which cabinet is open.
  //
  // "Stays open" is a fact about the *previous* answer, so this is a small state machine rather
  // than a pure derivation. Selecting a part used to null it, which unmounted the editor and
  // revealed the viewport — so clicking a part in a projection destroyed the surface it was
  // clicked in.
  //
  // Deliberately NOT "the cabinet containing the selection". That opens a cabinet on any part
  // click, and the viewport shows only while this is null or the tab is 3D — so clicking a part in
  // the viewport would swap the viewport out for the Section elevation, and `cabinetParts` would
  // silently filter 3D down to one cabinet. Keeping an open cabinet open is the whole requirement.
  const [openCabinetId, setOpenCabinetId] = useState<ComponentId | null>(null)

  const selectedCarcase = useMemo(() => {
    const carcaseAt = (id: ComponentId | null): CarcaseComponent | null => {
      const c = id === null ? undefined : scene.components.find((x) => x.id === id)
      return c?.kind === 'carcase' ? c : null
    }
    // Selecting a cabinet outright opens it, and closes whatever was open before.
    if (selection?.kind === 'component') {
      const picked = carcaseAt(selection.id)
      if (picked !== null) return picked
    }
    // A section selection carries the cabinet it was made in, so picking an opening opens — and
    // keeps open — that cabinet rather than whichever one happened to be open before.
    if (selection?.kind === 'section') {
      const picked = carcaseAt(selection.cabinetId)
      if (picked !== null) return picked
    }
    // Otherwise the open one stays open, but only while the selection lies inside it. A cabinet
    // deleted from the scene resolves to null here, so the editor cannot outlive it.
    const open = carcaseAt(openCabinetId)
    if (open === null) return null
    // Nothing selected is not a selection *outside* the cabinet: clicking empty space deselects,
    // and being evicted from the editor by a stray click is not what "stays open" means.
    const node =
      selection?.kind === 'part'
        ? scene.parts.find((q) => q.id === selection.id)
        : selection?.kind === 'component'
          ? scene.components.find((c) => c.id === selection.id)
          : undefined
    if (node === undefined) return open
    return ancestorsOf(node, componentMap).some((x) => x.id === open.id) ? open : null
  }, [selection, openCabinetId, scene.components, scene.parts, componentMap])

  // Remember what the derivation settled on, so the next selection can be measured against it.
  // Adjusted during render rather than in an effect: the derivation is idempotent — feed its own
  // answer back and it returns the same one — so React re-runs this component once and settles,
  // with no committed render carrying the stale value. `set-state-in-effect` rejects the effect
  // form for exactly the cascade it would cause here.
  if ((selectedCarcase?.id ?? null) !== openCabinetId) {
    setOpenCabinetId(selectedCarcase?.id ?? null)
  }

  const [cabinetTab, setCabinetTab] = useState<CabinetTab>('section')

  // One selection, not two. This used to be `sectionPick` — a second piece of state the elevation
  // wrote and the panel read — which meant two things could disagree about which opening was
  // picked. The pick carries the cabinet it was made in, and the cabinet on screen is derived from
  // the pick — so the only selection this guard can reject is one naming a cabinet the scene no
  // longer holds. That is not inert: section ids are NOT unique across cabinets built from one
  // preset, so a stale id can name a live opening in the cabinet that is open.
  const selectedSectionId =
    selection?.kind === 'section' && selection.cabinetId === selectedCarcase?.id
      ? selection.sectionId
      : null
  const onSelectSection = useCallback(
    (sectionId: SectionId | null) => {
      const cabinetId = selectedCarcase?.id
      if (cabinetId === undefined) return
      // Deselecting an opening means "no opening", not "no cabinet". `null` would leave the editor
      // open too — the fallback above catches it — but it would blank the tree row and the
      // sidebar panel for the cabinet the click was made in.
      onSelect(
        sectionId === null
          ? { kind: 'component', id: cabinetId }
          : { kind: 'section', cabinetId, sectionId },
      )
    },
    [selectedCarcase?.id, onSelect],
  )

  // The 3D tab is the viewport "filtered to this cabinet": while one is open it shows that
  // cabinet's own parts. `Viewport` keys meshes by part id and already handles parts coming and
  // going — it must, for add and remove — so this is not a new capability, and the rebuild it costs
  // is bounded by one cabinet's part count.
  const cabinetParts = useMemo(() => {
    if (selectedCarcase === null) return scene.parts
    const mine = new Set(descendantIds(selectedCarcase.id, scene.components, scene.parts).partIds)
    return scene.parts.filter((p) => mine.has(p.id))
  }, [selectedCarcase, scene.components, scene.parts])

  const suggestions = useMemo(
    () => suggestJointsFor(selectedId, scene.parts, scene.joints, componentMap),
    [selectedId, scene.parts, scene.joints, componentMap],
  )

  const sceneSuggestions = useMemo(
    () => suggestJointsForScene(scene.parts, scene.joints, componentMap),
    [scene.parts, scene.joints, componentMap],
  )

  const [hoveredSuggestion, setHoveredSuggestion] = useState<JointSuggestion | null>(null)
  // Both boards tint, not just the "neighbour": scene rows have no selection to be relative to.
  // In the per-part panel this changes nothing visible, because the selected board's own cyan
  // takes precedence over the tint in the viewport.
  // A done checklist row has no suggestion to preview, so it tints both boards without drawing face
  // outlines. That is the complete answer for a jointed pair, not a degraded one: there is no
  // candidate geometry an outline could depict.
  const [hoveredPair, setHoveredPair] = useState<[PartId, PartId] | null>(null)
  const highlightedIds = useMemo(
    () => (hoveredSuggestion ? pairIdsOf(hoveredSuggestion) : hoveredPair),
    [hoveredSuggestion, hoveredPair],
  )
  const hoveredOutlines = useMemo(
    () =>
      hoveredSuggestion ? suggestionOutlines(hoveredSuggestion, scene.parts, componentMap) : null,
    [hoveredSuggestion, scene.parts, componentMap],
  )
  const applySuggestion = useCallback(
    (s: JointSuggestion) => {
      setHoveredSuggestion(null)
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

  const { library, clearance, saveRate, deleteEntry, setClearance } = useMaterialLibrary()
  // Driven by the Sheets tab: a nest is several seconds of work, so it runs only for a report
  // someone is actually looking at.
  const [sheetsTabOpen, setSheetsTabOpen] = useState(false)
  const nestMaterials = useMemo(() => {
    const merged: Record<string, MaterialDef> = {}
    for (const name of new Set([...Object.keys(library), ...Object.keys(scene.materials)])) {
      merged[name] = { ...library[name], ...scene.materials[name] }
    }
    return merged
  }, [library, scene.materials])
  const { reports: nestReports, pending: nestPending } = useNest(
    scene.parts,
    nestMaterials,
    clearance,
    sheetsTabOpen,
  )

  const [flashTarget, setFlashTarget] = useState<{ id: PartId; seq: number } | null>(null)
  const handleRotationSnap = useCallback(
    (id: PartId) => setFlashTarget({ id, seq: performance.now() }),
    [],
  )

  // The viewport and the face-interaction hooks address parts by id: a mesh click can only ever
  // land on a part, and nothing component-shaped is drawn in the 3D scene. The sidebar tree speaks
  // Selection directly, so it needs no adapter.
  const onSelectPart = useCallback(
    (id: PartId | null) => onSelect(id === null ? null : { kind: 'part', id }),
    [onSelect],
  )

  // Part visibility is its own scene action; a component has no such action because its visibility
  // is just a field on the component. A section is a region of a cabinet, not a node the scene
  // can hide, so it toggles nothing.
  const handleToggleVisible = useCallback(
    (s: Selection) => {
      if (s.kind === 'part') onToggleVisible(s.id)
      else if (s.kind === 'component')
        onUpdateComponent(s.id, (c) => ({ ...c, visible: !c.visible }))
    },
    [onToggleVisible, onUpdateComponent],
  )

  const mode = useInteractionMode({
    parts: scene.parts,
    byId: componentMap,
    onUpdate,
    onSelect: onSelectPart,
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
  const [fitRequest, setFitRequest] = useState(0)
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

  const visibleParts = scene.parts.filter((p) => isNodeVisible(p, componentMap))
  const canExport = visibleParts.length > 0
  const closeDrawings = useCallback(() => setDrawingsOpen(false), [])

  // Every carcase gets an assembly sheet ahead of the part sheets. Its parts are the cabinet's own
  // descendants — the same set the cabinet editor draws, and so the same sheet its own export
  // buttons build — rather than `visibleParts`, which is the deck's separate question of which
  // boards get a sheet of their own.
  const handleOpenDrawings = useCallback(() => {
    const cabinets = scene.components
      .filter((c): c is CarcaseComponent => c.kind === 'carcase')
      .map((cabinet) => {
        const mine = new Set(descendantIds(cabinet.id, scene.components, scene.parts).partIds)
        return {
          cabinet,
          parts: scene.parts.filter((p) => mine.has(p.id)),
          materials: scene.materials,
          byId: componentMap,
        }
      })
    setDrawingSheets(buildDrawingSheets(visibleParts, projectName, cabinets))
    setDrawingsOpen(true)
  }, [visibleParts, projectName, scene.components, scene.parts, scene.materials, componentMap])

  const handleExportStl = useCallback(() => {
    downloadBlob(
      buildBinaryStl(visibleParts, geometries, componentMap),
      `${projectName}.stl`,
      'model/stl',
    )
  }, [visibleParts, geometries, componentMap, projectName])

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
        if (e.key === 'Home') {
          e.preventDefault()
          setFitRequest((n) => n + 1)
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
        {/* Hidden, never unmounted. `viewport.tsx` builds its renderer, camera, controls and every
            mesh in a mount-once effect, so rendering the editor *instead of* it would tear all of
            that down on every selection and rebuild it on every trip to the 3D tab. A hidden canvas
            keeps rendering, which is what the app already does behind the BOM modal. */}
        <div
          style={{
            display: selectedCarcase === null || cabinetTab === '3d' ? 'flex' : 'none',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Viewport
            parts={cabinetParts}
            componentMap={componentMap}
            geometries={geometries}
            selectedId={selectedId}
            onPartClick={onSelectPart}
            cameraStateRef={cameraStateRef}
            loadedCamera={loadedCamera}
            fitRequest={fitRequest}
            interactionActive={mode.interactionActive}
            onFaceClick={mode.onFaceClick}
            onFaceHover={mode.onFaceHover}
            sourceFace={mode.sourceFace}
            hoveredFace={mode.hoveredFace}
            snapPhase={mode.snapPhase}
            flashTarget={flashTarget}
            highlightedIds={highlightedIds}
            suggestionOutlines={hoveredOutlines}
          />
        </div>
        {selectedCarcase !== null && (
          <CabinetEditor
            key={selectedCarcase.id}
            component={selectedCarcase}
            materials={scene.materials}
            tab={cabinetTab}
            onTabChange={setCabinetTab}
            selectedSectionId={selectedSectionId}
            onSelectSection={onSelectSection}
            onUpdate={(updater) => onUpdateComponent(selectedCarcase.id, updater)}
            parts={cabinetParts}
            byId={componentMap}
            selectedPartId={selection?.kind === 'part' ? selection.id : null}
            onSelectPart={onSelectPart}
            projectName={projectName}
          />
        )}
        <Sidebar
          scene={scene}
          occtReady={occtReady}
          errors={errors}
          pendingIds={pendingIds}
          nextLabel={nextLabel}
          onAdd={onAdd}
          onAddComponent={onAddComponent}
          onAddCarcase={onAddCarcase}
          parameterFor={parameterFor}
          onDetachPart={onDetachPart}
          onUpdateComponent={onUpdateComponent}
          onRemove={onRemove}
          onDuplicate={onDuplicate}
          onUpdate={onUpdate}
          onUpdateCut={onUpdateCut}
          onAddMitre={onAddMitre}
          onRemoveCut={onRemoveCut}
          onLinkCuts={onLinkCuts}
          onUnlinkCuts={onUnlinkCuts}
          lastPlacedCutId={mode.lastPlacedCutId}
          selection={selection}
          selectedSectionId={selectedSectionId}
          onSelect={onSelect}
          onToggleVisible={handleToggleVisible}
          activeMode={mode.activeMode}
          onSetMode={mode.setMode}
          statuses={mode.statuses}
          snapPhase={mode.snapPhase}
          dowelTool={mode.dowelTool}
          armDowelTool={mode.armDowelTool}
          onUpdateJoint={onUpdateJoint}
          onRemoveJoint={onRemoveJoint}
          suggestions={suggestions}
          sceneSuggestions={sceneSuggestions}
          onApplySuggestion={applySuggestion}
          onHoverSuggestion={setHoveredSuggestion}
          onHoverPair={setHoveredPair}
        />
      </div>
      {cuttingListOpen && (
        <BomModal
          parts={scene.parts}
          components={scene.components}
          materials={scene.materials}
          hardware={scene.hardware}
          projectName={projectName}
          onClose={closeCuttingList}
          onMaterialCostChange={onUpdateMaterial}
          onUpdateHardware={onUpdateHardware}
          library={library}
          onSaveRate={saveRate}
          onDeleteLibraryEntry={deleteEntry}
          clearance={clearance}
          onSetClearance={setClearance}
          nestReports={nestReports}
          nestPending={nestPending}
          onSheetsTabChange={setSheetsTabOpen}
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
