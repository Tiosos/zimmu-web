# Zimmu UI Redesign — Concept A Design Specification

**Version:** 1.0
**Date:** 2026-11-20
**Status:** Approved direction · high-fidelity interactive prototype
**Scope:** `a-workbench.html` (single-file prototype, English only)

---

## 1. Overview

Concept A — the **Three-Column Workbench** — is the selected direction for the Zimmu UI redesign. It is a full rebuild of the product interface with a classic CAD/DCC information architecture: every tool and dataset remains visible, the keyboard is a first-class input, and dense information is organized into fixed, predictable regions.

The prototype is a self-contained HTML file that implements five perspectives, sixteen cabinet-editor tabs, fifteen viewport interaction modes, twelve manufacturing workflows, and a complete dark design system. It is a design artifact, not production code: it does not modify the React application.

### 1.1 Goals

| Goal | How the prototype addresses it |
|---|---|
| Maximum information density | Persistent toolbars, scene tree, inspector and status bar; no hidden navigation |
| Keyboard-first operation | Shortcut hints on every tool and mode; Select `V`, Move `G`, Snap `F`, Cut `C`, joints `J/L/M/B/T/D` |
| Predictable structure | Fixed three-column layout; all detail pages reached through one perspective switcher |
| Complete detail coverage | Every major product surface has real content and working interactions |
| Visual refinement | Higher contrast, tighter hierarchy, improved iconography within the existing dark+amber identity |

### 1.2 Non-goals

- Implementing the prototype in React / TypeScript (a separate delivery stage)
- Changing the geometry engine, file format, or manufacturing logic
- Redesigning Concepts B and C (preserved unchanged for comparison)

---

## 2. Design system

All three concepts share one design system in `shared.css`; Concept A applies its own refinements in the `<style>` block of `a-workbench.html` and the `.concept-a` accent variables.

### 2.1 Color tokens

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `hsl(222 10% 7%)` | Application background, status bar |
| `--bg-1` | `hsl(222 9% 10%)` | Panel base |
| `--bg-2` | `hsl(222 8% 13%)` | Raised cards, hover targets |
| `--bg-3` | `hsl(222 7% 17%)` | Inputs, active tabs |
| `--line` | `hsl(222 6% 20%)` | Panel borders, dividers |
| `--fg-0` | `hsl(220 14% 95%)` | Primary text |
| `--fg-1` | `hsl(220 10% 78%)` | Secondary text |
| `--fg-2` | `hsl(220 7% 58%)` | Labels |
| `--accent` | `hsl(28 88% 57%)` | Amber — selection, active state, primary actions |
| `--cyan` | `hsl(189 90% 56%)` | Precision / selection highlights |
| `--green` / `--amber` / `--red` | — | Readiness, status and validation states |

Concept A additionally defines `--a-hi: hsl(28 95% 64%)` and `--a-lo: hsl(28 70% 42%)` for the logo and active-indicator gradients.

### 2.2 Typography

- **UI:** Inter, system fallback. Sizes 10 / 11 / 12 / 14 / 17 px (`--fs-xs` … `--fs-xl`).
- **Numeric / technical:** JetBrains Mono with tabular figures for dimensions, IDs, hashes, coordinates and KPIs.
- **Labels:** uppercase, `0.1em` letter spacing, `--fs-xs`, used for section titles and toolbar group labels.

### 2.3 Components

Buttons (ghost / outline / solid / accent / icon), segmented controls, compound dimension inputs (`label + value + mm`), switches, radio-style option cards, badges, status dots, tables with sticky headers, tree rows, modals, tooltips, progress bars and KPI cards. All are implemented in the shared stylesheet and reused across perspectives.

---

## 3. Information architecture

A single top-level **perspective switcher** replaces the need to navigate between separate windows. Five perspectives cover the complete product workflow.

```
Zimmu · Concept A — Three-Column Workbench
├── 01 Workbench          default modeling surface
├── 02 Cabinet Editor     parametric cabinet configuration
├── 03 Viewport Modes     interaction state reference & lab
├── 04 Manufacturing      production, export & review workflows
└── 05 Project & Room     project structure & space planning
```

Deep links: `a-workbench.html#view=cabinet`, `#view=modes`, `#view=manufacture`, `#view=project`.

### 3.1 Perspective 01 — Workbench

The default, highest-density surface.

