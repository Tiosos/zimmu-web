import type { Part } from '../scene/types'

const DEG2RAD = Math.PI / 180

// Column-major (THREE Matrix4.elements layout). Equivalent to
// new THREE.Matrix4().compose(position, quaternion(Euler XYZ deg), (1,1,1)).
export function composeWorldMatrix(part: Part): Float64Array {
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
