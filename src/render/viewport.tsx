import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'stats.js'
import type { Part, PartId, CameraState } from '../scene/types'

interface ViewportProps {
  parts: Part[]
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
  cameraStateRef: { current: CameraState }
  loadedCamera: CameraState | null
}

export function Viewport({
  parts,
  geometries,
  selectedId,
  onPartClick,
  cameraStateRef,
  loadedCamera,
}: ViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshes = useRef<Map<PartId, THREE.Mesh>>(new Map())
  const edgeLines = useRef<Map<PartId, THREE.LineSegments>>(new Map())
  const raycaster = useRef(new THREE.Raycaster())
  const mouseDown = useRef<{ x: number; y: number } | null>(null)
  const onClickRef = useRef(onPartClick)

  useLayoutEffect(() => {
    onClickRef.current = onPartClick
  })

  // Scene setup — runs once
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a1d)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      10000,
    )
    camera.position.set(250, -200, 150)
    camera.up.set(0, 0, 1)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controlsRef.current = controls
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(0, 0, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0)
    keyLight.position.set(200, 300, 400)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
    fillLight.position.set(-200, -100, -100)
    scene.add(fillLight)

    scene.add(new THREE.AxesHelper(50))
    const grid = new THREE.GridHelper(400, 20, 0x444444, 0x2a2a2d)
    grid.rotation.x = Math.PI / 2
    scene.add(grid)

    let stats: Stats | undefined
    if (import.meta.env.DEV) {
      stats = new Stats()
      stats.showPanel(0)
      stats.dom.style.cssText =
        'position:absolute;top:0;left:0;cursor:pointer;opacity:0.9;z-index:20;'
      mount.appendChild(stats.dom)
    }

    let frame = 0
    const animate = () => {
      stats?.begin()
      controls.update()
      renderer.render(scene, camera)
      cameraStateRef.current = {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      }
      stats?.end()
      frame = requestAnimationFrame(animate)
    }
    animate()

    const handleResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    const handleMouseDown = (e: MouseEvent) => {
      mouseDown.current = { x: e.clientX, y: e.clientY }
    }

    const handleClick = (e: MouseEvent) => {
      if (!mouseDown.current) return
      if (Math.hypot(e.clientX - mouseDown.current.x, e.clientY - mouseDown.current.y) > 4) return
      const rect = renderer.domElement.getBoundingClientRect()
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera)
      const hits = raycaster.current.intersectObjects(Array.from(meshes.current.values()), false)
      if (hits.length > 0) {
        const hit = hits[0].object as THREE.Mesh
        for (const [id, m] of meshes.current) {
          if (m === hit) {
            onClickRef.current(id)
            return
          }
        }
      }
      onClickRef.current(null)
    }

    renderer.domElement.addEventListener('mousedown', handleMouseDown)
    renderer.domElement.addEventListener('click', handleClick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousedown', handleMouseDown)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      renderer.dispose()
      if (stats && mount.contains(stats.dom)) mount.removeChild(stats.dom)
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement)
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Camera restore — applies loadedCamera when it changes
  useEffect(() => {
    if (!loadedCamera || !controlsRef.current) return
    const ctrl = controlsRef.current
    ctrl.object.position.set(
      loadedCamera.position.x,
      loadedCamera.position.y,
      loadedCamera.position.z,
    )
    ctrl.target.set(loadedCamera.target.x, loadedCamera.target.y, loadedCamera.target.z)
    ctrl.update()
  }, [loadedCamera])

  // Mesh management — syncs Three.js scene to parts + geometries + selectedId
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const deg2rad = Math.PI / 180
    const partMap = new Map(parts.map((p) => [p.id, p]))

    // Remove meshes for deleted parts
    for (const [id, mesh] of meshes.current) {
      if (!partMap.has(id)) {
        scene.remove(mesh)
        ;(mesh.material as THREE.Material).dispose()
        meshes.current.delete(id)
      }
    }
    for (const [id, el] of edgeLines.current) {
      if (!partMap.has(id)) {
        scene.remove(el)
        el.geometry.dispose()
        ;(el.material as THREE.Material).dispose()
        edgeLines.current.delete(id)
      }
    }

    // Add or update
    for (const part of parts) {
      const geo = geometries.get(part.id)
      if (!geo) continue

      const rx = part.rotation.x * deg2rad
      const ry = part.rotation.y * deg2rad
      const rz = part.rotation.z * deg2rad

      const existing = meshes.current.get(part.id)
      if (!existing) {
        const mat = new THREE.MeshStandardMaterial({
          color: part.color,
          roughness: 0.7,
          metalness: 0.0,
          flatShading: true,
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(part.position.x, part.position.y, part.position.z)
        mesh.rotation.set(rx, ry, rz, part.rotationOrder)
        scene.add(mesh)
        meshes.current.set(part.id, mesh)

        const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1d })
        const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat)
        el.position.copy(mesh.position)
        el.rotation.copy(mesh.rotation)
        scene.add(el)
        edgeLines.current.set(part.id, el)
      } else {
        if (existing.geometry !== geo) {
          existing.geometry = geo
          const el = edgeLines.current.get(part.id)!
          el.geometry.dispose()
          el.geometry = new THREE.EdgesGeometry(geo, 15)
        }
        existing.position.set(part.position.x, part.position.y, part.position.z)
        existing.rotation.set(rx, ry, rz, part.rotationOrder)
        const el = edgeLines.current.get(part.id)!
        el.position.copy(existing.position)
        el.rotation.copy(existing.rotation)
      }
    }

    // Selection highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId ? 0x4fc3f7 : 0x1a1a1d,
      )
    }
    for (const [id, mesh] of meshes.current) {
      ;(mesh.material as THREE.MeshStandardMaterial).emissive.setHex(
        id === selectedId ? 0x222244 : 0x000000,
      )
    }
  }, [parts, geometries, selectedId])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
