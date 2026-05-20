/// <reference types="vite/client" />

// opencascade.js@1.x ships no TS types. Declare the surface weekend 1 touches.
// Wider typing lives in v0.2 once joint definitions reach beyond box+mesh.
declare module 'opencascade.js' {
  export interface OpenCascadeInstance {
    BRepPrimAPI_MakeBox_1: new (
      dx: number,
      dy: number,
      dz: number,
    ) => {
      Shape(): TopoDS_Shape
      delete(): void
    }
    BRepMesh_IncrementalMesh_2: new (
      shape: TopoDS_Shape,
      linearDeflection: number,
      isRelative: boolean,
      angularDeflection: number,
      isInParallel: boolean,
    ) => {
      Perform(): void
      IsDone(): boolean
      delete(): void
    }
    TopExp_Explorer_1: new () => TopExp_Explorer
    TopAbs_ShapeEnum: {
      TopAbs_FACE: { value: number } | number
    }
    TopoDS: {
      Face_1: (shape: TopoDS_Shape) => TopoDS_Face
    }
    BRep_Tool: {
      Triangulation: (
        face: TopoDS_Face,
        location: TopLoc_Location,
      ) => OcHandle<Poly_Triangulation>
    }
    TopLoc_Location_1: new () => TopLoc_Location
    [key: string]: unknown
  }

  export interface TopoDS_Shape {
    delete(): void
  }
  export interface TopoDS_Face {
    delete(): void
  }
  export interface TopExp_Explorer {
    Init(shape: TopoDS_Shape, type: unknown, avoid?: unknown): void
    More(): boolean
    Next(): void
    Current(): TopoDS_Shape
    delete(): void
  }
  export interface TopLoc_Location {
    Transformation(): {
      TranslationPart(): { X(): number; Y(): number; Z(): number }
      VectorialPart(): { Value(row: number, col: number): number }
    }
    delete(): void
  }
  export interface Poly_Triangulation {
    NbNodes(): number
    NbTriangles(): number
    Node(index: number): { X(): number; Y(): number; Z(): number }
    Triangle(index: number): {
      Value(corner: number): number
    }
    delete(): void
  }
  export interface OcHandle<T> {
    IsNull(): boolean
    get(): T
    delete(): void
  }

  export const initOpenCascade: () => Promise<OpenCascadeInstance>
  export default initOpenCascade
}
