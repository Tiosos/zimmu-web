import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { initOCCT, makeBox } from './geom/occt'
import { shapeToGeometry } from './geom/mesh'
import { Viewport } from './render/viewport'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; geometry: THREE.BufferGeometry }
  | { status: 'error'; message: string }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const oc = await initOCCT()
        if (cancelled) return
        const shape = makeBox(oc, 100, 100, 50)
        const geometry = shapeToGeometry(oc, shape, {
          linearDeflection: 0.1,
          angularDeflection: 0.5,
        })
        shape.delete()
        if (cancelled) {
          geometry.dispose()
          return
        }
        setState({ status: 'ready', geometry })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!cancelled) {
          setState({ status: 'error', message })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
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
        Zimmu · v0.1 · weekend 1
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
        {state.status === 'loading' && 'Loading OCCT…'}
        {state.status === 'ready' && 'OCCT box · 100 × 100 × 50 mm'}
        {state.status === 'error' && `Error: ${state.message}`}
      </div>
      <Viewport
        geometry={state.status === 'ready' ? state.geometry : null}
      />
    </div>
  )
}

export default App
