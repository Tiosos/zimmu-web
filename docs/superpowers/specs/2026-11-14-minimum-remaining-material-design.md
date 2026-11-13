# Minimum Remaining Material Design Specification (Stage 2)

**Document type:** Design Specification  
**Status:** Approved design  
**Date:** 2026-11-14  
**Context:** Stage 2 of the cut interference roadmap outlined in `docs/superpowers/specs/2026-11-11-cut-interference-design.md`, building on the box-cut interference and follow-up cluster work.

---

## 1. Problem and Purpose

In cabinetry and woodworking manufacture, two cuts that do not physically touch or overlap can still compromise the part if they pass too close to each other. When the solid wood between two toolpaths (the "web") is excessively thin:
1. High-speed CNC router bits and drill spindles cause tear-out, blowout, or vibration chatter.
2. The thin wall can collapse during handling, edge-banding, or transport.
3. Fasteners (such as screws, dowels, or cam pins) breaking into an adjacent groove or pocket lose grip and crack the core.

Stage 1 (`cut-intersection-review`, `cut-redundant-review`) and its follow-ups (`cut-geometry-review`, cluster de-duplication) answered:
- Do two box cuts claim the same material?
- Does one cut remove nothing?
- Can a cut describe a finite volume?

Stage 2 answers the remaining material question:
- **Do two non-intersecting cuts on a board leave a web of solid material thinner than `MIN_REMAINING_WEB_MM`?**

---

## 2. Scope and Situations

| # | Situation | Action / Verdict | Code |
|---|---|---|---|
| 1 | Two box cuts leave a web $< \text{MIN\_REMAINING\_WEB\_MM}$ | Advisory review | `cut-web-review` |
| 2 | A box cut and a drilling row leave a web $< \text{MIN\_REMAINING\_WEB\_MM}$ | Advisory review | `cut-web-review` |
| 3 | Two distinct drilling rows leave a web $< \text{MIN\_REMAINING\_WEB\_MM}$ | Advisory review | `cut-web-review` |
| 4 | A pair shares material or touches within tolerance ($\le 1\text{e-}6$ mm) | Yield to overlap passes | — (Handled by `cutIntersections` / `drillingIntersections`) |
| 5 | A cut has non-finite geometry or is sub-minimum ($\le 0.1$ mm) | Excluded from web pass | — (Ignored / handled by geometry review) |
| 6 | A pair is separated by bevelled-edge geometry (mitres/angles) | Unassessed | — |
| 7 | Cuts on round stock (dowels / turned parts) | Unassessed | — (`'Minimum remaining material on round stock'`) |
| 8 | Holes within the *same* hole array (`HoleArrayCut`) | Hardware pitch standard | — (Single cut definition, not an inter-cut pair) |

### Why Advisory, Not Blocking
In ordinary parametric cabinetry, legitimate joinery features can come close to one another without failure (e.g. a 35 mm hinge cup hole sitting close to a shallow door groove, or a drawer runner pilot hole close to a carcase bottom rebate). Because the design model cannot know the exact grain density, fastener length, or screw gauge, `cut-web-review` is advisory: it highlights thin walls in readiness reports, PDF exports, and packets so the reviewer can inspect them, without refusing fabrication exports.

---

## 3. Threshold and Constants

Defined in `src/geom/cutLimits.ts`:

```ts
// Cuts that leave less solid material between their walls than this threshold are reviewed as thin webs.
export const MIN_REMAINING_WEB_MM = 3.0
```

Boundary tolerance matches `cutIntersections.ts` and `drillingIntersections.ts`:
- `tolerance = 1e-6` mm.
- A pair whose closest distance $d \le \text{tolerance}$ is an overlap or contact and is skipped by this module.
- A pair is reported as a thin web if and only if:
  $$\text{tolerance} < \text{distance} < \text{MIN\_REMAINING\_WEB\_MM}$$

---

## 4. Architecture and File Structure

To keep separation of concerns clean and prevent existing files from bloating, Stage 2 introduces a dedicated module:

| File | Responsibility |
|---|---|
| `src/geom/cutLimits.ts` | Holds `MIN_REMAINING_WEB_MM = 3.0` alongside `MIN_CUT_SIZE_MM = 0.1`. |
| `src/scene/cutWebs.ts` | Proximity checks for board parts: Box × Box, Box × Drilling, and Drilling × Drilling. |
| `src/scene/cutWebs.test.ts` | Comprehensive unit tests for distance math, tolerance gates, and reporting. |
| `src/scene/manufacturingChecks.ts` | Runs `cutWebs` after `cutIntersections`, assigning positional `M<n>` refs. Narrows unassessed list. |
| `src/scene/productionReview.ts` | Classifies `cut-web-review` as advisory; updates policy statement. |
| `src/scene/types.ts` / `src/scene/manufacturingPart.ts` | Adds `'cut-web-review'` to `ManufacturingCheckCode`. |

