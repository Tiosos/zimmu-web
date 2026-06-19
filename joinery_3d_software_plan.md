# Joinery 3D Design Software — Detailed Plan

**Document type:** Founding product & technical plan
**Audience:** Product owner, future contractors, prospective contributors
**Status:** v0.1 — working document, expected to evolve
**Date:** May 2026 · **Last updated:** June 2026

---

## Current state — June 2026

> This box summarises where the project actually stands. The sections below
> describe the full vision; refer here when you need the ground truth.

**Prototype:** Phase 0 ✅ and Phase 0.5 ✅ are both complete as a browser
prototype. The Rust/Tauri production build (Phase 1) has not started.

**What's working in the browser today:**
- Board parts with dimensions, material, color, position, rotation, visibility
- Snap/align mode and boolean joinery cuts with cut pairing (linked cuts)
- 50-entry undo/redo with dimension-edit coalescing
- File save/open/new via FSAPI (Chrome/Edge); graceful degradation on other browsers
- `.zimmu` flat-JSON project format — `FILE_FORMAT_VERSION = 2` (includes `materials` and `hardware`)
- Auto-reopen last file via IndexedDB; dirty tracking
- Three-tab BOM modal: Boards cutting list (with per-material cost), Hardware BOM (with linked-part checkboxes), Library (persistent material rates in IDB)
- Part duplication, removal (keyboard `Delete`/`Backspace`), visibility toggle
- STL + STEP 3D export; SVG + DXF 2D shop drawings (Face/Edge/End orthographic views)
- shadcn/ui + Radix primitives throughout; Tailwind v4
- 25 test files, 374 tests passing (Vitest + happy-dom + @testing-library/react)

**Still pending from Phase 0.5 original scope:**
- WASM geometry performance baseline instrumentation (not yet measured)
- `.zimmu` → `.zmu` file format migration utility (not yet written)

**Next milestone:** Rust geometry engineer hire; begin Phase 1 (Rust/Tauri core modeller).

---

## 1. Executive Summary

We are building a **desktop 3D joinery design application** for **designers and architects** who specify built woodwork — cabinetry, joinery, frame-and-panel work — and need their designs to be **buildable, dimensioned, and documentable** without dropping into another tool.

The product is best understood as **"SketchUp's ease + Plasticity's polish + a parametric joinery brain underneath, with first-class architectural drawing output."** It is a hybrid direct-and-parametric modeler whose distinctive value is a **smart joint library** that knows how parts attach and updates geometry automatically when dimensions change.

It is **open core under MPL 2.0**: the modeller, basic joint library, drawings, and standard exports are free and open source; premium joint libraries (traditional and Japanese joinery, decorative profiles), cloud sync, advanced BIM (full IFC import + Revit live-link), CNC/CAM export, and SLA support are paid.

**Technical foundation (production target):** OpenCASCADE Technology (OCCT) as the geometry kernel; Tauri (Rust + webview) as the application shell; Three.js + WebGPU for the 3D viewport; TypeScript/React for UI; a custom `.zmu` project file format.

**Technical foundation (v0.1 web prototype — current):** OCCT compiled to WebAssembly (`opencascade.js`) running in a Comlink-bridged Web Worker; Vite + React 19 + TypeScript; Three.js (WebGL) for the 3D viewport; File System Access API for file I/O; a `.zimmu` flat-JSON project file. The prototype validates the geometry seam and UX before committing to the full Rust/Tauri infrastructure (see §6).

**Timeline:** quality-driven, not date-driven. Realistic expectation with a small contracted senior team (2–3 engineers + part-time designer + part-time domain consultant) is **~12 months to internal beta, 18–30 months to a strong public v1.**

---

## 2. Product Vision & Positioning

### Vision

> *A modern desktop design tool that lets architects and designers draw built joinery with the speed of a sketch and the precision of a shop drawing — so that what they specify is what gets built.*

### The problem we're solving

Designers and architects today bridge three workflows badly:

1. **SketchUp** (or Vectorworks, Rhino) for concept and visualization — fast, but ignorant of joinery. Parts are mesh boxes, not buildable elements.
2. **Manual drawings or CAD overlays** for documentation — slow, prone to drift from the 3D model.
3. **Handoff to fabricators** — who re-model the work in shop tools like Cabinet Vision, Polyboard, or SWOOD because the designer's file isn't buildable.

The cost of this fragmentation is hours of duplicated modelling, miscommunicated joints, late design changes that don't propagate, and finished work that diverges from the design intent.

Our wedge is to **make the designer's first model the buildable one** — without forcing them into engineering-grade parametric CAD that they'll reject as too slow and too foreign.

### Positioning statement

> *For designers and architects who specify built joinery, **Zimmu** is a 3D design tool that produces buildable, dimensioned, BIM-compatible models in less time than SketchUp — because its parametric joint library understands how wood actually goes together.*

### What we are *not*

- **Not a fabrication tool.** We are not Cabinet Vision, Polyboard, or SWOOD. CNC export is a paid extension, not a core capability.
- **Not a generic CAD tool.** We are not Fusion 360 or SolidWorks. We do not chase mechanical engineering use cases.
- **Not a mesh modeller.** We are not Blender for furniture. Our model is parametric B-Rep, not polygonal.
- **Not a render-first tool.** Rendering is excellent and free, but it is not the primary loop — design is.

### Competitive landscape

| Tool | Strength | Why we win |
|---|---|---|
| **SketchUp + Polyboard + OpenCutList** | Designer market share, ecosystem | Joints are first-class, not bolted on |
| **Vectorworks Architect** | Architect workflow, BIM | Faster, modern UI, parametric joints, lower price |
| **Rhino + Grasshopper** | Power, flexibility | Designer-friendly, no Grasshopper learning curve required |
| **Fusion 360** | Parametric, free for hobbyists | Designer-oriented, not engineering-oriented |
| **Cabinet Vision / Polyboard** | Production cabinet rules | Architect-facing, not shop-floor; cross-domain |
| **FreeCAD** | Open source, parametric | Designer-friendly UX, joinery-specific |
| **Plasticity** | Modern direct-modelling UX | Joinery-aware, drawing output, BIM export |

The combination of **architect/designer focus + parametric joints + open core + modern desktop UX** is, to our knowledge, unoccupied.

---

## 3. Target Users & Personas

### Primary persona — Maya, architectural designer at a mid-size firm

- 33, mid-career, designs commercial and residential interiors
- Daily tools: Revit, SketchUp, Adobe Suite
- Specifies built-in cabinetry, joinery details, custom millwork on every project
- Currently produces SketchUp models + 2D detail drawings in AutoCAD — annoying because they drift apart
- Wants: a tool where the joinery detail and the 3D model are the same artefact
- Pain: handing off models to fabricators who say "we'll just re-model it"
- Will pay for: BIM integration, team licensing, cloud collaboration

### Secondary persona — Ben, principal of a small architecture practice

- 47, runs a 6-person practice, oversees production
- Buys software for the firm; cares about value, file longevity, integration
- Currently spends ~$15k/yr on Vectorworks + add-ons
- Wants: a tool his designers will actually use, that produces drawings clients trust
- Pain: training time, license cost, Revit integration headaches
- Will pay for: floating licenses, premium support, BIM/Revit live-link

### Tertiary persona — Sara, independent furniture designer

- 29, designs bespoke furniture, occasionally specifies built-ins
- Free tools: SketchUp Free, Fusion 360 personal
- Cares about: rendering quality, cut lists, fabricator handoff
- Will not pay (small business, low margin), but tells everyone about good free tools
- **Acquisition channel** — drives adoption, not revenue

### Anti-personas (explicitly *not* our user)

- The hobbyist who designs one bookshelf a year — too casual, served by SketchUp Free
- The CAM operator who programs CNCs — wrong end of the workflow
- The mechanical engineer designing metal brackets — wrong domain

---

## 4. v1 Scope & Non-Goals

### In scope for v1 (free, open core)

**Modelling**

- Hybrid direct-and-parametric modeller
- Multi-component assemblies (cabinets, casework, frame-and-panel constructions)
- Imperial and metric units, with regional standards (AS, AWI, AWMAC) selectable per project
- Materials with thickness, grain direction, finish

**Joint library — v1 ships with:**

- *Core cabinet joints:* butt (with screws/dowels), dowel, biscuit, pocket hole, rabbet/rebate, dado/housing, mitre
- *Frame & panel:* tongue and groove, cope and stick, bridle joint
- *Hardware-driven:* KD fittings (cam locks, Confirmat-style), Lamello / Clamex, hinges (cup hinges, butt hinges), drawer slides, shelf pins

