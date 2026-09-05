import { useEffect, useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'stats.js'
import type { Component, ComponentId, Part, PartId, CameraState } from '../scene/types'
import type { FaceHit } from '../scene/types'
import type { Outline } from '../scene/suggestionOutline'
import {
  computeFaceCorners,
  computeLocalFaceCenter,
  computeDowelLocalFaceCenter,
  computeSnapTransform,
} from '../scene/snapMath'
import { fitCameraToParts, fitFarPlane, nearPlaneForFar } from '../scene/fitCamera'
import { resolveWorldMatrix } from '../geom/transform'
import { isNodeVisible } from '../scene/componentTree'

interface ViewportProps {
  parts: Part[]
  componentMap: Map<ComponentId, Component>
  geometries: Map<PartId, THREE.BufferGeometry>
  selectedId: PartId | null
  onPartClick: (id: PartId | null) => void
  cameraStateRef: { current: CameraState }
  loadedCamera: CameraState | null
  fitRequest: number
  interactionActive: boolean
  onFaceClick: (hit: FaceHit) => void
  onFaceHover: (hit: FaceHit | null) => void
  sourceFace: FaceHit | null
  hoveredFace: FaceHit | null
  snapPhase: 'idle' | 'source-picked'
  flashTarget?: { id: PartId; seq: number } | null
  highlightedIds?: readonly PartId[] | null
  // Selected without being THE selected part — the members of a selected opening. Painted in the
  // selection colour rather than `highlightedIds`' amber, which already means "a joint is suggested
  // here" and would be carrying two meanings at once.
  selectedIds?: readonly PartId[]
  suggestionOutlines?: Outline[] | null
}

// Suggestion cut outlines get their own hue. They are drawn over a neighbour board whose edges are
// tinted amber, and amber-on-amber left the outline hard to pick out against the very board it sits
// on — more so now that a mortise & tenon draws up to five of them. Kept clear of the amber tint,
// the blue hover face, the cyan selection, and every entry in PART_COLORS.
const SUGGESTION_OUTLINE_COLOR = 0xf472b6

// Default camera clip planes, in mm. A Home fit of a scene wider than the far plane can reach past
// it, so the fit effect raises far to cover the framed bounds (see fitFarPlane) and lifts near with
// it (nearPlaneForFar) to hold the depth-buffer ratio steady.
const DEFAULT_NEAR_PLANE = 0.1
const DEFAULT_FAR_PLANE = 10000

const snapMat = (color: number) =>
  new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, linewidth: 1 })

const emptyGeo = () => {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(0), 3))
  return g
}