---

## 5. Geometry and Distance Formulations

All calculations operate in part-local millimetres on `ManufacturingBoard`.

### 5.1 Box × Box Separation
Given two disjoint axis-aligned bounding boxes $A$ and $B$:
For each axis $k \in \{x, y, z\}$, the gap between interval $[A_{\min, k}, A_{\max, k}]$ and $[B_{\min, k}, B_{\max, k}]$ is:
$$g_k = \max(0, \max(A_{\min, k}, B_{\min, k}) - \min(A_{\max, k}, B_{\max, k}))$$

The 3D Euclidean separation distance between the two boxes is:
$$\text{dist}_{\text{box-box}} = \sqrt{g_x^2 + g_y^2 + g_z^2}$$

- If $\text{dist}_{\text{box-box}} \le \text{tolerance}$, the boxes touch or overlap (skipped).
- If $\text{tolerance} < \text{dist}_{\text{box-box}} < \text{MIN\_REMAINING\_WEB\_MM}$, it is a thin web with thickness $W = \text{dist}_{\text{box-box}}$.

### 5.2 Box × Drilling Separation
A box cut $B$ is an axis-aligned box. A drilling row `HoleArrayCut` is an array of $N$ cylindrical holes drilled from a board face inward.
For each hole $h \in [0, N-1]$ in the row:
- The hole has depth axis $d$ (entry face inward, length $H$, clamped to stock thickness), and cross-section plane $(u, v)$ where the hole is a disc of radius $R = D / 2$ centered at $(c_u, c_v)$.
- Along the depth axis, the interval gap between the hole's axial interval $[z_{\text{lo}}, z_{\text{hi}}]$ and the box's $[B_{\min, d}, B_{\max, d}]$ is:
  $$g_d = \max(0, \max(z_{\text{lo}}, B_{\min, d}) - \min(z_{\text{hi}}, B_{\max, d}))$$
- In the cross-section plane $(u, v)$, the distance from the center $(c_u, c_v)$ to the 2D box rectangle $[B_{\min, u}, B_{\max, u}] \times [B_{\min, v}, B_{\max, v}]$ is:
  $$d_{\text{center-rect}} = \sqrt{\max(0, \text{gap}_u)^2 + \max(0, \text{gap}_v)^2}$$
  The distance from the circle boundary to the rectangle boundary is:
  $$g_{\text{plane}} = \max(0, d_{\text{center-rect}} - R)$$
- The 3D distance between the cylinder and the box is:
  $$\text{dist}_{\text{box-hole}} = \sqrt{g_d^2 + g_{\text{plane}}^2}$$

If the hole touches or overlaps the box ($\text{dist} \le \text{tolerance}$), it is an intersection or redundant hole (handled by `drillingIntersections`).
Otherwise, if $\text{tolerance} < \text{dist} < \text{MIN\_REMAINING\_WEB\_MM}$, the hole leaves a thin web with the box. The finding attaches to the pair and reports the minimum web thickness across all holes in the row.

### 5.3 Drilling × Drilling Separation
Given two distinct hole arrays $A$ and $B$ on the same board:
- Between hole $A_i$ (finite centerline segment $S_{A, i}$, radius $R_A$) and hole $B_j$ (finite centerline segment $S_{B, j}$, radius $R_B$):
- The shortest distance between the two cylindrical surfaces is:
  $$\text{dist}_{\text{hole-hole}} = \max(0, \text{segmentDistance}(S_{A, i}, S_{B, j}) - (R_A + R_B))$$
- $\text{segmentDistance}(P_1, Q_1, P_2, Q_2)$ computes the minimum distance between two clamped 3D line segments (using the existing verified algorithm from `drillingIntersections.ts`).
- If $\text{dist} \le \text{tolerance}$, the holes intersect or touch (handled by `drillingIntersections`).
- Otherwise, if $\text{tolerance} < \text{dist} < \text{MIN\_REMAINING\_WEB\_MM}$, the pair leaves a thin web. The minimum distance across all evaluated hole pairs is reported.

---

## 6. Findings and Output Format

### 6.1 Issue Interface
```ts
export interface CutWebIssue {
  code: 'cut-web-review'
  message: string
  operation: ManufacturingOperationReference
}
```