**Drawings**

- Auto-generated plans, elevations, sections, joint details
- Dimensions, leader lines, annotations
- Title blocks, sheet management
- PDF export

**Rendering**

- Real-time PBR viewport
- One-click client render (final-quality path-traced still)
- Saved camera viewpoints, lighting presets

**Export**

- IFC (basic — wood elements, dimensions, materials)
- DWG/DXF (2D drawings)
- PDF (drawings, BOM)
- CSV (cut list, BOM)
- STEP (for CAD interchange — comes free with OCCT)
- glTF (for external renderers)

**Extensibility**

- Visual node editor for defining custom joints
- TypeScript scripting API (advanced power-user mode)
- Round-trip between visual nodes and code

### Paid extensions (commercial license, post-v1)

- **Premium Joint Library Pack** — mortise & tenon (8 variants), dovetails (through, half-blind, secret mitred, sliding), box / finger joints, lap joints, scarf joints, decorative profile joints, Japanese joinery pack (10–15 historically documented joints)
- **Cloud Sync & Collaboration** — real-time multi-user, version history, comments
- **Advanced BIM** — full IFC import, Revit live-link plugin, ArchiCAD plugin, classification mapping (Uniformat, Omniclass)
- **CNC/CAM Pack** — toolpath generation, post-processors for common controllers, nested sheet layout
- **Premium Support & Training** — SLA, onboarding, custom training
- **Vendor Hardware Catalogs** — Blum, Hettich, Häfele live catalogs (likely vendor-funded; may be free)

### Explicit non-goals for v1

- No CAM / G-code generation in free tier
- No timber-frame / heavy timber joinery (scarf, brace, tying joints — large-scale architectural)
- No upholstery, soft goods, or organic forms
- No mechanical sub-assemblies (e.g. drawer mechanisms beyond hardware catalog)
- No mobile / tablet support (deferred — strong demand may pull this forward)
- No real-time multi-user collaboration in free tier
- No FEA, structural analysis, or stress checks

---

## 5. Core User Workflows

These three workflows are the spine of v1 — every feature must serve one of them.

### Workflow A — "Sketch a cabinet" (60 seconds)

1. User opens app, picks "New cabinet" template (or just an empty project)
2. Drops a parametric carcase from the component palette — base cabinet, 600 × 720 × 560 mm
3. Adjusts dimensions in a sidebar; geometry updates live
4. Selects "Front" — adds shaker door from the components library; cope-and-stick joints auto-form between rails and stiles
5. Adds Blum hinges from hardware catalog — bore positions and clearances auto-calculated
6. Material applied (white oak, satin finish); render preview is immediately client-ready

**Why it matters:** This must feel faster and more *delightful* than SketchUp. If it isn't, we lose.

### Workflow B — "Document and issue" (15 minutes)

1. User clicks "Drawings" tab — app auto-generates plan, elevation, section sheets
2. User drags a "joint detail" view onto a sheet; selects the cope-and-stick joint at the door corner; detail is auto-dimensioned
3. User adjusts title block, adds project notes
4. Exports PDF set, DWG for the consultant team, IFC for the Revit-using architect
5. CSV cut list generated for fabricator handoff

**Why it matters:** This is the workflow architects pay for. If drawings aren't trustworthy and editable, we lose firm sales.

### Workflow C — "Change late" (the test of parametric)

1. Client requests cabinet depth changes from 560 mm to 600 mm two days before construction docs are due
2. User edits one dimension on the cabinet component
3. All joints update; all hardware re-positions; all drawings re-dimension; all sheets re-render; BOM/cut list regenerate
4. User reviews the change diff; re-issues PDF and IFC

**Why it matters:** This is the moment when our parametric foundation justifies itself versus SketchUp. If this works, we win firm-by-firm.

---

## 6. System Architecture

### Prototype vs. production target

The five-layer architecture below describes the **production target**. The v0.1 browser prototype implements a subset with different technology at each layer. The mapping is intentional: the prototype validates the geometry seam and UX contracts so the production layer boundaries are well-understood before committing to the full Rust/Tauri build.

| Layer | Production target | v0.1 prototype (current) |
|-------|------------------|--------------------------|
| 1 — Geometry kernel | OCCT via Rust crate (`zimmu-geom`) | `opencascade.js` WASM, loaded lazily in-browser |
| 2 — Parametric core | Pure Rust, feature graph + constraint solver | Not yet built; dimensions are plain React state |
| 3 — Application core | Rust; command pattern undo/redo; `.zmu` file format | TypeScript `useScene` hook; 50-entry closure-based undo; `.zimmu` flat JSON |
| 4 — UI | Tauri webview; Three.js + WebGPU; shadcn/ui | Vite dev server / browser; Three.js + WebGL; shadcn/ui + Radix primitives ✅ |
| 5 — Plugin surface | TypeScript API; signed marketplace | Not yet started |

The Comlink-bridged Web Worker (prototype Layer 1) intentionally mirrors the Tauri IPC contract (production Layer 3 → Layer 1), so the worker boundary can be replaced by Tauri `invoke()` calls with minimal UI changes.

---

The application is organised in five layers, bottom-up:

### Layer 1 — Geometry Kernel (Rust ↔ OCCT)

- **OpenCASCADE Technology (C++)** wrapped in a Rust binding crate
- Provides: B-Rep solids, booleans, fillet/chamfer, offsets, STEP/IGES I/O, hidden-line removal (HLR) for drawings, meshing for display
- Lives as a separate Rust crate (`zimmu-geom`) so it can be reused server-side later

### Layer 2 — Parametric Core (Rust)

- Owns the *feature graph* — the recipe for rebuilding any part or assembly
- Owns the *topology naming system* — persistent face/edge identifiers that survive rebuilds
- Owns the *constraint solver* — dimensional constraints, expressions
- Owns the *joint engine* — joint definitions, instances, evaluation
- Pure Rust; no UI dependencies; tested in isolation

### Layer 3 — Application Core (Rust)

- Project model, undo/redo (command pattern), file I/O (`.zmu`)
- Materials library, units, regional standards
- Drawing model (sheets, views, dimensions, annotations)
- Export pipelines (IFC, DWG, PDF, CSV, glTF, STEP)
- IPC layer to UI

### Layer 4 — UI (TypeScript / React / Three.js)

