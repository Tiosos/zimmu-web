# Zimmu UI Redesign — Design Sign-off & Product Requirements

**Document type:** Product Requirements Document (PRD) + design sign-off record
**Version:** 2.0 — supersedes `DESIGN-A.md` as the authoritative implementation spec
**Date:** 2026-11-20
**Status:** Signed off for implementation · Concept A (Three-Column Workbench)
**Baseline prototype:** `ui-redesign/a-workbench.html`
**Merged reference:** PR #167 (`1641970`), all CI checks passed

---

## 0. Sign-off record

This document records the decisions that finalize the Concept A redesign and defines the requirements for implementing it in the React application. It is the authoritative spec for the next implementation stage; `DESIGN-A.md` remains the visual and interaction reference.

| # | Decision area | Decision | Rationale |
|---|---|---|---|
| D1 | Viewport modes | **All 15 prototype modes are signed off.** The 7 real interaction modes remain primary; the 8 tool/display entries are formally promoted to first-class modes. Implementation must extend the current state machine accordingly. | Reviewer chose full scope over narrowing to the 7 existing modes. |
| D2 | Keyboard shortcuts | **Strictly align with the real key map.** Remove prototype-only assignments (`V`, `G`, `A`, `D`) and the conflicting `M` for Measure. Only the verified keys in §6 are authoritative. | Avoid breaking established user muscle memory and existing tests. |
| D3 | Workspace coverage | **Missing workspaces are added to this document as design specs.** The prototype is not extended in this stage; these sections define future implementation. | Keeps sign-off complete without delaying the current deliverable. |
| D4 | Document role | **Full PRD** — users, scenarios, end-to-end flows, functional and non-functional requirements, acceptance criteria, and implementation constraints. | Serves as the single source of truth for delivery, not just a decision memo. |

### 0.1 Out of scope for this sign-off