### 6.2 Attachment and Ordering
- Pairs are evaluated in $(i, j)$ order over `part.cuts` with $i < j$.
- The finding always anchors on the **earlier cut** $i$ in `part.cuts`, carrying its `operation` reference (`id`, `label`, `kind`, `sourceComponentId`, `sourceJointId`).
- The message identifies the anchor cut first, states the measured web thickness formatted to 2 decimal places, and names the partner cut.
- Findings are stably sorted by anchor cut index so that readiness assigns positional `M<n>` references in cut order.

### 6.3 Message Templates
- **Box × Box:**
  `Cut "<labelA>" [<idA>]: leaves a web of <W> mm with cut "<labelB>" [<idB>], thinner than the 3.00 mm minimum; verify this is intended.`
- **Box × Drilling:**
  `Cut "<labelA>" [<idA>]: leaves a web of <W> mm with drilling "<labelB>" [<idB>], thinner than the 3.00 mm minimum; verify this is intended.`
- **Drilling × Box:**
  `Drilling "<labelA>" [<idA>]: leaves a web of <W> mm with cut "<labelB>" [<idB>], thinner than the 3.00 mm minimum; verify this is intended.`
- **Drilling × Drilling:**
  `Drilling "<labelA>" [<idA>]: leaves a web of <W> mm with drilling "<labelB>" [<idB>], thinner than the 3.00 mm minimum; verify this is intended.`

Example:
`Cut "Shelf dado" [dado-1]: leaves a web of 1.50 mm with drilling "System holes" [row-1], thinner than the 3.00 mm minimum; verify this is intended.`

---

## 7. Integration and Policy

### 7.1 Manufacturing Checks
In `src/scene/manufacturingChecks.ts`:
```ts
for (const issue of drillingChecks(p)) add(issue.code, issue.message, [p], issue.operation)
for (const issue of cutIntersections(p)) add(issue.code, issue.message, [p], issue.operation)
for (const issue of cutWebs(p)) add(issue.code, issue.message, [p], issue.operation)
```

### 7.2 Unassessed List Update
In `src/scene/manufacturingChecks.ts`:
- Item `'Minimum remaining material between cuts'` is replaced by:
  `'Minimum remaining material on round stock'`
The list stays at 7 items.

### 7.3 Production Review Classification
In `src/scene/productionReview.ts`:
- `'cut-web-review'` is mapped to `'advisory'`.
- The review policy sentence is updated to:
  `"…non-finite, overlapping, redundant or thin-web cuts are advisory."`

---

## 8. Testing Strategy

1. **Unit tests (`cutWebs.test.ts`):**
   - **Box × Box:**
     - Parallel dados with 4 mm separation $\rightarrow$ no finding.
     - Parallel dados with 2 mm separation $\rightarrow$ reports `cut-web-review` with `2.00 mm`.
     - Touching dados ($0$ mm separation) $\rightarrow$ silent (yields to overlap pass).
     - Diagonally separated boxes in 3D $\rightarrow$ Euclidean distance checked against 3.0 mm.
   - **Box × Drilling:**
     - Hole separated from dado by 1.5 mm $\rightarrow$ reports `cut-web-review`.
     - Hole entering dado ($d \le 0$) $\rightarrow$ silent in `cutWebs`.
     - Blind hole passing over a shallow groove with 2.5 mm web in depth $\rightarrow$ reports `cut-web-review`.
   - **Drilling × Drilling:**
     - Adjacent hole rows with 2 mm wall between hole perimeters $\rightarrow$ reports `cut-web-review`.
     - Standard 32 mm pitch holes within same row $\rightarrow$ ignored (same cut definition).
     - Perpendicular fixing dowel and shelf pin with 1.8 mm clearance $\rightarrow$ reports `cut-web-review`.
   - **Order and Attachment:**
     - Anchors on the earlier cut in `part.cuts`.
     - Format: 2 decimal places for web thickness.
2. **Fixture Safety:**
   - Representative projects `manufacturingProject()` and `machiningProject()` remain finding-free.
3. **Integration & PDF:**
   - `manufacturingChecks.test.ts`: asserts `cut-web-review` carries `M<n>`, targets board, and unassessed list contains `'Minimum remaining material on round stock'`.
   - `productionReview.test.ts`: classifies `cut-web-review` as advisory.
   - `buildReadinessPdf.test.ts`: asserts the new unassessed wording renders in the PDF.

---

## 9. Non-Goals and Out-of-Scope

- **Round stock:** Webs on dowels/round stock remain unassessed (`'Minimum remaining material on round stock'`).
- **Bevelled edges:** Mitres and angled end-cuts remain unassessed.
- **Machine tool limits:** Tool access and spindle clearances remain unassessed.
