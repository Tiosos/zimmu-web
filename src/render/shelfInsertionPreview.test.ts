import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { adjustableShelfAccessResults } from '../scene/carcaseParts'
import { CARCASE_PRESETS, PRESET_MATERIALS } from '../scene/carcasePresets'
import { roleThicknessFor } from '../scene/resolveThickness'
import {
  applyInsertionPose,
  buildInsertionPreview,
  disposeInsertionPreview,
  insertionPoseAt,
} from './shelfInsertionPreview'

const params = CARCASE_PRESETS[0].params
const result = () =>
  adjustableShelfAccessResults(params, roleThicknessFor(params, PRESET_MATERIALS, new Map()))[0]

describe('shelf preview geometry', () => {
  it('uses the exact solver obstacles and finishes at the manufactured shelf box without changing data', () => {
    const data = result()
    const before = JSON.stringify(data)
    const preview = buildInsertionPreview(data)
    expect(preview.group.children).toHaveLength(data.obstacles.length + 2)
    expect(preview.group.getObjectByName('entry-opening')).toBeDefined()
    for (const obstacle of data.obstacles) {
      const mesh = preview.group.getObjectByName(obstacle.role)!
      const bounds = new THREE.Box3().setFromObject(mesh)
      expect(bounds.min.toArray()).toEqual([obstacle.box.x0, obstacle.box.y0, obstacle.box.z0])
      expect(bounds.max.toArray()).toEqual([obstacle.box.x1, obstacle.box.y1, obstacle.box.z1])
    }
    applyInsertionPose(preview.shelf, insertionPoseAt(data, Infinity))
    const bounds = new THREE.Box3().setFromObject(preview.shelf)
    expect(bounds.min.toArray()).toEqual([data.shelfBox.x0, data.shelfBox.y0, data.shelfBox.z0])
    expect(bounds.max.toArray()).toEqual([data.shelfBox.x1, data.shelfBox.y1, data.shelfBox.z1])
    expect(JSON.stringify(data)).toBe(before)
    const dispose = vi.spyOn(preview.shelf.geometry, 'dispose')
    disposeInsertionPreview(preview.group)
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('applies compound rotations in the same Rz Ry Rx order as the solver', () => {
    const object = new THREE.Object3D()
    const pose = { center: { x: 50, y: 60, z: 70 }, rotation: { x: 30, y: -40, z: 60 } }
    applyInsertionPose(object, pose)
    object.updateMatrixWorld()
    const vertex = new THREE.Vector3(100, 20, 9)
    const expected = vertex
      .clone()
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), (-40 * Math.PI) / 180)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 3)
      .add(new THREE.Vector3(50, 60, 70))
    expect(vertex.applyMatrix4(object.matrixWorld).distanceTo(expected)).toBeLessThan(1e-10)
  })

  it('interpolates only between witnessed poses and displays blocked shelves at the target', () => {
    const data = result()
    const a = data.path!.poses[0]
    const b = data.path!.poses[1]
    expect(insertionPoseAt(data, 0.5).center.y).toBeCloseTo((a.center.y + b.center.y) / 2)
    expect(insertionPoseAt(data, -10)).toEqual(a)
    const blocked = { ...data, path: null }
    expect(insertionPoseAt(blocked, 42)).toEqual(insertionPoseAt(data, Infinity))
  })
})