- React app inside the Tauri webview
- Three.js + WebGPU for the 3D viewport (consumes meshes computed by Layer 1)
- shadcn/ui + Radix primitives for controls
- Visual node editor (custom, built on React Flow or rete.js)
- Drawing view (SVG-based, fed by Layer 3's HLR output)
- Render mode (path-traced, three-gpu-pathtracer)

### Layer 5 — Plugin Surface

- TypeScript scripting API for joints, components, exporters
- Visual nodes are TypeScript under the hood (round-trippable)
- Plugin loader, sandboxing, signed plugin marketplace (post-v1)

### Data flow (simplified)

```
User action (UI)
  → Command dispatched to Application Core (Rust)
  → Updates Project Model
  → Feature graph re-evaluation (Parametric Core)
  → Joint engine resolves joint geometry
  → OCCT performs booleans and produces final B-Rep
  → Meshing produces display geometry
  → Streamed to UI viewport (Three.js)
  → Drawings/exports regenerate lazily on demand
```

### Why this layering matters

- **Geometry kernel is replaceable** — if OCCT proves limiting in five years, we can swap to a different kernel without rewriting the UI.
- **Headless mode is free** — running the parametric core without a UI lets us build CLI tools, CI testing of designs, and (later) a cloud render farm.
- **The UI is the easiest layer to iterate on** — most product changes will land here; we want UI engineers shipping fast.

---

## 7. Data Model

The project is a tree of typed objects, all addressable by stable UUIDs. Below are the core types.

> **v0.1 prototype data model (updated June 2026):** `ZimmuFile` (`FILE_FORMAT_VERSION = 2`) has `version`, `name`, `appVersion`, `units: 'mm'`, `createdAt`, `updatedAt`, `camera: CameraState`, and `scene: Scene`. `Scene` has `parts: Part[]`, `materials: Record<string, MaterialDef>` (keyed by name, carries `costPerM2`), and `hardware: HardwareItem[]`. A `BoardPart` has `kind: 'board'`, UUID `id`, `label`, `length`/`width`/`thickness` (mm), `material` (string, "" = unspecified), `color` (hex), `position`/`rotation` (Vec3 floats, degrees), `rotationOrder: 'XYZ'`, `visible: boolean`, and `cuts: CutDef[]`. A `CutDef` optionally carries `pairedCutId: "{partId}:{cutId}"` linking it to the mating cut on another part. A `HardwareItem` carries `id`, `name`, `qty`, `unit`, `supplier`, `partNumber`, `unitCost`, `notes`, and `linkedPartIds: string[]` (the board IDs this item is associated with). There is no assembly tree, no components — just a flat part array and the two supporting collections.

### Project

- Metadata (name, units, regional standard, owner)
- Materials library (project-level + linked to global)
- Hardware library (project-level + linked to global)
- Root assembly
- Drawings
- Render scenes

### Component

A reusable, parametric design unit (e.g. "base cabinet", "shaker door"). Has:

- Parameters (typed: length, count, boolean, choice)
- Constraints (expressions over parameters)
- Sub-parts and sub-components
- Joint instances
- Named ports (where it attaches to other components)

### Part

A single piece of material. Has:

- Geometry (B-Rep solid in OCCT)
- Feature history (the operations that built it)
- Material reference
- Grain direction
- Named topology (faces, edges, vertices with stable IDs)
- Custom attributes (for BOM, IFC, etc.)

### Joint

An instance of a joint definition placed between specific parts. Has:

- Reference to a `JointDefinition` (in a library)
- Bound participants (which parts play which role)
- Parameter values (overrides of defaults)
- Cached generated geometry (cuts, additions)

### JointDefinition

Lives in a library (built-in, premium pack, or user-defined). Has:

- Metadata (id, name, category, icon, documentation)
- Parameter schema (typed, with defaults, ranges, expressions, validation)
- Participant schema (named roles, type constraints: e.g. "must be a panel ≥ 12 mm thick")
- Generator function (TypeScript or node graph)
- Constraint rules (e.g. "tenon_length ≤ mortise_part.thickness × 0.75")
- Manufacturing metadata (for CNC export)

### Drawing

- Sheets (paper size, title block)
- Views (plan, elevation, section, detail, isometric)
- Dimensions, annotations, leader lines
- Symbols, hatching, line styles per regional standard

### Render Scene

- Camera, lighting (HDRI + lights), environment
- Material overrides (e.g. show in walnut for client A, oak for client B)
- Quality preset

---

## 8. The Parametric Joint Engine — Deep Dive

This is the heart of the product and our primary technical differentiator. It deserves its own section.

### The problem

When two wooden parts join, the joint geometry is a function of:

- The geometry and orientation of both parts
- The joint type and its parameters
- The materials involved (some joints assume certain wood thicknesses)
- Manufacturing constraints (e.g. mortise must clear router bit radius)
- User preferences (fit tolerance, joint exposure)

This function must:

1. **Run automatically** when parts are placed near each other in compatible orientations
2. **Update instantly** when any input changes
3. **Survive part edits** without losing its anchoring (the hard problem)
4. **Produce both visual geometry and manufacturing data**
5. **Be authoring-friendly** so users can extend it

### The core abstraction

A joint definition is, conceptually, a pure function:

```typescript
function generateJoint(
  participants: Map<RoleName, Part>,
  parameters: Map<ParamName, Value>,
  context: { units: UnitSystem; tolerance: number; }
): JointResult {
  // Compute geometry transformations
  // Return cuts, additions, hardware references, manufacturing ops
}

interface JointResult {
  cuts: Array<{ part: PartRef; tool: BRepSolid; }>;      // Boolean subtractions
  additions: Array<BRepSolid>;                            // New bodies (e.g. dowels)
  hardware: Array<HardwareInstance>;                      // Items from catalog
  manufacturingOps: Array<ManufacturingOp>;               // CNC, drilling, etc.
  validations: Array<Validation>;                         // Warnings/errors
}
```

The result is *applied* to the project model — boolean operations performed against participating parts, additions inserted into the assembly, hardware referenced for BOM, manufacturing ops attached for export.

### The topology naming problem (the hard part)

When a part rebuilds — say a panel resizes from 600 mm to 700 mm wide — its faces are recomputed. Without a naming scheme, the "front face" that the joint was anchored to is now a different `TopoDS_Face` object, and the joint loses its grip.

**Our solution:** every face/edge/vertex carries a *NamedReference* that is stable across rebuilds. The reference is computed from:

- The feature in the part's history that created it
- The position in the feature timeline
- A topological neighbourhood signature (adjacent feature operations)
- A geometric hint (normal direction, area class)

When a part rebuilds, the naming system re-attaches references to the new topology by matching signatures. This is the same approach FreeCAD's "Toponaming Next Gen" branch uses, and what Onshape calls anchors.

**Implementation note:** this is the #1 hardest problem in parametric CAD. We will invest disproportionately in it. The first hire after the geometry lead should be someone who has shipped a parametric kernel before, or we license/study FreeCAD's TNP branch carefully.

### Joint authoring — two surfaces

**Visual node editor** (the primary surface for designers):

- Inputs: participant parts, named faces, parameters
- Operations: extrude, sweep, boolean, transform, sketch primitives
- Outputs: cuts, additions, hardware
- Lives in a tab alongside the parameter inspector

**TypeScript scripting** (the power-user surface):

- Full access to the geometry kernel via a typed API
- Hot reloads in development mode
- Can be packaged as plugins
- Round-trip with visual nodes — every node graph compiles to TypeScript, and well-formed TypeScript can be reconstructed back to nodes

### A worked example — mortise & tenon

```typescript
export const mortiseAndTenon: JointDefinition = {
  id: "mortise_tenon",
  name: "Mortise & Tenon",
  category: "traditional",
  participants: [
    { name: "mortise_part", description: "Part receiving the mortise" },
    { name: "tenon_part", description: "Part with the tenon" },
  ],
  parameters: [
    { name: "tenon_length", type: "length", default: "mortise_part.thickness * 0.66" },
    { name: "tenon_width", type: "length", default: "tenon_part.width * 0.66" },
    { name: "tenon_thickness", type: "length", default: "tenon_part.thickness / 3" },
    { name: "shoulder", type: "length", default: "(tenon_part.thickness - tenon_thickness) / 2" },
    { name: "fit", type: "choice", options: ["snug", "loose"], default: "snug" },
  ],
  constraints: [
    "tenon_length <= mortise_part.thickness * 0.85",
    "tenon_thickness >= 6 mm",
  ],
  generate: (ctx) => {
    const { mortise_part, tenon_part } = ctx.participants;
    const { tenon_length, tenon_width, tenon_thickness, shoulder, fit } = ctx.parameters;

    const contactFace = findMatingFace(mortise_part, tenon_part);
    const tenonBody = buildTenon(tenon_part, tenon_length, tenon_width, tenon_thickness, shoulder);
    const mortiseTool = buildMortiseTool(contactFace, tenon_width, tenon_thickness, tenon_length, fit);

    return {
      cuts: [{ part: mortise_part, tool: mortiseTool }],
      additions: [tenonBody.minus(originalTenonEnd(tenon_part))],
      hardware: [],
      manufacturingOps: [
        { type: "cnc_mortise", part: mortise_part, /* ... */ },
        { type: "cnc_tenon", part: tenon_part, /* ... */ },
      ],
      validations: [],
    };
  },
};
```

The visual editor presents the same data as a node graph.

### Joint placement — how does a joint get created?

Three placement modes:

1. **Manual** — user selects two parts and a joint type from the catalog; UI prompts for any required face selections
2. **Drag-and-drop** — user drags a joint definition onto a contact region; system infers participants
3. **Auto-suggest** — when two parts are placed in compatible adjacency, the system suggests applicable joints with a chip in the corner of the viewport (dismissable)

Mode 3 is the magic UX moment. It should be tunable (off / suggest / auto-apply preferred joint type).

---

## 9. Hybrid Modelling Engine

### Two modes, one model

The application supports two modelling modes that operate on the same underlying B-Rep representation:

**Direct mode** (default): push/pull faces, drag edges, like SketchUp or Plasticity. Operations are recorded in the feature history but the user doesn't see the history by default — the model just updates.

**Parametric mode**: parameter inspector on the side, dimensions are first-class, expressions allowed. Like Fusion 360 but with the history hidden behind "Edit history" rather than always visible.

A power user can switch into "Show history" view to see and re-order operations. By default, the history is invisible to users.

### Why this works

- New users feel SketchUp speed
- Joints (which require parametric representation) work invisibly underneath
- When something needs to be changed late, the history is there to support it
- Plasticity has proven this combination is viable for direct manipulation

### Sketch and feature operations

Even in direct mode, the user is implicitly creating sketch+feature pairs. The UI shapes this so it doesn't feel like CAD:

- "Add a panel" creates a parameterised rectangular sketch + extrude
- "Cut a hole" creates a circular sketch on a face + cut extrude
- "Round the edge" creates a fillet feature on selected edges

Each operation can be re-edited from the small "feature handle" that appears in the timeline.

---

## 10. Drawing Engine

### Approach

OCCT provides hidden-line removal (HLR) — projecting a 3D B-Rep model to a 2D line drawing including hidden lines, tangent edges, and silhouettes. This is the foundation.

On top of HLR we layer:

- **Dimension manager** — auto-dimensions key features; user can add/edit
- **Annotation system** — leaders, text, symbols, hatching
- **Sheet system** — paper sizes, title blocks (templated, customisable per firm)
- **View manager** — plan, elevation, section, detail, isometric; each view is a saved camera + cut plane + display style

### Regional standards

Drawings respect the selected regional standard (AS 1100 for Australia, ISO 128 / 129, US ANSI Y14, AWI for North American architectural woodwork). Standards control:

- Dimension style (arrow heads, text placement, units display)
- Line types and weights
- Hatch patterns
- Title block conventions
- Default scales

### Output

- PDF (vector, with embedded fonts) — the primary deliverable
- DWG/DXF — for handoff to consultants on AutoCAD; uses LibreDWG or ODA (Open Design Alliance) for write — note ODA requires a paid membership (~$1,000/yr), worth budgeting
- SVG (internal representation, also exportable)

### A challenge worth flagging

The DWG format is contested. The most robust writer is the proprietary Open Design Alliance Teigha library; the open-source LibreDWG is improving but not yet production-grade for write. We should budget for ODA membership in year 1.

---

## 11. Render Engine

### Two-tier strategy

**Tier 1 — Real-time PBR viewport** (always on)

- Three.js + WebGPU
- PBR materials with normal/roughness/metallic maps
- HDRI environment lighting
- Real-time shadows, screen-space reflections, screen-space AO
- 60 fps target on modern hardware for typical project scenes (≤500k triangles)

**Tier 2 — Final render mode** (one click)

- `three-gpu-pathtracer` (free, open source, runs in WebGPU)
- Path-traced still images and turntable animations
- Denoising via Open Image Denoise (Intel) compiled to WASM
- 4K output, render times measured in seconds-to-minutes (not minutes-to-hours)

### Material system

- Built-in library: ~30 wood species with grain, ~20 finishes (matte/satin/gloss varnishes, oils, painted, laminate), ~15 metals, glass
- All materials are PBR-accurate (real albedo, real roughness — sourced from manufacturer data or measured)
- Custom material editor for user-defined materials
- Grain direction follows part orientation (the data model carries grain vectors per part)

### Why we render this well, for free

Rendering quality is the most visible "wow" factor for architects evaluating tools. We will not be undercut by SketchUp + V-Ray on quality, and we won't paywall it. The free version produces images good enough for the client wall.

---

## 12. BIM / Export Pipeline

### IFC export (free, v1)

- Wood-and-millwork-focused IFC4 export
- Maps our part/assembly hierarchy to `IfcFurnishingElement`, `IfcMember`, `IfcCovering`, etc.
- Carries materials, dimensions, classification (Uniformat II / Omniclass mapping in paid pack)
- Tested round-trip against Revit, ArchiCAD, BIM Vision viewer

### IFC import (paid)

- Read an architect's Revit-exported IFC and bring in walls, floors, openings as a fixed reference
- Snap joinery to walls and openings; clearances and tolerances respected
- Re-export with updated joinery without losing the architect's data

### DWG/DXF (free, v1)

- 2D drawings export
- Plan-level model export (cabinet outlines projected to plan view)

### Revit live-link (paid, post-v1)

- A Revit plugin that surfaces our model as Revit elements with bidirectional updates
- This is *substantial* work — likely a 4–6 month project on its own, well after v1

### Other formats

- STEP / IGES — free (OCCT provides natively)
- glTF / GLB — free (for downstream rendering pipelines)
- CSV / Excel — free (cut list, BOM)
- STL — free (for 3D printing prototypes)
- DXF for laser cutting / CNC nesting — paid (CNC pack)

---

## 13. Plugin SDK & Visual Node Editor

### Plugin types

- **Joint definitions** — new joint types
- **Components** — new parametric components (e.g. "Shaker door variant from this firm")
- **Exporters** — custom file format exporters
- **Importers** — custom file format importers
- **Generators** — procedural design helpers (e.g. "generate kitchen layout from room dimensions")
- **Catalogs** — hardware and material catalogs

### Authoring

- Plugins are **TypeScript packages** following a standard manifest
- Visual node graphs serialise to TypeScript (round-trippable)
- A built-in plugin editor with hot reload during development
- Plugin marketplace (post-v1) for distribution
- Plugins are signed; users can install unsigned plugins with a warning

### Sandboxing

Plugins run in a separate JavaScript context with capability-based access:

- File system: scoped to plugin's own data directory
- Network: declared in manifest, user must approve
- Geometry kernel: full read access, write only via the documented API
- UI: contributions are restricted to declared extension points (menus, panels, inspectors)

This matters because: third-party joint plugins from random sources could otherwise be a security liability. Sandboxing is non-negotiable.

### Visual node editor specifics

- Built on React Flow (mature, MIT-licensed, used by many products)
- Custom node types for geometry, parameters, selections
- Type system shown via socket colours and types
- Live preview of geometry as the graph is edited
- "Save as plugin" exports the graph + parameter schema as a `.zmu-plugin` package

---

## 14. File Format Specification

### `.zmu` project file

- Container format: **OCFL-style directory** zipped with `.zmu` extension (i.e. a zip with internal structure)
- Internal layout:

```
project.zmu/
  manifest.json              — version, units, metadata
  model/
    project.json             — the parametric tree (parts, components, joints)
    parts/
      <uuid>.brep            — OCCT B-Rep binary per part
      <uuid>.brep.cache      — last-computed cached mesh
  drawings/
    sheets.json
    sheet_<id>.svg
  renders/
    scene_<id>.json
    preview_<id>.png
  libraries/
    materials.json
    hardware.json
  plugins/                    — bundled custom plugins, if any
  history/                    — undo/redo and version history
```

### Why a directory-as-archive

- Diff-friendly for version control (a future cloud sync feature can sync individual files)
- Streaming-friendly (load metadata fast, geometry lazily)
- Future-compatible — schema evolution per file rather than monolithic
- Industry precedent: SKP, OFX, OCFL, DOCX all use this pattern

### Versioning

- Semantic version in manifest
- Forward-compatible reader (older readers refuse newer major versions cleanly)
- Migration utilities for major version bumps

### v0.1 prototype file format: `.zimmu`

While the production `.zmu` format is being designed, the browser prototype uses a simpler flat-JSON format with the `.zimmu` extension.

**Structure:** A single UTF-8 JSON file with this top-level shape (current: `FILE_FORMAT_VERSION = 2`):

```json
{
  "version": 2,
  "name": "My Cabinet",
  "appVersion": "0.0.0",
  "units": "mm",
  "createdAt": "2026-06-13T00:00:00.000Z",
  "updatedAt": "2026-06-13T12:00:00.000Z",
  "camera": { "position": { "x": 500, "y": -800, "z": 600 }, "target": { "x": 0, "y": 0, "z": 0 } },
  "scene": {
    "parts": [
      {
        "kind": "board",
        "id": "board_<uuid>",
        "label": "Side Panel",
        "length": 800, "width": 400, "thickness": 18,
        "material": "18mm Birch Ply",
        "color": "#d4a373",
        "position": { "x": 0, "y": 0, "z": 0 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "rotationOrder": "XYZ",
        "visible": true,
        "cuts": []
      }
    ],
    "materials": {
      "18mm Birch Ply": { "costPerM2": 42.50 }
    },
    "hardware": [
      {
        "id": "<uuid>",
        "name": "Hinge", "qty": 4, "unit": "pcs",
        "supplier": "Blum", "partNumber": "71B3550",
        "unitCost": 3.20, "notes": "",
        "linkedPartIds": ["board_<uuid>"]
      }
    ]
  }
}
```

**Key decisions:**
- All numeric fields are stored as floats rounded to 6 decimal places.
- `FILE_FORMAT_VERSION = 2` is checked on load; unknown versions are rejected.
- v1 → v2 migration: added `materials`, `hardware`, `appVersion`, `units`, `createdAt`, `updatedAt`, `camera`, and `rotationOrder` fields. Migration logic lives in `useFile.ts`.
- `visible` defaults to `true` on load for backward compatibility with pre-visibility saves (`p.visible ?? true`).
- No binary geometry is stored — geometry is recomputed from parameters on open.
- The `.zimmu` format will be migrated to `.zmu` before production; a migration utility is planned (not yet written — see Open Question 10).

---

## 15. Tech Stack — Detailed

| Layer | Production target | v0.1 prototype (current) | Reason |
|---|---|---|---|
| Geometry kernel | OpenCASCADE Technology (OCCT) via Rust crate | `opencascade.js` WASM (lazy singleton) | Mature, LGPL, B-Rep, STEP/IGES native; WASM build validates seam cheaply |
| Kernel bindings | Custom Rust bindings via `cxx` | Comlink-bridged Web Worker | Type-safe Rust ↔ C++ interop; Worker mirrors future Tauri IPC boundary |
| Application core | Rust | TypeScript `useScene` hook | Performance, safety; hook validates undo/redo architecture |
| Application shell | Tauri (Rust + system webview) | Vite dev server / browser tab | Lightweight, native feel; browser eliminates installer for early testing |
| UI framework | TypeScript + React 19 | TypeScript + React 19 | ✅ Same — largest talent pool, mature ecosystem |
| UI components | shadcn/ui + Radix primitives | shadcn/ui + Radix primitives ✅ | Implemented in Phase 0.5 |
| 3D viewport | Three.js + WebGPU (WebGL2 fallback) | Three.js r184 (WebGL) | De-facto standard; WebGPU deferred until baseline stable |
| File format | `.zmu` zip container (OCFL-style) | `.zimmu` flat JSON | Production format designed for streaming/VCS; flat JSON sufficient for prototype |
| File I/O | Tauri file dialog + Rust fs | File System Access API (Chrome/Edge only) | Native dialogs via Tauri; FSAPI validates UX, works in browser |
| Final render | three-gpu-pathtracer + Open Image Denoise | — | Deferred post-v1 |
| Visual node editor | React Flow | — | Deferred to parametric core milestone |
| Drawing engine | OCCT HLR → custom SVG → PDF via pdf-lib | Orthographic projections via `geom/drawing.ts` → SVG in `DrawingViewer` ✅ | Production: OCCT HLR. Prototype: custom geometric projection. PDF deferred. |
| DWG/DXF | LibreDXF (read) + ODA Teigha (write) | DXF 2D export via `ui/buildDxf.ts` ✅ | Prototype: line-based DXF (no ODA). Production: ODA license still TBD. |
| IFC | IfcOpenShell (LGPL) | — | Deferred to export milestone |
| State management | Zustand + Immer | React `useState` + closure-based undo | Simple hooks sufficient for prototype scale |
| IPC | Tauri commands (typed via specta or ts-rs) | Comlink + `postMessage` | Type-safe Rust ↔ TS; Comlink validates message-passing pattern |
| Plugin runtime | QuickJS in a sandboxed thread | — | Deferred post-v1 |
| Testing | Vitest (UI), cargo test (Rust), Playwright (E2E) | Vitest + happy-dom + @testing-library/react | ✅ Vitest in use; Rust and E2E deferred |
| CI | GitHub Actions | GitHub Actions | ✅ Same |
| Packaging | Tauri's built-in (MSI, DMG, AppImage) | — | Deferred until Tauri shell adopted |
| Auto-update | Tauri updater | — | Deferred |
| Telemetry (opt-in) | PostHog self-hosted | — | Deferred |
| Crash reporting | Sentry self-hosted | — | Deferred |

### Honest risks in this stack

- **OCCT learning curve.** Documentation is improving but historically sparse. Mitigation: hire someone who has shipped against OCCT before; reserve 2 months for kernel-layer ramp-up.
- **Rust + TypeScript talent.** Each is common; the intersection is smaller. Mitigation: the Rust ↔ TS boundary is well-defined; we can hire specialists per side.
- **Tauri immaturity (relative to Electron).** Tauri 2.0 (released 2024) is production-ready for most apps but has fewer community resources than Electron. Mitigation: fall back to Electron is reversible up to month 6.
- **WebGPU adoption.** WebGPU is well-supported on modern Chromium/Safari/Firefox; in Tauri we control the WebView. WebGL2 fallback covers older hardware. No real risk.
- **DWG write quality.** Open-source writers are weak. Mitigation: budget for ODA membership in year 1 (~USD $1,000/yr).
- **IFC fidelity.** IfcOpenShell is excellent but IFC is famously inconsistent across importers. Mitigation: extensive round-trip testing with Revit, ArchiCAD, and BIM Vision.
- **Prototype-to-production migration.** The v0.1 prototype validates the geometry seam and UX in the browser, but the production Rust/Tauri app is a near-complete rewrite of Layers 1–3. Risk: UX patterns proven in the prototype may not translate cleanly to the Rust IPC model; `.zimmu` file format will need migration to `.zmu`. Mitigation: design the Comlink worker boundary to mirror Tauri IPC contracts now; write a `.zimmu` → `.zmu` migration utility before v0.5 ships.
- **File System Access API browser lock-in.** The prototype's file I/O relies on the File System Access API, which is Chromium-only. Safari support is partial; Firefox has no support. Mitigation: FSAPI is intentionally a prototype-only dependency; production file I/O goes through Tauri's native file dialog. Document FSAPI requirement clearly in the prototype UI.

---

## 16. Hiring Plan

### Roles in priority order

1. **Senior geometry / CAD engineer (Rust + OCCT)** — *the most important hire.* Owns Layers 1–2. Must have shipped against OCCT, Parasolid, or another B-Rep kernel. Probably the hardest role to fill. Budget for a long search.
2. **Senior full-stack engineer (Rust + TypeScript)** — owns Layer 3 (application core) and the IPC seam. Comfortable across the stack.
3. **Senior front-end engineer (TypeScript + Three.js)** — owns Layer 4. Strong 3D experience (Three.js, Babylon, or Unity).
4. **Product designer (part-time → full-time)** — UX, brand, interaction design. Strong opinions about CAD/design tools. Probably part-time for first 6 months.
5. **Domain consultant (part-time)** — a working cabinetmaker, joiner, or architect who can validate the joint library, drawing conventions, regional standards. Likely 1 day/week.
6. **Technical writer / DX engineer** (year 2) — for documentation, plugin SDK examples, tutorials.

### Hiring sequence (recommended)

- **Months 0–2:** Find and onboard the geometry lead. Do not start anything else until this hire is made.
- **Months 1–3:** Hire full-stack engineer in parallel with geometry lead onboarding.
- **Months 2–4:** Hire front-end engineer once IPC contract is sketched.
- **Months 3+:** Part-time designer and domain consultant.

### Budget reality check

For senior contracted engineers, expect roughly USD $150–$220/hour depending on region. A small core team of 3 full-time-equivalent engineers + part-time designer/consultant runs roughly **USD $50–80k/month** in the first year. Plan for ~$700k–$1M to reach a strong v1, assuming an 18-month build.

Open core revenue should not be assumed for the first 18 months. Pre-revenue funding (personal, angel, or grant) is needed.

---

## 17. Phased Roadmap

The roadmap is organised in five phases. Phase exit criteria are explicit.

### Phase 0 — Foundation ✅ COMPLETE (browser prototype, June 2026)

**Goal:** prove the kernel-to-UI seam works; nothing user-facing.

**Status:** Complete as a browser prototype. The production Rust/Tauri version of this phase has not yet started; see Phase 0.5 below.

**What was built (v0.1 web prototype):**

- Vite + React 19 + TypeScript scaffold with strict mode, ESLint, Prettier
- `opencascade.js` (full WASM build, ~65 MB) bootstrapped via lazy dynamic import in a Comlink-bridged Web Worker
- Three.js r184 viewport with OrbitControls, +Z-up CAD camera, axes + grid helpers
- OCCT `TopoDS_Shape` → Three.js `BufferGeometry` conversion via `BRepMesh_IncrementalMesh`
- Multiple board parts with per-part label, dimensions, color, position, rotation, visibility
- Undo/redo (50-entry history, closure-based, coalesced consecutive dimension edits)
- Part visibility toggle (eye button in sidebar, `H` keyboard shortcut, viewport raycaster guard)
- Part duplication (`Ctrl+D`), selection, snap/align mode (`F`), cut mode (`C`)
- File save/open/new via File System Access API, `.zimmu` flat-JSON format (`FILE_FORMAT_VERSION = 1` at Phase 0; bumped to 2 in Phase 0.5)
- Auto-reopen last file on startup via IndexedDB handle persistence
- Vitest + @testing-library/react test suite (scene, file, keyboard shortcuts, UI)
- GitHub Actions CI

*Additions completed in Phase 0.5 (see below):* shadcn/ui, BOM modal, hardware BOM with linked parts, material library (IDB), 3D STL + STEP export, 2D shop drawings (SVG + DXF), part deletion keyboard shortcut, FSAPI graceful degradation, `FILE_FORMAT_VERSION = 2` (adds `materials`, `hardware`).

**What was NOT built in Phase 0 (production targets, deferred):**

- Rust/Tauri application shell, monorepo, native packaging
- Rust bindings for OCCT; STEP/IGES I/O
- Win/Mac packaging and auto-update

**Original exit criterion:** create a box in Rust, see it in Three.js, save and load via STEP.
**Achieved equivalent:** create boards in-browser via OCCT WASM, see them in Three.js, save and load via `.zimmu` JSON.

---

### Phase 0.5 — Browser Prototype Hardening ✅ COMPLETE (June 2026)

**Goal:** harden the browser prototype into a usable daily-driver tool that validates the full v0.1 product loop before starting the Rust/Tauri production build. This phase was not in the original plan; it was added after Phase 0 demonstrated that the browser-based approach can carry more of the product surface than initially expected.

**Deliverables:**

- ✅ **Joint engine (prototype):** snap/align and boolean cut modes; cut pairing (linked cuts) across mating parts; validates Workflow A before the Rust implementation
- ✅ **Cutting list / BOM:** three-tab BOM modal (Boards cutting list with cost, Hardware BOM with linked-part checkboxes, Library with persistent IDB rates)
- ✅ **shadcn/ui integration:** all controls replaced; design system established
- ✅ **FSAPI fallback:** shows "Save/Load requires Chrome or Edge" and disables file menu on non-Chromium browsers
- ✅ **Test coverage:** 374 tests across 25 files (Vitest + happy-dom + @testing-library/react); Playwright deferred
- ✅ **3D export:** STL (binary, world-space) + STEP (XCAF named solids)
- ✅ **2D shop drawings:** Face/Edge/End orthographic projections with dimensions; SVG + DXF download
- ✅ **Material library:** persistent cost rates in IDB `library` store; merged with per-file `scene.materials` at BOM layer
- ✅ **Hardware BOM:** items link to board parts; linked items visible in sidebar EditPanel
- ✅ **`FILE_FORMAT_VERSION = 2`:** adds `materials`, `hardware`, `appVersion`, `units`, `camera`, `rotationOrder` to the schema
- ⏳ **WASM performance baseline:** geometry build time instrumentation not yet written
- ⏳ **`.zimmu` → `.zmu` migration utility:** not yet written (see Open Question 10)

**Exit criterion:** a real woodworker can design a simple cabinet (4 boards, 2 dados, 1 rabbet), export a cutting list as CSV, save the project, close the browser, reopen it the next day, and continue editing — with no data loss. *Met for the core loop.*

**Relationship to Phase 1:** Phase 0.5 is a parallel track, not a prerequisite. The Rust/Tauri Phase 1 build can begin in parallel once the geometry Rust engineer is hired (see §16). Phase 0.5 outputs feed directly into Phase 1 requirements (joint UX validation, file format spec, performance budgets).

---

### Phase 1 — Core Modeller (months 3–9)

**Goal:** a usable direct-modelling tool with the parametric foundation in place.

**Status: partial** — Some Phase 1 goals have been prototyped in the browser (see Phase 0.5), but the production Rust/Tauri implementation has not started. The browser prototype covers: board parts with dimensions, save/load, undo/redo, and basic cut operations. Feature graph, topology naming, fillet/chamfer, materials, and `.zmu` format remain unbuilt.

- Feature graph + topology naming system
- Direct modelling: extrude, cut, fillet, chamfer
- Parts and components
- Materials (basic library, no PBR maps yet)
- Selection, gizmos, transforms
- Project save/load (`.zmu`)
- Undo/redo

**Exit criterion:** design a basic cabinet by hand (no joints), save, reopen, edit.

### Phase 2 — Joint Engine (months 9–14)

**Goal:** the differentiator works.

- Joint definition format, evaluator, instances
- v1 joint library (cabinet + frame & panel + hardware)
- Auto-suggest joints based on part adjacency
- Joint parameter editing UI
- Hardware library (basic — generic hinges, slides, pins)

**Exit criterion:** Workflow A (60-second cabinet) is real and feels good.

### Phase 3 — Documentation Engine (months 14–20)

**Goal:** the model produces real, deliverable drawings.

- HLR-based 2D views (plan, elevation, section)
- Dimensions and annotations
- Sheet system, title blocks, regional standards
- PDF export
- DWG export (with ODA license)
- BOM and cut list
- Basic IFC export
- Visual node editor for custom joints

**Exit criterion:** Workflow B (document and issue) is real. Real architects can deliver a project.

### Phase 4 — Polish & Launch (months 20–26)

**Goal:** public beta.

- PBR rendering polish, final-render mode
- Joint library hardening (real cabinetmaker review, edge cases)
- Plugin SDK and sandbox
- Visual node editor → TypeScript round trip
- Onboarding, in-app tutorials, sample projects
- Documentation site, video tutorials
- Open source release; private beta → public beta → 1.0

**Exit criterion:** v1.0 ships, monetisation infrastructure live, first paid customers.

### Phase 5 — Commercial Foundations (months 26–36)

**Goal:** premium products and sustainable revenue.

- Premium Joint Library Pack (traditional + Japanese joinery)
- Cloud sync MVP
- Revit live-link plugin
- CNC export pack
- Vendor catalog integrations (Blum first)
- Enterprise licensing infrastructure

---

## 18. Open Core Monetisation — Detail

### Pricing instinct (to be validated, not committed)

- **Free / OSS** — full core product, MPL 2.0
- **Pro plan** — USD $20/month/seat (individual designers, freelancers)
  - Cloud sync, version history
  - Premium joint pack
  - Priority email support
- **Firm plan** — USD $50/month/seat (5+ seats)
  - Everything in Pro
  - Multi-user collaboration
  - Revit live-link
  - Shared firm library
  - Phone support
- **Studio plan** — custom (50+ seats, manufacturers, training providers)
  - Everything in Firm
  - SLA, dedicated support
  - On-prem deployment
  - Custom integrations

### Anchors

- Vectorworks: ~AUD $4,000 perpetual + ~$800/yr maintenance
- SketchUp Pro: USD $349/yr
- Revit: USD $2,805/yr
- Cabinet Vision: USD $4,000+/yr
- Polyboard: USD $2,000+/yr
- Plasticity: USD $149 one-time (indie), $299 (studio)

Our pricing sits below Vectorworks and Revit, comparable to or slightly above SketchUp Pro on a per-year basis, justified by the BIM/joint differentiation.

### Where the leverage is

- **Cloud sync / collaboration** is the strongest annual recurring lock-in
- **Revit live-link** is the gateway to firms that already standardised on Revit
- **Joint library packs** are upsells inside the app (impulse buys, $19–$49 each)
- **Vendor co-funded catalogs** (Blum, Hettich) are the ones we want them to pay us for, not the user

---

## 19. Licensing & Governance

### License: MPL 2.0 for core; commercial license for paid extensions

- **MPL 2.0** is file-level copyleft. Anyone can fork the core; modifications to MPL-licensed files must be open-sourced; new files added (e.g. paid extensions, internal plugins) can have any license.
- Paid extensions ship under a **commercial license** (proprietary EULA).
- Plugins authored by the community can choose their own license; we recommend MIT or MPL but don't require it.

### Contributor License Agreement (CLA)

We require a CLA from external contributors so that we can dual-license if needed and protect against patent claims. Use the Apache-style CLA (Individual + Corporate).

### Trademark

- Register the product name as a trademark in your home jurisdiction (Australia, likely the EU and US too — budget ~$3–5k all-in)
- The trademark protects the brand even when the code is forked

### Governance model

- **Year 1:** benevolent owner (you). All commit access through core team.
- **Year 2–3:** establish a small steering committee — 2 internal, 1–2 external respected contributors. Documented decision-making.
- **Long term:** consider a foundation structure (similar to Blender Foundation) once revenue and community size warrant it. Premature; revisit at $1M ARR or 10k+ users.

---

## 20. Naming — Zimmu

**Chosen name: Zimmu.**

### Rationale and dual etymology

*Zimmu* is anchored on two Chinese readings of the syllables *zimu* (子母 / 梓木 in pinyin), with the doubled M as a deliberate brand-design choice that signals styled spelling and disambiguates from common pinyin homophones.

**Primary etymology — 子母 (zǐmǔ): the principle of complementary mating parts**

子 *zǐ* (child / male / inserting part) and 母 *mǔ* (mother / female / receiving part) form one of the foundational concepts in Chinese mechanical and design vocabulary. 子母 names the relationship of any two complementary parts that fit together — the metaphysics of joinery itself, expressed in two characters.

- **子母榫 (zǐmǔ sǔn)** — "mother-and-child joint": the Chinese woodworking term for nested or wrapped joints where one part is contained or cradled by another
- **子母扣 (zǐmǔ kòu)** — the snap fastener / press stud
- **子母配合 (zǐmǔ pèihé)** — "child-mother fit": the engineering term for complementary fit between mating components

A joinery design tool, fundamentally, generates 子母 relationships on every joint it creates. The name *is* the product's first principle.

**Secondary etymology — 梓木 (zǐmù): the carpenter's wood**

梓 *zǐ* is a remarkable character. Literally it names the catalpa tree, the wood traditionally prized for fine Chinese cabinetry and for the woodblocks used in classical Chinese printing. Culturally, 梓 became the classical Chinese term for the carpenter's trade itself:

- **梓人 (zǐrén)** — the skilled carpenter
- **梓匠 (zǐjiàng)** — the master woodworker
- **付梓 (fùzǐ)** — literally "to commit to catalpa-wood," meaning "to send to print" (because printing blocks were made from 梓木)

So 梓木 carries two meanings at once: a specific premium hardwood, and *the carpenter's wood* — the material of the trade.

### Why the doubled M

Plain *Zimu* in standard pinyin will be read by Chinese speakers as 字母 (alphabet/letters) or 字幕 (subtitles) — these are the most common everyday meanings of the syllables. **Doubling the M to *Zimmu* signals immediately that this is a styled brand name**, creates trademark space, and lets the intended 子母 and 梓木 readings surface in brand context. The double-M is also a structural design choice: it forms the visual heart of the wordmark — two parallel vertical strokes anchoring the centre of the name.

### Pronunciation

- **Mandarin:** *zǐ-mǔ* — pronounced approximately *DZUH-moo* (third tone on both syllables in the 子母 reading; third-fourth in the 梓木 reading).
- **English (pragmatic):** *ZIM-moo* — natural English approximation, stress on the first syllable.

We will not police English speakers toward Mandarin pronunciation. International brands routinely accept pronunciation drift — compare *MUJI*, *Xiaomi*, *Wacom*, *Lenovo*, all of which are pronounced very differently in their home markets vs internationally and have suffered no brand penalty.

### Why this name is strong

- **Two layered Chinese readings, both directly joinery-relevant.** The primary 子母 reading names the principle of mating joinery; the secondary 梓木 reading names the carpenter's wood. Sophisticated Chinese-speaking customers pick up both layers; Western markets read it as a clean, slightly East-Asian-flavoured tech brand.
- **Short and modern.** Five letters — Z-I-M-M-U — same length as *Figma*, *Slack*, *Loom*. Crisper than seven-letter names.
- **Strong wordmark visual.** Angular Z opens, vertical I sets the rhythm, doubled M anchors the centre (read visually as a pair of small columns — on-brand for an architectural joinery tool), soft U closes.
- **No obvious major brand collision** in software classes in English-speaking markets. In China, the doubled-M spelling distances the brand from 字母 and 字幕 homophones.
- **Pronounces easily in both Chinese and English.** Frictionless for the target markets.
- **Bridges two of the world's deepest joinery traditions** — Chinese mortise-and-tenon (榫卯) heritage and the broader East-Asian woodcraft world (Japan's 寄木 / 継手, Korea's 짜맞춤) on one side; the German/European cabinetmaking tradition the product also engages on the other. The brand can speak fluently to both.

### Trademark search plan

Jurisdictions, in order of priority — the priority order shifts because the name is Chinese-rooted:

1. **China — CNIPA** (China National Intellectual Property Administration, cnipa.gov.cn). Highest priority because the name is Chinese; the largest market where pinyin readings matter; mainland China requires direct filing or careful Madrid Protocol extension.
2. **Hong Kong — IPD** (Intellectual Property Department, ipd.gov.hk). Critical for the Hong Kong design and architecture market; common-law system separate from mainland.
3. **Taiwan — TIPO** (Taiwan Intellectual Property Office). Separate from mainland China; significant design and joinery culture, premium furniture market.
4. **Australia — IP Australia** (atmoss.ipaustralia.gov.au). Home market.
5. **United States — USPTO TESS.** Largest English-language software market.
6. **EU — EUIPO** (eSearch plus). Covers the EU single market.
7. **Defensive:** **Singapore — IPOS** (major Southeast-Asian design hub) and **Japan — JPO** (given the East-Asian framing).

Nice classifications to search:

- **Class 9** — computer software
- **Class 42** — design and development of computer software, SaaS
- *Optional:* **Class 41** — education and training services

If trademarks clear in priority jurisdictions, file internationally via the **Madrid Protocol** through WIPO. Note: China requires careful Madrid handling and ideally a parallel local filing — engage an attorney with mainland-China filing experience.

Budget: ~AUD $6–10k for searches and primary filings; ~AUD $20–30k for full international coverage including China.

### Domain acquisition plan

Register all of the following in a single sweep before any public mention of the name:

**Primary (canonical use candidates):**

- `zimmu.studio`
- `zimmu.design`
- `zimmu.app`
- `zimmu.dev`

**Defensive — Chinese-language markets:**

- `zimmu.cn` and `zimmu.com.cn` — mainland China
- `zimmu.hk` — Hong Kong
- `zimmu.tw` and `zimmu.com.tw` — Taiwan

**Defensive — general:**

- `zimmu.io`, `zimmu.so`, `zimmu.co`
- `getzimmu.com`, `usezimmu.com` (in case `.com` is held)
- `zimmu.com.au` (home market)

**`.com` check:** `zimmu.com` should be checked via WHOIS immediately. If available, register at once; if held, do not chase aggressively until the product has revenue.

**Social handles to reserve in parallel** (free of charge, takes one afternoon):

- GitHub: `@zimmu` (and `zimmu-app` as defensive)
- GitLab and Codeberg (defensive open-source mirrors)
- Discord (server name)
- Mastodon, Bluesky, X / Twitter, LinkedIn organisation page, Threads
- YouTube channel
- npm scope `@zimmu` (for the future plugin SDK)
- **Chinese-market presence:** WeChat Official Account, Weibo, Xiaohongshu (RED) — increasingly important for design and architecture audiences in Chinese markets

### Brand voice implications

Anchoring the brand in Chinese roots (with the doubled-M signalling that it's a styled global brand, not a literal pinyin word) gives the product a distinct dual-cultural voice:

- **For Chinese-language markets:** surface the 子母 and 梓木 etymology in documentation, marketing, and developer-facing copy. Reads as a respectful, technically-precise tool grounded in Chinese craft tradition.
- **For Western markets:** reads as a clean, slightly East-Asian-flavoured modern tech brand — the same way *MUJI*, *Wacom*, *Anker*, *Lenovo* read as international without explanation. The 子母 / 梓木 origins are available to the curious but not foregrounded.
- **Tone register:** quietly confident, technical, precise; modernist visual language; restraint over flourish.

Reference brand voices and visual systems to study:

- **MUJI** (Japanese 無印良品) — for restraint, material focus, dual-cultural authority
- **Vitra** and **USM Modular Furniture** — for European modernist authority
- **Karakter Copenhagen** — for restraint and material focus
- **Linear**, **Plasticity**, **Figma** — for modern software-brand discipline
- **Xiaohongshu (RED) interior-design accounts** — for how the East-Asian design audience consumes visual content

### Product naming family

- **Product:** Zimmu (the application)
- **Chinese product name (for Chinese-language markets):** 子母 (zǐmǔ) — used on Chinese-language documentation, marketing, and the Chinese website; *Zimmu* remains the global Latin-script brand
- **File extension:** `.zmu`
- **Rust crate prefix:** `zimmu-*` (e.g. `zimmu-geom`, `zimmu-core`, `zimmu-app`, `zimmu-cli`)
- **Premium product names:**
  - Zimmu Traditional Joinery Pack (Chinese 榫卯 + Japanese 継手 + Western traditional joints)
  - Zimmu Japanese Joinery Pack
  - Zimmu Cloud (sync + collaboration)
  - Zimmu Revit Bridge
  - Zimmu CNC Pack
  - Zimmu Studio (enterprise tier)
- **Plugin format:** `.zmu-plugin`
- **Primary domain (recommended):** `zimmu.studio`
- **Verb usage in product copy:** *Zimmu* used as both noun and verb in product writing — "Zimmu a cabinet in 60 seconds"; "files I've Zimmu'd" — to reinforce brand recognition.

---

## 21. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Cannot hire OCCT-experienced engineer | Medium | High | Reserve 3+ months for search; consider FreeCAD community as recruiting pool |
| Topology naming proves harder than expected | High | High | Study FreeCAD TNP branch deeply before designing ours; consider licensing/forking |
| Drawing engine doesn't satisfy architect quality bar | Medium | High | Engage 3+ architect users before Phase 3 starts; co-design |
| IFC interop falls short of Revit firms' needs | Medium | Medium | Allocate dedicated round-trip testing budget; aim for IFC4 + IFC2x3 export |
| DWG write quality is poor (no ODA budget) | Low (if budgeted) | Medium | Budget ODA membership year 1 |
| Tauri proves immature for our needs | Low | Medium | Electron fallback path documented; reversible up to month 6 |
| Open core monetisation doesn't take off | Medium | Existential | Have 24 months of runway; pivot to consulting/services if needed |
| Big incumbent ships a competing parametric SketchUp | Medium | High | Move fast; differentiate on architect/BIM focus; build community moat |
| Joint library is too narrow for real projects | Medium | Medium | Domain consultant review; private beta with 5+ working architects before public release |
| Bus factor on geometry lead | High initially | High | Document kernel layer aggressively; pair-program; second hire in geometry by month 12 |

---

## 22. Open Questions & Decisions Pending

These are the questions still to resolve, in priority order:

1. **Zimmu trademark clearance** — name is locked in; verification still pending in CNIPA (China — highest priority since the name is Chinese), Hong Kong IPD, Taiwan TIPO, IP Australia, USPTO, and EUIPO. This is the only remaining blocker on full public brand launch.
2. **Funding plan** — bootstrapped, angel, or grant? Determines hiring pace
3. **Domain consultant identification** — who is the cabinetmaker / joiner / architect we trust as our reference user?
4. **Geographic focus for first beta** — Australia (your home market, AS 1100 ready) or international from day one?
5. **Hardware vendor partnerships** — initial outreach to Blum/Hettich/Häfele for catalog co-development (post-Phase 2)
6. **Hosting and infrastructure choices** for cloud sync (post-v1, but inform the data model now)
7. **Community management strategy** — when do we open the Discord, GitHub Discussions, Loomio, etc.?
8. **Public messaging and launch positioning** — strict open-source-first announcement, or stealth until beta?
9. **Browser prototype vs. Tauri transition timing** — should Phase 0.5 (browser hardening) reach full beta quality before the Rust/Tauri build starts, or should both tracks run in parallel? The parallel approach is faster but risks UX drift between the prototype and the production app. The sequential approach gives cleaner user research data but delays the production build by ~3 months.
10. **File extension finalisation** — the prototype uses `.zimmu`; the production plan uses `.zmu`. Should `.zimmu` be locked in as the permanent extension (simpler, more descriptive) or should we migrate to `.zmu` at v0.5 as originally planned? Decision needed before Phase 0.5 exits.

---

## 23. Immediate Next Steps

This week:

1. **Trademark search — Zimmu.** Search CNIPA (China — highest priority, the name is Chinese), Hong Kong IPD, Taiwan TIPO, IP Australia (ATMOSS), USPTO TESS, EUIPO eSearch plus. Search Nice classes 9 and 42. Engage an Australian trademark attorney with mainland-China filing experience and Madrid Protocol capability. Budget AUD $6–10k for primary jurisdictions.
2. **Domain acquisition — Zimmu.** Acquire in one sweep: `zimmu.studio`, `zimmu.design`, `zimmu.app`, `zimmu.dev`, `zimmu.io`, `zimmu.com.au`, plus Chinese-market defensive: `zimmu.cn`, `zimmu.com.cn`, `zimmu.hk`, `zimmu.tw`, `zimmu.com.tw`. Check WHOIS on `zimmu.com` immediately — register if available. Fallbacks: `getzimmu.com`, `usezimmu.com`.
3. **Reserve handles.** GitHub org `zimmu` (and `zimmu-app` as defensive), GitLab, Codeberg, Discord server, Mastodon, Bluesky, X, LinkedIn org page, YouTube channel, npm scope `@zimmu`. For Chinese-market presence: WeChat Official Account, Weibo, Xiaohongshu (RED).
4. **Job description** for the geometry engineer role — start the search now; this is the long pole

Next 30 days:

5. **Identify domain consultant** — reach out to 3–5 architects/joiners in your network
6. **Draft technical RFP / brief** for the geometry engineer search
7. **Funding plan** finalisation
8. **OCCT spike** — fund a 2-week paid spike with a candidate (or independently) to validate the kernel approach end-to-end (Rust bindings → Tauri → Three.js)

Next 90 days:

9. Onboard geometry engineer
10. ✅ Complete Phase 0 (foundation seam working end-to-end) — *done*
11. Begin Phase 1 (core modeller)

### Technical — Phase 0.5 status (June 2026)

Phase 0.5 is complete for the core loop. Status of the original task list:

**Done:**

1. ✅ **Cutting list panel** — three-tab BOM modal with boards, hardware, library tabs
2. ✅ **shadcn/ui integration** — all controls replaced; design system live
3. ✅ **Joint engine (snap/align hardening)** — snap/align + boolean cut modes + cut pairing
4. ✅ **FSAPI fallback** — shows "Save/Load requires Chrome or Edge"; menu items disabled
5. ✅ **Test coverage** — 374 tests across 25 files; Playwright deferred

**Still pending:**

6. ⏳ **WASM performance baseline** — `performance.mark` instrumentation not yet added; needed before Phase 1 hardware can be specified
7. ⏳ **`.zimmu` → `.zmu` migration utility** — not yet written (see Open Question 10)
8. ⏳ **Resolve Open Question 9** (sequential vs. parallel tracks) and **Open Question 10** (`.zimmu` vs. `.zmu` extension) — both needed before fully closing Phase 0.5

---

## Appendix A — Reference projects to study

- **FreeCAD** — for the parametric kernel architecture, especially the Toponaming Next Gen branch
- **Plasticity** — for direct-modelling UX done modern
- **Blender** — for Geometry Nodes (visual node editor inspiration) and open-source product strategy
- **Onshape** — for cloud parametric, document/anchor model
- **Polyboard** — for cabinet-specific parametric logic
- **SketchUp Live Components** — for the parametric component user experience
- **OpenCutList** — for cut list / BOM generation conventions in cabinetmaking
- **Vectorworks Architect** — for architect-facing smart objects and drawing conventions
- **IfcOpenShell** — for IFC implementation
- **Tauri docs and example apps** — for the application framework

## Appendix B — Glossary

- **B-Rep** — Boundary Representation, a way of describing 3D shapes as connected faces, edges, vertices. The foundation of solid modelling. Contrast with mesh / polygonal.
- **OCCT** — OpenCASCADE Technology, the open-source B-Rep kernel
- **IFC** — Industry Foundation Classes, the open BIM file format
- **HLR** — Hidden Line Removal, the algorithm that turns 3D into 2D line drawings
- **PBR** — Physically-Based Rendering, the modern realistic rendering approach
- **MPL** — Mozilla Public License, file-level copyleft licence
- **CLA** — Contributor License Agreement
- **CAM** — Computer-Aided Manufacturing (toolpaths, G-code)
- **BIM** — Building Information Modelling
- **AWI** — Architectural Woodwork Institute (North American standards)
- **AS** — Australian Standards (e.g. AS 1100 for technical drawing)

---

*End of document. This is a living plan; expect substantial revision after the first geometry hire is made and the kernel spike is complete.*
