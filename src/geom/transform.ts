import type { Component, ComponentId, Part, Vec3 } from '../scene/types'
import { ancestorsOf } from '../scene/componentTree'

const DEG2RAD = Math.PI / 180

// Column-major (THREE Matrix4.elements layout). Equivalent to
// new THREE.Matrix4().compose(position, quaternion(Euler XYZ deg), (1,1,1)).
export function composeWorldMatrix(part: Part | Component): Float64Array {
  const x = part.rotation.x * DEG2RAD
  const y = part.rotation.y * DEG2RAD
  const z = part.rotation.z * DEG2RAD
  const cx = Math.cos(x)
  const sx = Math.sin(x)
  const cy = Math.cos(y)
  const sy = Math.sin(y)
  const cz = Math.cos(z)
  const sz = Math.sin(z)

  // Rotation for THREE Euler order 'XYZ' (R = Rx * Ry * Rz), row-major r[row][col]:
  const r00 = cy * cz
  const r01 = -cy * sz
  const r02 = sy
  const r10 = cx * sz + sx * sy * cz
  const r11 = cx * cz - sx * sy * sz
  const r12 = -sx * cy
  const r20 = sx * sz - cx * sy * cz
  const r21 = sx * cz + cx * sy * sz
  const r22 = cx * cy

  const m = new Float64Array(16)
  m[0] = r00
  m[1] = r10
  m[2] = r20
  m[3] = 0
  m[4] = r01
  m[5] = r11
  m[6] = r21
  m[7] = 0
  m[8] = r02
  m[9] = r12
  m[10] = r22
  m[11] = 0
  m[12] = part.position.x
  m[13] = part.position.y
  m[14] = part.position.z
  m[15] = 1
  return m
}

// Apply a column-major 4x4 to (x,y,z) as a position (w=1).
export function applyMatrixToPoint(
  m: Float64Array,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

// Apply the inverse of a rigid (rotation + translation, unit-scale) column-major matrix to a
// point. Since scale is 1, the rotation block is orthonormal ⇒ inverse rotation = transpose:
// local = Rᵀ · (world − t).
export function applyInverseToPoint(
  m: Float64Array,
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  const dx = x - m[12]
  const dy = y - m[13]
  const dz = z - m[14]
  return [
    m[0] * dx + m[1] * dy + m[2] * dz,
    m[4] * dx + m[5] * dy + m[6] * dz,
    m[8] * dx + m[9] * dy + m[10] * dz,
  ]
}

// Column-major, same layout and convention as composeWorldMatrix. Equivalent to
// THREE Matrix4.multiply (a * b).
export function multiplyMatrix(a: Float64Array, b: Float64Array): Float64Array {
  const m = new Float64Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      m[col * 4 + row] =
        a[row] * b[col * 4] +
        a[4 + row] * b[col * 4 + 1] +
        a[8 + row] * b[col * 4 + 2] +
        a[12 + row] * b[col * 4 + 3]
    }
  }
  return m
}

// A node's placement in world space, composing every ancestor component's local matrix.
// For parentId === null this returns exactly composeWorldMatrix(node) — the identity that lets
// the component tree land without changing any existing behaviour.
export function resolveWorldMatrix(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): Float64Array {
  let m = composeWorldMatrix(node)
  for (const ancestor of ancestorsOf(node, byId)) {
    m = multiplyMatrix(composeWorldMatrix(ancestor), m)
  }
  return m
}

// The frame a node's local position/rotation are expressed IN — the product of its ancestors,
// excluding its own local matrix. Identity for a top-level node, which is why a top-level part's
// local values are also its world values.
export function ancestorWorldMatrix(
  node: Part | Component,
  byId: Map<ComponentId, Component>,
): Float64Array {
  let m: Float64Array = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
  for (const ancestor of ancestorsOf(node, byId)) {
    m = multiplyMatrix(composeWorldMatrix(ancestor), m)
  }
  return m
}

// A direction expressed in a node's local frame, rotated into world space. Reads the rotation
// block of the resolved matrix, so it picks up ancestor rotation without re-deriving Euler order —
// and deliberately skips the translation column, which a direction must not receive.
export function localDirToWorld(
  node: Part | Component,
  dir: Vec3,
  byId: Map<ComponentId, Component>,
): Vec3 {
  const m = resolveWorldMatrix(node, byId)
  return {
    x: m[0] * dir.x + m[4] * dir.y + m[8] * dir.z,
    y: m[1] * dir.x + m[5] * dir.y + m[9] * dir.z,
    z: m[2] * dir.x + m[6] * dir.y + m[10] * dir.z,
  }
}