- **Top bar:** brand, menu bar (File / Edit / View / Design / Manufacture / Help), project title with dirty indicator, undo/redo, Cutting List and Readiness actions.
- **Toolbar:** four groups — Select (Select, Move, Measure), Modeling (Add Part, Face Snap, Cut), Joinery (Dado, Half-lap, Mortise & Tenon, Dowel, Finger, Tongue & Groove), View (Grid, Visibility, Exploded).
- **Left panel:** tabs Scene Tree / Project / Library, search field, hierarchical tree with visibility toggles, "Add Cabinet Component" action.
- **Center:** 3D viewport with isometric cabinet scene, selection highlight with dimension callout, view cube, compass, scale bar, zoom controls, floating mode toolbar and contextual hint pill. A bottom tab strip switches the center between **3D Model / Plan Layout / Section / Part Unfold**, each with its own drawing content.
- **Right panel:** inspector with Properties / Joints / Cut / Material / Hardware tabs, compound dimension fields, transform, component structure and a link to the full Cabinet Editor.
- **Status bar:** OCCT state, part/joint counts, active mode, world coordinates, scale, autosave state.

### 3.2 Perspective 02 — Cabinet Editor

A dedicated surface for the sixteen parametric cabinet tabs.

- **Layout:** header with cabinet identity and commit action; left grouped navigation; horizontal tab strip; left control column (378 px); right live-preview canvas with exploded/section/fit controls; footer with geometry sync status.
- **Navigation groups:** Structure (4), Appearance (5), Services (3), Views (4).
- **Preview:** front elevation with overall dimensions by default; the `3D` tab swaps to the shared isometric cabinet scene. Exploded View renders a separated board; Section Cut toggles the preview state.

#### The sixteen tabs

| # | Tab | Representative controls |
|---|---|---|
| 1 | Section | Section type (single/double/corner), panel mode, side/back thickness, scribe, notch, panel list |
| 2 | Construction | Carcase type, joinery preset, assembly flags, dowel Ø/pitch, dado/dowel options |
| 3 | Placement | Anchor (floor/wall/freestanding), XYZ, rotation, clearance, auto-level, wall scribe, neighbours |
| 4 | Layout | Bay width/depth/height, columns, rows, symmetry, opening sequence |
| 5 | Finishing | Finish type, sheen, coats, grain, color swatches, grain matching, UV protection |
| 6 | Fronts & Drawers | Front style, thickness, reveal, drawer box type, soft-close, front list |
| 7 | Shelves & Interiors | Shelf count/thickness/depth, adjustable, drawer insert, divider, lighting, system holes |
| 8 | Materials | Material-by-part table, stock sheet size, utilization, library link |
| 9 | Edgebanding | Band material, corners, per-edge selection, pre-machining banding |
| 10 | Appliance Bays | Appliance list with status, service clearances, add appliance |
| 11 | Service Openings | Electrical/water/drain/gas openings, offsets, back-panel cut |
| 12 | Hardware | Hardware schedule table with quantities and status, BOM link |
| 13 | Front | Front elevation dimensions, reveal, handle/grain display, view options |
| 14 | Top | Top type, thickness, overhang, material, mitred edge |
| 15 | End | End panel type, thickness, scribe, decorative end, neighbour info |
| 16 | 3D | Shaded/wireframe/x-ray/exploded display, dimensions/joints/hardware toggles, projection |

### 3.3 Perspective 03 — Viewport Modes

A reference and testing surface for every interaction state.

- **Left:** 15 modes in four groups — Navigation (Select, Move, Measure), Editing (Add Part, Face Snap, Cut, Drilling), Joinery (Dado, Half-lap, Mortise & Tenon, Finger, Tongue & Groove, Dowel), Display (Dimensions, Visibility) — each with its keyboard shortcut.
- **Center:** isometric scene plus a step-by-step instruction overlay, a live selection readout and a gizmo/state card.
- **Right:** mode-specific parameters, live state summary and an **Apply to Model** action that acknowledges the applied mode in the status bar.

Each mode defines a pill label, a title, three workflow steps, a parameter set, a selection description and a live gizmo readout. Examples: Face Snap shows source/target faces and gap; Dado shows groove depth, clearance and stops; Drilling shows diameter, pitch, count and blind/through depth.

### 3.4 Perspective 04 — Manufacturing

- **Workflow grid:** eight cards — Cutting List, Readiness Review, Shop Drawings, Production Packet, Release Comparison, Local Change Review, Verify Packet, Exports — each opens a full modal and shows a status badge.
- **Review summary:** readiness KPIs (2 to fix, 5 advisory, 38 passed, 3 unassessed) with issue rows and a full-review action; release status with verified baseline, working changes, packet integrity, last reviewed date and revision history.

### 3.5 Perspective 05 — Project & Room

- **Tabs:** Room Geometry, Installation, Services, Project Info, Clearance.
- **Left:** project tree (room, areas, base run, wall units, tall unit, services).
- **Center:** dimensioned room plan with cabinet footprints, selection highlight and service points.
- **Right:** tab-specific controls — dimensions and shape; installation assessment with tolerances; service point schedule; project metadata and stats; walkway clearances and checks.

---

## 4. Manufacturing dialogs

Twelve modal workflows are implemented with realistic content:

