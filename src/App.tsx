import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { wrap } from 'comlink'
import type { OcctWorkerApi } from './geom/occt.worker'
import { Viewport } from './render/viewport'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; geometry: THREE.BufferGeometry }
  | { status: 'error'; message: string }

// Worker is a module-level singleton — OCCT WASM initialises once and stays alive.
const occtWorker = new Worker(new URL('./geom/occt.worker.ts', import.meta.url), {
  type: 'module',
})
const occt = wrap<OcctWorkerApi>(occtWorker)

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { positions, normals } = await occt.buildBox(100, 100, 50)
        if (cancelled) return
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
        setState({ status: 'ready', geometry })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (!cancelled) setState({ status: 'error', message })
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
      <Viewport parts={[]} geometries={new Map()} selectedId={null} onPartClick={() => {}} />
    </div>
  )
}

export default App
