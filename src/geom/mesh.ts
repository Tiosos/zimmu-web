import * as THREE from 'three'
import type { OpenCascadeInstance, TopoDS_Shape } from 'opencascade.js'

interface ShapeToGeometryOptions {
  linearDeflection?: number
  angularDeflection?: number
}

// Convert an OCCT TopoDS_Shape into a Three.js BufferGeometry by walking every
// face, asking OCCT to triangulate it, and copying the result into a non-indexed
// position+normal buffer. Flat-shaded normals per triangle for v0.1 — fine for a
// hard-edged box; smooth shading arrives when we have curves.
export function shapeToGeometry(
  oc: OpenCascadeInstance,
  shape: TopoDS_Shape,
  options: ShapeToGeometryOptions = {},
): THREE.BufferGeometry {
  const linearDeflection = options.linearDeflection ?? 0.1
  const angularDeflection = options.angularDeflection ?? 0.5

  const mesher = new oc.BRepMesh_IncrementalMesh_2(
    shape,
    linearDeflection,
    false,
    angularDeflection,
    false,
  )
  mesher.Perform()
  if (!mesher.IsDone()) {
    mesher.delete()
    throw new Error('OCCT meshing failed')
  }
  mesher.delete()

  const positions: number[] = []
  const normals: number[] = []

  // Pass embind enum objects directly — unwrapping to a plain number silently
  // makes Init() match zero faces.
  const faceEnum = oc.TopAbs_ShapeEnum.TopAbs_FACE
  const shapeEnum = (oc.TopAbs_ShapeEnum as unknown as Record<string, unknown>)
    .TopAbs_SHAPE

  const explorer = new oc.TopExp_Explorer_1()
  explorer.Init(shape, faceEnum, shapeEnum)
  while (explorer.More()) {
    const face = oc.TopoDS.Face_1(explorer.Current())
    const location = new oc.TopLoc_Location_1()
    const triHandle = oc.BRep_Tool.Triangulation(face, location)

    if (!triHandle.IsNull()) {
      const tri = triHandle.get()
      const transform = location.Transformation()
      const t = transform.TranslationPart()
      const tx = t.X()
      const ty = t.Y()
      const tz = t.Z()
      const m = transform.VectorialPart()
      const r00 = m.Value(1, 1)
      const r01 = m.Value(1, 2)
      const r02 = m.Value(1, 3)
      const r10 = m.Value(2, 1)
      const r11 = m.Value(2, 2)
      const r12 = m.Value(2, 3)
      const r20 = m.Value(3, 1)
      const r21 = m.Value(3, 2)
      const r22 = m.Value(3, 3)

      const nbTri = tri.NbTriangles()
      for (let i = 1; i <= nbTri; i++) {
        const triangle = tri.Triangle(i)
        const i1 = triangle.Value(1)
        const i2 = triangle.Value(2)
        const i3 = triangle.Value(3)

        const corners: Array<[number, number, number]> = []
        for (const idx of [i1, i2, i3]) {
          const node = tri.Node(idx)
          const lx = node.X()
          const ly = node.Y()
          const lz = node.Z()
          const x = r00 * lx + r01 * ly + r02 * lz + tx
          const y = r10 * lx + r11 * ly + r12 * lz + ty
          const z = r20 * lx + r21 * ly + r22 * lz + tz
          corners.push([x, y, z])
        }

        const [ax, ay, az] = corners[0]
        const [bx, by, bz] = corners[1]
        const [cx, cy, cz] = corners[2]

        const ux = bx - ax
        const uy = by - ay
        const uz = bz - az
        const vx = cx - ax
        const vy = cy - ay
        const vz = cz - az
        let nx = uy * vz - uz * vy
        let ny = uz * vx - ux * vz
        let nz = ux * vy - uy * vx
        const nLen = Math.hypot(nx, ny, nz) || 1
        nx /= nLen
        ny /= nLen
        nz /= nLen

        positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
      }
      triHandle.delete()
    }
    location.delete()
    face.delete()
    explorer.Next()
  }
  explorer.delete()

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  )
  geometry.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normals, 3),
  )
  return geometry
}