| Dialog | Content |
|---|---|
| Bill of Materials | Four tabs — Boards, Hardware, Material Library, Nesting — with search/filter, cost table, KPIs and CSV export; nesting shows a 2440 × 1220 sheet layout at 84% utilization |
| Production Readiness | KPI row, correction issues, advisory findings, unassessed scope limit and reviewer notes |
| 2D Shop Drawings | Twelve-sheet list, SVG drawing on paper with dimensions and cut/joint callouts, SVG/DXF export |
| Production Packet | File inventory with sizes and hashes, classification notes |
| Release Comparison | Working design vs verified REV-12, changed-parts table, reviewer checklist, notes |
| Local Change Review | Acknowledgements, packet-hash binding note, reviewer identity and notes |
| Verify Packet | Inventory/hash/drawing-ID/CSV-parity checks, integrity-vs-approval note |
| Exports | STL, STEP, Drawings, PDF, CSV, ZIP options and export flags |
| Project Structure | Room geometry, installation assessment, areas/items schedule |
| Add Cabinet | Six cabinet presets |
| Joint Editor | Dado parameters and ownership |
| Release to Production | Version status, packet contents, review notes |

---

## 5. Interaction specifications

- **Perspective switching:** click any top-bar perspective; active state uses amber gradient background, border and accent text; the hint at the right of the switcher updates.
- **Tool selection:** toolbar buttons set the active mode, update the status bar and the viewport hint pill.
- **Tree:** rows select with an amber highlight; eye icons toggle visibility without selecting; scene/project/library tabs swap tree content.
- **Viewport:** bottom tabs swap center surface between 3D, plan, section and unfold; overlays are hidden outside 3D.
- **Cabinet editor:** nav and horizontal tabs stay synchronized; switching tabs replaces controls and preview; switches and segmented controls are clickable; option cards and color swatches toggle; explode/section buttons alter the preview.
- **Viewport modes:** selecting a mode rebuilds the scene, steps, parameters, selection readout and gizmo; Apply produces a transient status confirmation.
- **Modals:** click the scrim or close button to dismiss; `Esc` closes any modal and the File menu; tab controls inside BOM and Drawings swap content in place.
- **File menu:** grouped items with shortcuts; manufacturing items open the corresponding modal.

---

## 6. Technical notes

| Property | Value |
|---|---|
| Files | `a-workbench.html`, `index.html`, `b-immersive.html`, `c-pipeline.html`, `shared.css`, `shared.js`, `preview-*.png` |
| Format | Self-contained static HTML + CSS + vanilla JS; no build step, no framework |
| Shared assets | `shared.css` design tokens/components; `shared.js` icon set, isometric cabinet SVG renderer (`cabinetScene`), view cube and compass |
| Rendering | SVG-based isometric scene; no WebGL dependency in the prototype |
| Language | English only — all visible strings, `lang="en"` |
| Responsive | Panels collapse at ≤1240 px; side panels hide at ≤980 px; manufacturing grid reflows to one column |
| Verification | Headless Chrome screenshots of all five perspectives; DOM-injected interaction tests; zero Chinese characters; all assets HTTP 200 |

### 6.1 Relationship to the product

The prototype deliberately uses product-real vocabulary taken from the codebase — File menu entries, the sixteen `CabinetEditor` tabs, joinery tool modes, readiness classifications and production-packet concepts. This keeps design review grounded in the actual application. The prototype itself does not touch React state, geometry, file I/O or manufacturing logic.

---

## 7. Quality assurance

- [x] Five perspectives render with distinct, fully populated content
- [x] Sixteen cabinet tabs have real controls and previews
- [x] Fifteen viewport modes have steps, parameters and live state
- [x] Twelve modals have realistic content and working in-place tabs
- [x] Perspective deep links work
- [x] All interactions pass without runtime errors
- [x] No Chinese characters in any deliverable
- [x] All nine files served successfully over HTTP

---

## 8. Recommended next steps

1. **Design sign-off** on Concept A across the five perspectives; collect feedback per perspective using this document as the reference.
2. **Map the prototype to React components** — identify which of the existing `src/ui/*` components each perspective corresponds to and define a component migration order.
3. **Start with the Workbench shell** — perspective switcher, refined toolbar, tree and inspector — because it delivers the largest visual improvement with the least data-model change.
4. **Adopt the Cabinet Editor information structure** incrementally; the sixteen tabs already mirror the real `CabinetEditor` tab list, so each tab can be ported independently.
5. **Use the Viewport Modes page as the interaction-spec source** when wiring real mode state, hints and gizmos.
6. **Reuse manufacturing dialog content** as the copy and layout spec for the existing BOM / readiness / drawing / packet components.
7. **Run an accessibility and keyboard audit** against the prototype before implementation, then carry the findings into the React components.