- Reopening the Choice of Concept A vs B/C (closed by PR #167)
- Changing the geometry engine, file format, manufacturing rules or server/API behavior
- Building the prototype into React (that is the next stage, defined here)

---

## 1. Product definition

### 1.1 What Zimmu is

An open-core 3D joinery design application for architects, cabinet makers and furniture designers who specify built woodwork. It produces buildable, dimensioned models from a parametric joint library and carries them through to cutting lists, shop drawings, machining schedules and verified production packets — without the overhead of engineering CAD.

### 1.2 Product principles

1. **Buildable by default** — every design action must preserve manufacturing validity or surface an explicit advisory.
2. **One source of truth** — the scene model drives the viewport, BOM, drawings and production outputs; no parallel copies.
3. **Keyboard-first** — expert users should never need the mouse for frequent operations.
4. **Visible state** — mode, selection, dirty state, geometry health and release status are always on screen.
5. **Advisory honesty** — unassessed checks are labelled as such; exports are never silently blocked or silently approved.

### 1.3 Target users

| Persona | Needs | Design implication |
|---|---|---|
| Professional cabinet designer | Speed, density, full keyboard control, parametric control | Dense workbench, persistent inspector, 16-tab editor |
| Architect / interior designer | Room context, placement, visual review, client presentation | Plan view, room installation assessment, clean 3D presentation |
| Fabricator / workshop | Accurate cutting lists, drawings, machining schedule, packet integrity | Manufacturing perspective, readiness triage, verified packets |
| New user / occasional user | Guidance, discoverability, understandable next step | Step overlays in viewport modes, named workspaces, clear status |

---

## 2. Information architecture

The application is organized into five top-level perspectives, reached from one switcher in the top bar. All product work happens inside one of these perspectives; there are no separate windows for primary tasks.

| # | Perspective | Purpose | Primary user |
|---|---|---|---|
| 1 | Workbench | Model parts, joints, cuts; inspect and select | Designer |
| 2 | Cabinet Editor | Configure parametric cabinets across 16 tabs | Designer |
| 3 | Viewport Modes | Perform and learn all canvas interactions | All |
| 4 | Manufacturing | Review readiness, generate drawings, packets and releases | Fabricator |
| 5 | Project & Room | Project structure, room geometry, installation and services | Architect / designer |

**Navigation rule:** the perspective switcher is the only top-level navigation. Menu commands that open a workspace (e.g. *Door & Drawer Motion…*) switch to the relevant perspective or open a nonmodal workspace over the current one — they do not create a new top-level category.

**Deep links:** `a-workbench.html#view=cabinet`, `#view=modes`, `#view=manufacture`, `#view=project`. The React implementation must provide equivalent routable state.

---

## 3. Functional requirements — perspective 1: Workbench

### 3.1 Layout

Fixed three-column shell with a top bar, toolbar band, center canvas and status bar. Panels are persistent; nothing is hidden behind a global show/hide toggle except at the responsive breakpoints in §8.

- Top bar: brand, menu bar (File / Edit / View / Design / Manufacture / Help), project title with dirty indicator, undo/redo, Cutting List and Readiness actions.
- Toolbar: four groups — Select, Modeling, Joinery, View.
- Left: Scene Tree / Project / Library tabs, search, hierarchical tree with per-row visibility toggle.
- Center: 3D viewport with view cube, compass, scale bar, zoom controls, floating mode toolbar and contextual hint; bottom tab strip for 3D Model / Plan Layout / Section / Part Unfold.
- Right: inspector with Properties / Joints / Cut / Material / Hardware tabs.
- Status bar: geometry engine state, part and joint counts, active mode, world coordinates, scale, autosave state.

### 3.2 Part and scene operations (FR-WB-01…08)

| ID | Requirement |
|---|---|
| FR-WB-01 | Add a board part with label, length × width × thickness, material, color, position and rotation. |
| FR-WB-02 | Select a part by click; multi-select with Shift; hide with `H`; duplicate with `Ctrl/Cmd+D`; delete with `Delete`/`Backspace`. |
| FR-WB-03 | Undo/redo 50 steps; consecutive dimension edits coalesce into one entry. |
| FR-WB-04 | Scene tree supports expand/collapse, keyboard navigation, visibility toggles and selection sync with the viewport. |
| FR-WB-05 | Inspector edits dimensions, transform, joint links, cuts, material assignment and hardware links; changes propagate to all outputs. |
| FR-WB-06 | Viewport renders selection highlight, face hover, dimension callouts and hidden-part filtering. |
| FR-WB-07 | Center tab strip switches between isometric 3D, plan, section and part-unfold surfaces without unmounting the renderer. |
| FR-WB-08 | File operations: New / Open / Save / Save As with dirty tracking and last-file auto-reopen where supported. |

---

## 4. Functional requirements — perspective 2: Cabinet Editor

### 4.1 Structure

Header with cabinet identity and commit action; grouped left navigation; 16-tab horizontal strip; left control column and right live preview; footer with geometry sync status. The sixteen tabs and their order are **fixed** and match the real `CabinetEditor` tab list exactly.

### 4.2 The sixteen tabs (FR-CE-01…16)

| ID | Tab | Requirement |
|---|---|---|
| FR-CE-01 | Section | Set section type, panel mode, side/back thickness; scribe and notch options; list section panels. |
| FR-CE-02 | Construction | Choose carcase type and joinery preset; assembly flags; dowel diameter and pitch; dovetail/dado preferences. |
| FR-CE-03 | Placement | Choose anchor (floor/wall/freestanding); set position, rotation and clearance; auto-level and wall scribe; inspect neighbours. |
| FR-CE-04 | Layout | Set bay width/depth/height, columns and rows; symmetry and opening sequence. |
| FR-CE-05 | Finishing | Choose finish, sheen, coat count and grain; manage color swatches, grain matching and UV protection. |
| FR-CE-06 | Fronts & Drawers | Choose front style, thickness and reveal; drawer box type; soft-close and front list. |
| FR-CE-07 | Shelves & Interiors | Configure shelf count/thickness/depth, adjustability, inserts, dividers, lighting and system holes. |
| FR-CE-08 | Materials | Assign material per part; view stock sheet size and utilization; link to the material library. |
| FR-CE-09 | Edgebanding | Set band material, corner treatment and per-edge selection; band-before-machining option. |
| FR-CE-10 | Appliance Bays | Manage appliance list with status; set service clearances; add appliance. |
| FR-CE-11 | Service Openings | Manage electrical/water/drain/gas openings, offsets and back-panel cut. |
| FR-CE-12 | Hardware | Maintain hardware schedule with quantities and status; link to BOM. |
| FR-CE-13 | Front | Front elevation: dimensions, reveal, handle/grain display and drawing options. |
| FR-CE-14 | Top | Top type, thickness, overhang, material and mitred edge. |
| FR-CE-15 | End | End panel type, thickness, scribe, decorative option and neighbour info. |
| FR-CE-16 | 3D | Shaded / wireframe / x-ray / exploded display; dimensions, joints and hardware toggles; projection. |

### 4.3 Preview and sync (FR-CE-17…19)

- FR-CE-17 — every tab change updates the preview from the same scene data; no stale geometry.
- FR-CE-18 — exploded view and section cut are reversible preview modes, never written to the file.
- FR-CE-19 — the footer reports geometry sync status and rebuild time.

---

## 5. Functional requirements — perspective 3: Viewport Modes

### 5.1 Signed-off mode set (D1)

All 15 modes are in scope. They are split into two implementation classes:

**Class A — interaction state machine (7, already real):**

| Mode | Trigger | Workflow | State |
|---|---|---|---|
| Face Snap | `F` | Click source face, then target face; parts align | source face, target face, alignment |
| Cut | `C` | Click face, set rectangle, confirm | face, cut box, linked mate |
| Dado | `J` | Click housing face, then housed end | housing, housed part, profile/stops |
| Half-lap | `L` | Click two overlapping boards | board pair, split plane, clearance |
| Mortise & Tenon | `M` | Click mortise face, then tenon end | mortise board, tenon board, sizes |
| Finger Joint | `B` | Click two equal-width ends | end pair, finger count, clearance |
| Tongue & Groove | `T` | Click two facing long edges | edge pair, tongue size, clearance |

**Class B — tool / display modes (8, new first-class modes):**

| Mode | Requirement |
|---|---|
| Select | Pick parts and faces; multi-select; drives inspector selection. |
| Move | Translate the selected carcase with a drag gizmo; snap to grid; commit to undo history. |
| Measure | Measure between faces or points; display distance overlay. |
| Add Part | Place a new board from material and thickness; set dimensions on placement. |
| Drilling | Place a drilling row: diameter, pitch, count, blind/through, depth. |
| Dowel | Place dowels at system pitch across two mating faces. |
| Dimensions | Toggle overall dimensions, cut labels, joint callouts and manual notes. |
| Visibility | Toggle hidden-part ghosting, hardware visibility and isolate-selection. |

**Implementation note:** Class B modes 1–5 require new state-machine work; modes 6–8 may be implemented as display/tool state but must appear in the same UI with the same step/parameter structure so the perspective stays coherent.

### 5.2 Mode UI requirements (FR-VM-01…05)

- FR-VM-01 — selecting a mode rebuilds the scene, instruction steps, parameters, selection readout and gizmo readout.
- FR-VM-02 — each mode shows three workflow steps with a current-step indicator.
- FR-VM-03 — each mode exposes its parameters in the right panel and a live state summary.
- FR-VM-04 — **Apply to Model** commits supported modes and produces visible status feedback.
- FR-VM-05 — mode descriptions must match actual behavior; any advisory limits are stated in the mode panel.

---

## 6. Keyboard map (authoritative — decision D2)

Only the following keys are valid. Prototype-only keys `V`, `G`, `A`, `D` and the conflicting `M`-for-Measure are **withdrawn**.

### 6.1 Non-modifier keys

| Key | Action |
|---|---|
| `F` | Face snap / align mode |
| `C` | Cut mode |
| `J` | Dado joint mode |
| `L` | Half-lap joint mode |
| `M` | Mortise & tenon joint mode |
| `B` | Box / finger joint mode |
| `T` | Tongue & groove joint mode |
| `Escape` | Cancel active snap / cut / joint mode; close dialogs |
| `Home` | Frame all visible parts (in tree: focus first row) |
| `H` | Toggle visibility of selected part (suppressed in interaction modes) |
| `Delete` / `Backspace` | Remove selected part (suppressed in interaction modes) |

### 6.2 Modifier keys

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z`, `Ctrl+Y` | Redo |
| `Ctrl/Cmd+S` | Save |
| `Ctrl/Cmd+Shift+S` | Save As |
| `Ctrl/Cmd+O` | Open |
| `Ctrl/Cmd+N` | New |
| `Ctrl/Cmd+D` | Duplicate selected part |
| `Ctrl/Cmd+Shift+E` | Open cutting list |

### 6.3 Scene tree and dialogs

- Tree: one tab stop; arrow keys move focus, `Home`/`End` first/last row, `ArrowRight`/`ArrowLeft` expand/collapse, `Enter`/`Space` select. Focus movement alone never selects.
- Dialogs: focus moves inside on open, `Tab` cycling is trapped to the newest dialog, focus returns to the opener on close, `Escape` closes.
- Source review: `Alt+Arrow` navigates pending findings; `Alt+Shift+Arrow` navigates findings with notes.

### 6.4 Unassigned new modes

Class B modes without a verified key are activated from the toolbar or the Viewport Modes perspective only. If keys are assigned later, they must be added to this table through a new sign-off.

---

## 7. Functional requirements — perspective 4: Manufacturing

### 7.1 Workflows (FR-MF-01…08)

| ID | Workflow | Requirement |
|---|---|---|
| FR-MF-01 | Cutting List | Three-tab BOM (Boards / Hardware / Library) plus nesting view; cost popover, CSV copy/download; persistent material rates. |
| FR-MF-02 | Readiness | Classify findings as corrections, advisories and unassessed; retain source references; downloadable report. |
| FR-MF-03 | Shop Drawings | Face / edge / end orthographic projections with dimensions and cut labels; SVG preview and SVG/DXF download. |
| FR-MF-04 | Production Packet | Millimetre-accurate machining schedule, drawing indexes, cutting list, hardware list and hashed manifest. |
| FR-MF-05 | Release Comparison | Compare a verified recorded release with the working design; select affected parts; reviewer notes and check-offs; HTML/JSON report. |
| FR-MF-06 | Local Change Review | Acknowledge changes and comparison limits; bind review to both packet hashes; save/resume review. |
| FR-MF-07 | Packet Verification | Check ZIP inventory, hashes, summaries, machining CSV/JSON and drawing page IDs; downloadable findings. |
| FR-MF-08 | Exports | STL, STEP, drawings, PDF, CSV and ZIP outputs; visible-parts and manifest options. |

### 7.2 Manufacturing invariants (FR-MF-09…12)

- FR-MF-09 — unresolved stock, invalid dimensions, duplicate labels and drilling boundary findings are advisory unless the product explicitly escalates them.
- FR-MF-10 — thin-web findings between cuts (box/box, box/drilling, drilling/drilling) are advisory and retain part/cut/component provenance.
- FR-MF-11 — drilling records keep blind vs through depth; invalid drilling remains unassessed.
- FR-MF-12 — exports remain available regardless of readiness status; verification is separate from approval.

---

## 8. Functional requirements — perspective 5: Project & Room

| ID | Requirement |
|---|---|
| FR-PR-01 | Manage project structure: rooms, areas, cabinets, items and service points. |
| FR-PR-02 | Edit room geometry: width, depth, height, wall thickness and plan shape; square-to-walls option. |
| FR-PR-03 | Assess installation: wall fit, corner access, clearance and outlet positions; report pass/advisory. |
| FR-PR-04 | Maintain service points: electrical, water, drain and gas with sizes and offsets. |
| FR-PR-05 | Show project metadata and statistics: cabinets, parts, joints, revisions. |
| FR-PR-06 | Check walkways and door/drawer clearances against configurable tolerances. |

---

## 9. Additional workspaces — design specs (decision D3)

These are real product workspaces not yet present in the prototype. Their behavior is documented here as the implementation spec; the prototype is intentionally not extended in this stage.

### 9.1 Door & Drawer Motion

- **Entry:** File → Door & Drawer Motion…; nonmodal workspace, viewport stays visible.
- **Selection:** filter by room/cabinet; select generated doors or drawers; unsupported/detached fronts are diagnosed.
- **Settings:** common maximum angle/travel and hinge-axis offset; individual sliders; paired leaves are independent; drawer fronts and all five box panels move together.
- **Preview:** open/close buttons, animation with pause/resume, selected-progress slider; plan shows full opening path; elevation shows current angle/travel.
- **Path check:** checks selected fronts from closed to configured maxima including intermediate intervals (≤2° per door step, ≤10 mm per drawer step); configurable clearance and conservative handle envelope; considers scene boards, linked fillers/finishing/worktops, other moving assemblies and room walls/obstacles; at most 50 fronts per check, 200 findings reported as incomplete.
- **Commit:** Apply motion settings saves validated values in one undo step; open fractions are never saved or exported; format 39; `Escape` or closing removes temporary transforms; any scene edit invalidates the draft.
- **Limits:** generic rotation about a side pivot and straight drawer travel only; detached fronts, tilted cabinets, supplier-specific multi-link hinges and physical handle models are unsupported.

### 9.2 Front Grain Matching

- Entry: File → Front Grain Matching…; room and cabinet filters; individual or multi-front selection across cabinets.
- Lists dimensions, material and grain; diagnoses detached/unsupported fronts.
- Named groups: create, load, edit, add/remove members with exclusive membership; compatible materials and thicknesses only.
- Validation: parallel/same-facing fronts on the same front plane; arrangement derived from geometry — stacked drawer sequences, side-by-side door sequences and mixed.
- Pattern: group grain direction, reference front, pattern origin, horizontal/vertical offsets; schematic continuity preview with boundaries, reveals, dimensions and identities.
- Commit: preview before apply; one-step apply.

### 9.3 Stock Optimisation

- Entry: File → Stock Optimisation…; cabinet selection and room filtering; required panels by material.
- Stock: multiple sheet sizes per material, option names, dimensions, thickness validation, grain direction, available quantities, unlimited purchased stock, prices per sheet, enable/disable, edge trimming and usable-boundary previews.
- Offcuts: reusable library with stable IDs, dimensions, material/thickness, grain direction, quantities, storage locations, edit/remove, compatibility checks and priority control.
- Nesting: mixed-size nesting, quantity-aware allocation, panel grain preservation, atomic matched-front groups, tool clearance and trim; cannot-fit diagnostics.

### 9.4 Sloped-Top Cabinets

- Entry: File → Sloped-Top Cabinets…; select an existing compatible cabinet; enable/disable profile.
- Parameters: width slopes, depth slopes, first/opposite end heights, calculated slope angle, angle-driven heights, fixed reference end; preserve body footprint; minimum clear height and angle limits; conflicting settings diagnostics.
- Preview: envelope preview, dimensioned elevation, plan slope direction, generated-panel 3D preview.
- Generation: inclined top, true top stock length, top material/thickness, cap overhangs, side profiles and heights, side-to-top bevels, back profile, applied/recessed/captured-back compatibility, bottom construction, base/plinth compatibility and horizontal shelves.

### 9.5 Catalogue and layout library

- **Company catalogue:** import company catalogue JSON; separate authenticated authoring/publishing editor via Keycloak; two API roles (`Catalogue.RuleAdministrator`, `Catalogue.ProductDesigner`); central identity bindings; publishing does not adopt definitions into CAD or approve production.
- **Personal layout library:** in a cabinet's Section tab; save selected opening or whole cabinet as an independent snapshot; rename/duplicate/delete with confirmation; search and sort; preview using destination dimensions; apply replaces target subtree in one undo step; JSON export/import (512 KiB file limit, 100 entries, 256 nodes, 16 nested divisions); browser-local storage with conflict detection and explicit reload of unreadable data.

---

## 10. Visual design system

See `DESIGN-A.md` §2 for the full token table. Summary:

- **Color:** cool graphite surfaces (`--bg-0` … `--bg-4`), amber accent (`hsl(28 88% 57%)`), cyan precision highlight, semantic green/amber/red status.
- **Typography:** Inter for UI; JetBrains Mono with tabular figures for dimensions, IDs, hashes and coordinates; uppercase tracked micro-labels.
- **Components:** buttons (ghost/outline/solid/accent/icon), segmented controls, compound dimension inputs, switches, option cards, badges, status dots, sticky-header tables, tree rows, modals, tooltips, progress bars, KPI cards.
- **Concept identity:** Concept A uses the amber accent; the shared system also defines cyan (B) and violet (C) for the preserved alternatives.

---

## 11. Non-functional requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | Performance | Geometry rebuild only when `shapeKey(part)` changes; position/rotation changes must not rebuild OCCT geometry. |
| NFR-02 | Responsiveness | ≥1240 px: full three columns; 980–1240 px: collapsed side widths; ≤980 px: side panels hidden, single-column content. |
| NFR-03 | Accessibility | Dialogs trap focus and restore it; tree is a single tab stop with documented arrow navigation; visible focus indicators; sufficient contrast in both light and dark capable themes. |
| NFR-04 | Compatibility | File I/O degradation message and disabled menus where File System Access API is unavailable; saved-file format versioning preserved. |
| NFR-05 | Internationalization | UI strings are English in this release; text must not be hard-coded into SVG geometry where labels can be localized later. |
| NFR-06 | Testability | Every FR in this document must be verifiable by unit, integration or e2e test; mode state changes must be observable in state for testing. |
| NFR-07 | Safety | No export or manufacturing output may claim approval that the readiness system has not verified; advisory findings stay visible. |

---

## 12. Acceptance criteria

1. All five perspectives are reachable in the React app and match the prototype structure.
2. All 16 cabinet tabs exist, are ordered as specified, and edit the same scene data.
3. All 15 viewport modes are present; the 7 Class A modes use the verified key map; the 8 Class B modes are reachable from toolbar/perspective.
4. No keyboard shortcut outside §6 is active; specifically `M` opens mortise & tenon, never Measure.
5. Manufacturing workflows produce the same classifications and provenance as the current product; no regression in readiness or packet checks.
6. The four additional workspaces in §9 are scheduled with their own delivery PRs and are not silently omitted.
7. Accessibility behaviors in NFR-03 pass manual and automated checks.
8. Full test suite and typecheck pass with no reduction in coverage.

---

## 13. Implementation sequence

| Stage | Scope | Exit criterion |
|---|---|---|
| S0 | Sign-off (this document) | Approved |
| S1 | Workbench shell — perspective switcher, toolbar, tree, inspector, status bar | Visual parity with prototype perspective 1; NFR-02/03 met |
| S2 | Cabinet Editor 16 tabs | All FR-CE requirements pass; tab order matches |
| S3 | Viewport modes | 7 Class A modes wired to real state; 8 Class B modes reachable; key map per §6 |
| S4 | Manufacturing perspective | FR-MF-01…12 pass; no regression in readiness/packet tests |
| S5 | Project & Room perspective | FR-PR-01…06 pass |
| S6 | Additional workspaces §9 | One PR each, in priority order set by product |
| S7 | Accessibility and keyboard audit | NFR-03 satisfied; findings resolved |

Each stage is a separate PR with screenshots and test evidence attached.

---

## 14. Open items

| ID | Item | Owner | Status |
|---|---|---|---|
| O1 | Assign keys to Class B modes if desired | Product | Deferred — requires new sign-off |
| O2 | Priority order for §9 workspaces | Product | To confirm |
| O3 | Light theme delivery timing | Design / Product | To confirm |
| O4 | Localization timeline | Product | Deferred — English only this release |

---

## 15. Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Product / reviewer | Tiosos | Concept A approved; decisions D1–D4 recorded | 2026-11-20 |
| Design | WorkBuddy AI (UiDesigner) | Spec prepared from PR #167 baseline | 2026-11-20 |

**Next action:** begin Stage S1 (Workbench shell) against this document.
