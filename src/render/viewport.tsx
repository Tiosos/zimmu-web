import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'stats.js'

interface ViewportProps {
  geometry: THREE.BufferGeometry | null
}

export function Viewport({ geometry }: ViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)

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
    camera.position.set(150, 120, 200)
    camera.up.set(0, 0, 1) // CAD convention: +Z up

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(50, 50, 25)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0)
    keyLight.position.set(200, 300, 400)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35)
    fillLight.position.set(-200, -100, -100)
    scene.add(fillLight)

    const axes = new THREE.AxesHelper(50)
    scene.add(axes)
    const grid = new THREE.GridHelper(400, 20, 0x444444, 0x2a2a2d)
    grid.rotation.x = Math.PI / 2
    scene.add(grid)

    // FPS/memory overlay — dev builds only, tree-shaken in production.
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

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', handleResize)
      controls.dispose()
      renderer.dispose()
      if (stats && mount.contains(stats.dom)) mount.removeChild(stats.dom)
      mount.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (meshRef.current) {
      scene.remove(meshRef.current)
      meshRef.current.geometry.dispose()
      ;(meshRef.current.material as THREE.Material).dispose()
      meshRef.current = null
    }

    if (geometry) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xd4a373,
        roughness: 0.7,
        metalness: 0.0,
        flatShading: true,
      })
      const mesh = new THREE.Mesh(geometry, material)

      // Crisp silhouette edges — threshold 15° so coplanar faces don't split.
      const edgeGeo = new THREE.EdgesGeometry(geometry, 15)
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1d })
      mesh.add(new THREE.LineSegments(edgeGeo, edgeMat))

      scene.add(mesh)
      meshRef.current = mesh
    }
  }, [geometry])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
