/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
}

// File System Access API — not yet in lib.dom.d.ts for all targets
interface FileSystemFileHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  createWritable(): Promise<FileSystemWritableFileStream>
}
interface FileSystemWritableFileStream {
  write(data: string | BufferSource | Blob): Promise<void>
  close(): Promise<void>
}
interface Window {
  showSaveFilePicker(options?: {
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }): Promise<FileSystemFileHandle>
  showOpenFilePicker(options?: {
    types?: Array<{ description: string; accept: Record<string, string[]> }>
  }): Promise<FileSystemFileHandle[]>
}

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
      Triangulation: (face: TopoDS_Face, location: TopLoc_Location) => OcHandle<Poly_Triangulation>
    }
    TopLoc_Location_1: new () => TopLoc_Location
    BRepPrimAPI_MakeCylinder_1: new (radius: number, height: number) => OcShapeBuilder
    BRepPrimAPI_MakeCylinder_3: new (
      axes: OcHandleLike,
      radius: number,
      height: number,
    ) => OcShapeBuilder
    BRepBuilderAPI_Transform_2: new (
      shape: TopoDS_Shape,
      trsf: gp_Trsf,
      copy: boolean,
    ) => OcShapeBuilder
    BRepAlgoAPI_Cut_3: new (
      base: TopoDS_Shape,
      tool: TopoDS_Shape,
    ) => OcShapeBuilder & { IsDone(): boolean }
    gp_Trsf_1: new () => gp_Trsf
    gp_Vec_4: new (x: number, y: number, z: number) => OcHandleLike
    gp_Pnt_3: new (x: number, y: number, z: number) => OcHandleLike
    gp_Dir_4: new (x: number, y: number, z: number) => OcHandleLike
    gp_Ax1_2: new (origin: OcHandleLike, direction: OcHandleLike) => OcHandleLike
    gp_Ax2_3: new (origin: OcHandleLike, direction: OcHandleLike) => OcHandleLike
    BRep_Builder: new () => {
      MakeCompound(compound: TopoDS_Compound): void
      Add(compound: TopoDS_Shape, shape: TopoDS_Shape): void
      delete(): void
    }
    TopoDS_Compound: new () => TopoDS_Compound
    STEPControl_Writer_1: new () => {
      Transfer(shape: TopoDS_Shape, mode: unknown, compound: boolean): unknown
      Write(filename: string): unknown
      delete(): void
    }
    STEPControl_StepModelType: { STEPControl_AsIs: unknown }
    Interface_Static: { SetCVal(name: string, value: string): unknown }
    FS: { readFile(path: string, options: { encoding: 'utf8' }): string }
    // Anything else on the kernel is reachable but untyped, so using it is a deliberate cast.
    [key: string]: unknown
  }

  // Native handles are freed by hand; every constructed OCCT object must be deleted.
  export interface OcHandleLike {
    delete(): void
  }
  export interface OcShapeBuilder extends OcHandleLike {
    Shape(): TopoDS_Shape
  }
  export interface gp_Trsf extends OcHandleLike {
    SetTranslation_1(vector: OcHandleLike): void
    SetRotation_1(axis: OcHandleLike, angle: number): void
    SetValues(
      a11: number,
      a12: number,
      a13: number,
      a14: number,
      a21: number,
      a22: number,
      a23: number,
      a24: number,
      a31: number,
      a32: number,
      a33: number,
      a34: number,
    ): void
  }
  export type TopoDS_Compound = TopoDS_Shape

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