export function Viewport({
  parts,
  componentMap,
  geometries,
  selectedId,
  onPartClick,
  cameraStateRef,
  loadedCamera,
  fitRequest,
  interactionActive,
  onFaceClick,
  onFaceHover,
  sourceFace,
  hoveredFace,
  snapPhase,
  flashTarget,
  highlightedIds,
  selectedIds,
  suggestionOutlines,
}: ViewportProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshes = useRef<Map<PartId, THREE.Mesh>>(new Map())
  const edgeLines = useRef<Map<PartId, THREE.LineSegments>>(new Map())
  const flashMap = useRef<Map<PartId, number>>(new Map())
  const raycaster = useRef(new THREE.Raycaster())
  const mouseDown = useRef<{ x: number; y: number } | null>(null)
  const onClickRef = useRef(onPartClick)
  const partsRef = useRef<Part[]>(parts)
  const interactionActiveRef = useRef(interactionActive)
  const onFaceClickRef = useRef(onFaceClick)
  const onFaceHoverRef = useRef(onFaceHover)
  const sourceHighlightRef = useRef<THREE.LineLoop | null>(null)
  const hoverHighlightRef = useRef<THREE.LineLoop | null>(null)
  const suggestionHighlightRefs = useRef<THREE.LineLoop[]>([])
  const ghostMeshRef = useRef<THREE.Mesh | null>(null)
  const snapPhaseRef = useRef(snapPhase)
  const rafIdRef = useRef<number>(0)
  const lastMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const selectedIdRef = useRef<PartId | null>(selectedId)

  useLayoutEffect(() => {
    onClickRef.current = onPartClick
    partsRef.current = parts
    interactionActiveRef.current = interactionActive
    onFaceClickRef.current = onFaceClick
    onFaceHoverRef.current = onFaceHover
    snapPhaseRef.current = snapPhase
    selectedIdRef.current = selectedId
  })

  useEffect(() => {
    if (!flashTarget) return
    flashMap.current.set(flashTarget.id, performance.now())
  }, [flashTarget])

  function buildFaceHit(
    intersection: THREE.Intersection,
    meshMap: Map<PartId, THREE.Mesh>,
    currentParts: Part[],
  ): FaceHit | null {
    const mesh = intersection.object as THREE.Mesh
    let partId: PartId | null = null
    for (const [id, m] of meshMap) {
      if (m === mesh) {
        partId = id
        break
      }
    }
    if (!partId || !intersection.face) return null

    const part = currentParts.find((p) => p.id === partId)
    if (!part) return null

    if (part.kind === 'cylinder') {
      const ln = intersection.face.normal
      const isCap = Math.abs(ln.z) > 0.9
      const lhp = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())
      const localHitPoint = { x: lhp.x, y: lhp.y, z: lhp.z }
      const hitPoint = { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }

      if (isCap) {
        const sign = Math.sign(ln.z)
        const localFaceNormal = { x: 0, y: 0, z: sign }
        const wn = new THREE.Vector3(0, 0, sign).transformDirection(mesh.matrixWorld)
        const faceNormal = { x: wn.x, y: wn.y, z: wn.z }
        const lc = computeDowelLocalFaceCenter(localFaceNormal, part)
        const wc = new THREE.Vector3(lc.x, lc.y, lc.z).applyMatrix4(mesh.matrixWorld)
        const faceCenter = { x: wc.x, y: wc.y, z: wc.z }
        return { partId, faceNormal, faceCenter, localFaceNormal, localHitPoint, hitPoint }
      }

      // Lateral (curved) surface: radial normal; faceCenter is a placeholder
      // (isSnapFace rejects lateral faces for snapping; add-cut uses localHitPoint).
      const radial = new THREE.Vector3(ln.x, ln.y, 0).normalize()
      const localFaceNormal = { x: radial.x, y: radial.y, z: 0 }
      const wn = new THREE.Vector3(radial.x, radial.y, 0).transformDirection(mesh.matrixWorld)
      const faceNormal = { x: wn.x, y: wn.y, z: wn.z }
      return { partId, faceNormal, faceCenter: hitPoint, localFaceNormal, localHitPoint, hitPoint }
    }

    // Snap hit normal to nearest axis in local space
    const ln = intersection.face.normal
    const ax = Math.abs(ln.x),
      ay = Math.abs(ln.y),
      az = Math.abs(ln.z)
    let lx = 0,
      ly = 0,
      lz = 0
    if (ax >= ay && ax >= az) lx = Math.sign(ln.x)
    else if (ay >= ax && ay >= az) ly = Math.sign(ln.y)
    else lz = Math.sign(ln.z)
    const localFaceNormal = { x: lx, y: ly, z: lz }

    // Transform local normal to world space and snap again
    const wn = new THREE.Vector3(lx, ly, lz).transformDirection(mesh.matrixWorld)
    const wx = Math.abs(wn.x),
      wy = Math.abs(wn.y),
      wz = Math.abs(wn.z)
    let fnx = 0,
      fny = 0,
      fnz = 0
    if (wx >= wy && wx >= wz) fnx = Math.sign(wn.x)
    else if (wy >= wx && wy >= wz) fny = Math.sign(wn.y)
    else fnz = Math.sign(wn.z)
    const faceNormal = { x: fnx, y: fny, z: fnz }

    // Analytic face centre (no geometry vertex iteration)
    const lc = computeLocalFaceCenter(localFaceNormal, part)
    const wc = new THREE.Vector3(lc.x, lc.y, lc.z).applyMatrix4(mesh.matrixWorld)
    const faceCenter = { x: wc.x, y: wc.y, z: wc.z }

    const lhp = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert())
    const localHitPoint = { x: lhp.x, y: lhp.y, z: lhp.z }
    const hitPoint = { x: intersection.point.x, y: intersection.point.y, z: intersection.point.z }
    return { partId, faceNormal, faceCenter, localFaceNormal, localHitPoint, hitPoint }
  }

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
      DEFAULT_NEAR_PLANE,
      DEFAULT_FAR_PLANE,
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

    // Snap face highlight LineLoops
    const sourceLoop = new THREE.LineLoop(emptyGeo(), snapMat(0xfbbf24))
    const hoverLoop = new THREE.LineLoop(emptyGeo(), snapMat(0x60a5fa))
    sourceLoop.renderOrder = 1
    hoverLoop.renderOrder = 1
    sourceLoop.visible = false
    hoverLoop.visible = false
    scene.add(sourceLoop)
    scene.add(hoverLoop)
    sourceHighlightRef.current = sourceLoop
    hoverHighlightRef.current = hoverLoop
    // Suggestion loops are allocated on demand by the highlight effect, not fixed at two: a
    // suggestion's face count is not constant (tenon shoulders come back as a BoxCut[]).
    suggestionHighlightRefs.current = []

    const ghostPlaceholderGeo = new THREE.BufferGeometry()
    const ghostMat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0.35,
      roughness: 0.7,
      metalness: 0.0,
      flatShading: true,
      depthWrite: false,
    })
    const ghostMesh = new THREE.Mesh(ghostPlaceholderGeo, ghostMat)
    ghostMesh.visible = false
    ghostMesh.renderOrder = 2
    scene.add(ghostMesh)
    ghostMeshRef.current = ghostMesh

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
      const src = sourceHighlightRef.current
      if (src?.visible) {
        ;(src.material as THREE.LineBasicMaterial).opacity =
          0.3 + 0.7 * (Math.sin(Date.now() / 300) * 0.5 + 0.5)
      }
      const now = performance.now()
      for (const [id, startMs] of flashMap.current) {
        const t = Math.min(1, (now - startMs) / 400)
        const mesh = meshes.current.get(id)
        if (mesh) {
          const intensity = 1 - t
          ;(mesh.material as THREE.MeshStandardMaterial).emissive.setRGB(
            (0x60 / 255) * intensity,
            (0xa5 / 255) * intensity,
            (0xfa / 255) * intensity,
          )
        }
        if (t >= 1) {
          const m = meshes.current.get(id)
          if (m) {
            ;(m.material as THREE.MeshStandardMaterial).emissive.setHex(
              id === selectedIdRef.current ? 0x222244 : 0x000000,
            )
          }
          flashMap.current.delete(id)
        }
      }
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
      const hits = raycaster.current.intersectObjects(
        Array.from(meshes.current.values()).filter((m) => m.visible),
        false,
      )

      if (interactionActiveRef.current) {
        if (hits.length > 0) {
          const faceHit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          if (faceHit) onFaceClickRef.current(faceHit)
        }
        // in-mode: a miss is ignored (no deselect)
      } else {
        // Normal mode: route to onPartClick
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
    }

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseRef.current = { x: e.clientX, y: e.clientY }
      cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = requestAnimationFrame(() => {
        if (!interactionActiveRef.current) return
        const { x, y } = lastMouseRef.current
        const rect = renderer.domElement.getBoundingClientRect()
        const nx = ((x - rect.left) / rect.width) * 2 - 1
        const ny = -((y - rect.top) / rect.height) * 2 + 1
        raycaster.current.setFromCamera(new THREE.Vector2(nx, ny), camera)
        const hits = raycaster.current.intersectObjects(
          Array.from(meshes.current.values()).filter((m) => m.visible),
          false,
        )
        if (hits.length > 0) {
          const hit = buildFaceHit(hits[0], meshes.current, partsRef.current)
          onFaceHoverRef.current(hit)
        } else {
          onFaceHoverRef.current(null)
        }
      })
    }

    renderer.domElement.addEventListener('mousedown', handleMouseDown)
    renderer.domElement.addEventListener('click', handleClick)
    renderer.domElement.addEventListener('mousemove', handleMouseMove)

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(rafIdRef.current)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('mousedown', handleMouseDown)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      sourceHighlightRef.current?.geometry.dispose()
      hoverHighlightRef.current?.geometry.dispose()
      scene.remove(sourceLoop)
      scene.remove(hoverLoop)
      sourceLoop.material.dispose()
      hoverLoop.material.dispose()
      // Read the ref, not a captured local: the pool grows after mount.
      for (const loop of suggestionHighlightRefs.current) {
        loop.geometry.dispose()
        scene.remove(loop)
        ;(loop.material as THREE.LineBasicMaterial).dispose()
      }
      suggestionHighlightRefs.current = []
      ghostPlaceholderGeo.dispose()
      ghostMesh.material.dispose()
      scene.remove(ghostMesh)
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

  // Frame every visible part. Deliberately keyed on fitRequest alone: parts, camera and controls are
  // read at fire time, and re-running whenever they change would move the camera unbidden. The nonce
  // is a counter rather than a boolean so a second Home press fires again.
  useEffect(() => {
    if (fitRequest === 0) return
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return
    const next = fitCameraToParts(
      parts,
      camera.aspect,
      camera.fov,
      {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
      },
      componentMap,
    )
    if (!next) return
    camera.position.set(next.position.x, next.position.y, next.position.z)
    controls.target.set(next.target.x, next.target.y, next.target.z)
    // A scene wider than ~7 m frames at a distance whose far corners sit past the default far plane,
    // so the fit we just solved would render clipped. Raise the plane to reach them, lift the near
    // plane in step so the depth-buffer ratio stays put, and drop both back to their defaults when a
    // smaller scene no longer needs the extra range.
    const required = fitFarPlane(parts, next, componentMap)
    const far = required === null ? DEFAULT_FAR_PLANE : Math.max(DEFAULT_FAR_PLANE, required)
    const near = nearPlaneForFar(far, DEFAULT_NEAR_PLANE, DEFAULT_FAR_PLANE)
    if (camera.far !== far || camera.near !== near) {
      camera.far = far
      camera.near = near
      camera.updateProjectionMatrix()
    }
    controls.update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequest])

  // Mesh management — syncs Three.js scene to parts + geometries + selectedId
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const partMap = new Map(parts.map((p) => [p.id, p]))

    // Remove meshes for deleted parts
    for (const [id, mesh] of meshes.current) {
      if (!partMap.has(id)) {
        scene.remove(mesh)
        ;(mesh.material as THREE.Material).dispose()
        meshes.current.delete(id)
        flashMap.current.delete(id)
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

      const existing = meshes.current.get(part.id)
      if (!existing) {
        const mat = new THREE.MeshStandardMaterial({
          color: part.color,
          roughness: 0.7,
          metalness: 0.0,
          flatShading: true,
        })
        const mesh = new THREE.Mesh(geo, mat)
        // Placement comes from the component tree, not from position/rotation, so the local matrix
        // is written directly. With matrixAutoUpdate off Three never calls updateMatrix(), which is
        // what normally raises matrixWorldNeedsUpdate — so each assignment must raise it itself or
        // matrixWorld (which the raycaster reads) goes stale.
        mesh.matrixAutoUpdate = false
        mesh.matrix.fromArray(resolveWorldMatrix(part, componentMap))
        mesh.matrixWorldNeedsUpdate = true
        scene.add(mesh)
        meshes.current.set(part.id, mesh)
        mesh.visible = isNodeVisible(part, componentMap)

        const edgeMat = new THREE.LineBasicMaterial({ color: 0x1a1a1d })
        const el = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 15), edgeMat)
        el.matrixAutoUpdate = false
        el.matrix.copy(mesh.matrix)
        el.matrixWorldNeedsUpdate = true
        scene.add(el)
        edgeLines.current.set(part.id, el)
        el.visible = isNodeVisible(part, componentMap)
      } else {
        if (existing.geometry !== geo) {
          existing.geometry = geo
          const el = edgeLines.current.get(part.id)!
          el.geometry.dispose()
          el.geometry = new THREE.EdgesGeometry(geo, 15)
        }
        existing.matrix.fromArray(resolveWorldMatrix(part, componentMap))
        existing.matrixWorldNeedsUpdate = true
        const el = edgeLines.current.get(part.id)!
        el.matrix.copy(existing.matrix)
        el.matrixWorldNeedsUpdate = true
        existing.visible = isNodeVisible(part, componentMap)
        el.visible = isNodeVisible(part, componentMap)
        ;(existing.material as THREE.MeshStandardMaterial).color.set(part.color)
      }
    }

    // Selection + suggestion-hover highlight
    for (const [id, el] of edgeLines.current) {
      ;(el.material as THREE.LineBasicMaterial).color.setHex(
        id === selectedId || selectedIds?.includes(id)
          ? 0x4fc3f7
          : highlightedIds?.includes(id)
            ? 0xfbbf24
            : 0x1a1a1d,
      )
    }
    for (const [id, mesh] of meshes.current) {
      if (flashMap.current.has(id)) continue
      ;(mesh.material as THREE.MeshStandardMaterial).emissive.setHex(
        id === selectedId ? 0x222244 : 0x000000,
      )
    }
  }, [parts, componentMap, geometries, selectedId, highlightedIds, selectedIds])

  // Snap highlight update — rebuilds LineLoop geometry when faces change
  useEffect(() => {
    function drawLoop(loop: THREE.LineLoop | null, outline: Outline | null, color: number) {
      if (!loop) return
      if (outline === null) {
        loop.visible = false
        return
      }
      const OFFSET = 1.0
      const pos = new Float32Array(4 * 3)
      outline.corners.forEach((c, i) => {
        pos[i * 3] = c.x + outline.normal.x * OFFSET
        pos[i * 3 + 1] = c.y + outline.normal.y * OFFSET
        pos[i * 3 + 2] = c.z + outline.normal.z * OFFSET
      })
      loop.geometry.dispose()
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      loop.geometry = geo
      ;(loop.material as THREE.LineBasicMaterial).color.setHex(color)
      loop.visible = true
    }

    function updateHighlight(loop: THREE.LineLoop | null, face: FaceHit | null, color: number) {
      if (!loop) return
      if (face === null) {
        loop.visible = false
        return
      }
      const part = parts.find((p) => p.id === face.partId)
      if (!part || part.kind !== 'board') {
        loop.visible = false
        return
      }
      drawLoop(
        loop,
        { corners: computeFaceCorners(face, part, componentMap), normal: face.faceNormal },
        color,
      )
    }

    updateHighlight(sourceHighlightRef.current, sourceFace, 0xfbbf24)
    updateHighlight(hoverHighlightRef.current, hoveredFace, 0x60a5fa)
    // Grow the pool to whatever this suggestion needs rather than assuming a face count. The
    // pool never shrinks — a few hidden LineLoops cost nothing, and reusing them avoids
    // churning geometry on every hover.
    const sf = suggestionOutlines ?? []
    const pool = suggestionHighlightRefs.current
    const scene = sceneRef.current
    if (scene) {
      while (pool.length < sf.length) {
        const loop = new THREE.LineLoop(emptyGeo(), snapMat(SUGGESTION_OUTLINE_COLOR))
        loop.renderOrder = 1
        loop.visible = false
        scene.add(loop)
        pool.push(loop)
      }
    }
    for (let i = 0; i < pool.length; i++) {
      drawLoop(pool[i], sf[i] ?? null, SUGGESTION_OUTLINE_COLOR)
    }
  }, [sourceFace, hoveredFace, snapPhase, parts, componentMap, suggestionOutlines])

  // Ghost mesh — semi-transparent preview of the source part at its snapped destination
  useEffect(() => {
    const ghost = ghostMeshRef.current
    if (!ghost) return
    if (snapPhase !== 'source-picked' || !sourceFace || !hoveredFace) {
      ghost.visible = false
      return
    }
    const src = parts.find((p) => p.id === sourceFace.partId)
    if (!src || src.kind !== 'board') {
      ghost.visible = false
      return
    }
    const geo = geometries.get(src.id)
    if (!geo) {
      ghost.visible = false
      return
    }
    const { position, rotation } = computeSnapTransform(sourceFace, hoveredFace, src, componentMap)
    ghost.geometry = geo
    ghost.matrixAutoUpdate = false
    ghost.matrix.fromArray(resolveWorldMatrix({ ...src, position, rotation }, componentMap))
    ghost.matrixWorldNeedsUpdate = true
    ;(ghost.material as THREE.MeshStandardMaterial).color.set(src.color)
    ghost.visible = true
  }, [snapPhase, sourceFace, hoveredFace, parts, componentMap, geometries])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    mount.style.cursor = interactionActive ? 'crosshair' : ''
    return () => {
      mount.style.cursor = ''
    }
  }, [interactionActive])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
