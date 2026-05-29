import { useScene } from './scene/useScene'
import { Viewport } from './render/viewport'
import { Sidebar } from './ui/sidebar'

function App() {
  const {
    scene,
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
    onSelect,
  } = useScene()

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <header
          style={{
            position: 'absolute',
            top: 12,
            left: 16,
            zIndex: 10,
            fontSize: 13,
            letterSpacing: 0.4,
            textTransform: 'uppercase',
            opacity: 0.75,
          }}
        >
          Zimmu · v0.1 · weekend 2
        </header>
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 10,
            fontSize: 12,
            opacity: 0.65,
          }}
        >
          {scene.parts.length} {scene.parts.length === 1 ? 'part' : 'parts'}
        </div>
        <Viewport
          parts={scene.parts}
          geometries={geometries}
          selectedId={selectedId}
          onPartClick={onSelect}
        />
      </div>
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
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </div>
  )
}

export default App
