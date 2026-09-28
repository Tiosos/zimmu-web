import * as THREE from 'three'
import type { AdjustableShelfAccessResult } from '../scene/carcaseParts'
import type { ShelfPose } from '../scene/interiorAccess'
import type { LocalBox } from '../scene/carcaseLayout'

// Playback follows the solver's linear centre/Euler interpolation between certified poses.
export function insertionPoseAt(result: AdjustableShelfAccessResult, progress: number): ShelfPose {
  const poses = result.path?.poses
  if (!poses?.length) {
    const b = result.shelfBox
    return {
      center: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 },
      rotation: { x: 0, y: 0, z: 0 },
    }
  }
  const index = Math.max(0, Math.min(poses.length - 1, progress))
  const a = poses[Math.floor(index)]
  const b = poses[Math.min(poses.length - 1, Math.floor(index) + 1)]
  const t = index - Math.floor(index)
  const mix = (v: number, w: number) => v + (w - v) * t
  return {
    center: {
      x: mix(a.center.x, b.center.x),
      y: mix(a.center.y, b.center.y),
      z: mix(a.center.z, b.center.z),
    },
    rotation: {
      x: mix(a.rotation.x, b.rotation.x),
      y: mix(a.rotation.y, b.rotation.y),
      z: mix(a.rotation.z, b.rotation.z),
    },
  }
}

function boxMesh(box: LocalBox, color: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity === 1,
    }),
  )
  mesh.position.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color }),
  )
  mesh.add(edges)
  return mesh
}

export function buildInsertionPreview(result: AdjustableShelfAccessResult) {
  const group = new THREE.Group()
  for (const obstacle of result.obstacles) {
    const mesh = boxMesh(obstacle.box, 0x94a3b8, 0.16)
    mesh.name = obstacle.role
    group.add(mesh)
  }
  const shelf = boxMesh(result.shelfBox, result.path ? 0x22d3ee : 0xfb7185, 0.85)
  shelf.name = result.role
  group.add(shelf)
  const entry = result.apertures.find((aperture) => aperture.id === result.path?.apertureId)
  if (entry) {
    const r = entry.rect
    const y = Math.min(0, ...result.obstacles.map((obstacle) => obstacle.box.y0)) - 0.1
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(r.x0, y, r.z0),
        new THREE.Vector3(r.x1, y, r.z0),
        new THREE.Vector3(r.x1, y, r.z1),
        new THREE.Vector3(r.x0, y, r.z1),
      ]),
      new THREE.LineBasicMaterial({ color: 0x4ade80, depthTest: false }),
    )
    outline.name = 'entry-opening'
    outline.renderOrder = 1
    group.add(outline)
  }
  const radius =
    Math.hypot(
      result.shelfBox.x1 - result.shelfBox.x0,
      result.shelfBox.y1 - result.shelfBox.y0,
      result.shelfBox.z1 - result.shelfBox.z0,
    ) / 2
  const bounds = new THREE.Box3().setFromObject(group)
  for (const pose of result.path?.poses ?? []) {
    bounds.expandByPoint(
      new THREE.Vector3(pose.center.x - radius, pose.center.y - radius, pose.center.z - radius),
    )
    bounds.expandByPoint(
      new THREE.Vector3(pose.center.x + radius, pose.center.y + radius, pose.center.z + radius),
    )
  }
  return { group, shelf, bounds }
}

export function applyInsertionPose(shelf: THREE.Object3D, pose: ShelfPose): void {
  shelf.position.set(pose.center.x, pose.center.y, pose.center.z)
  const d = Math.PI / 180
  shelf.rotation.set(pose.rotation.x * d, pose.rotation.y * d, pose.rotation.z * d, 'ZYX')
}

export function disposeInsertionPreview(group: THREE.Group): void {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    }
  })
}
