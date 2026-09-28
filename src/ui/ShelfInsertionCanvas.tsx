import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AdjustableShelfAccessResult } from '../scene/carcaseParts'
import {
  applyInsertionPose,
  buildInsertionPreview,
  disposeInsertionPreview,
  insertionPoseAt,
} from '../render/shelfInsertionPreview'

export function ShelfInsertionCanvas({
  result,
  progress,
}: {
  result: AdjustableShelfAccessResult
  progress: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const shelfRef = useRef<THREE.Object3D | null>(null)
  const unavailable = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return
    if (unavailable.current) unavailable.current.hidden = true
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      if (unavailable.current) unavailable.current.hidden = false
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x101827)
    renderer.domElement.setAttribute('aria-label', '3D shelf insertion preview')
    element.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const preview = buildInsertionPreview(result)
    scene.add(preview.group)
    shelfRef.current = preview.shelf
    applyInsertionPose(preview.shelf, insertionPoseAt(result, 0))
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, renderer.domElement)
    const center = preview.bounds.getCenter(new THREE.Vector3())
    const radius = Math.max(1, preview.bounds.getSize(new THREE.Vector3()).length() / 2)
    controls.target.copy(center)
    const resize = () => {
      const width = Math.max(1, element.clientWidth)
      const height = Math.max(1, element.clientHeight)
      renderer.setSize(width, height)
      camera.aspect = width / height
      const halfAngle = Math.min(
        (camera.fov * Math.PI) / 360,
        Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect),
      )
      const distance = (radius / Math.sin(halfAngle)) * 1.1
      camera.position
        .copy(center)
        .add(new THREE.Vector3(1, -1.8, 1).normalize().multiplyScalar(distance))
      camera.far = Math.max(10000, distance + radius * 4)
      camera.updateProjectionMatrix()
      controls.update()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    let raf = 0
    const draw = () => {
      renderer.render(scene, camera)
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      disposeInsertionPreview(preview.group)
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
      shelfRef.current = null
    }
  }, [result])

  useEffect(() => {
    if (shelfRef.current) applyInsertionPose(shelfRef.current, insertionPoseAt(result, progress))
  }, [result, progress])

  return (
    <div
      ref={host}
      className="w-full h-[min(50vh,440px)] min-h-48 rounded bg-slate-900 overflow-hidden"
    >
      <p ref={unavailable} hidden role="alert" className="p-4">
        3D preview is unavailable in this browser. The insertion status and playback positions are
        still available.
      </p>
    </div>
  )
}
