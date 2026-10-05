# Production packet machining schedule

The production packet includes `machining/schedule.json` and `lists/machining.csv`. Both are derived from the same captured manufacturing records as the board/dowel lists, and both are included in the manifest's file hashes. `manifest.machining` records entry/category counts, units and assessment limits. The files are advisory source schedules, not machining programs or an approved production revision.

JSON schema version 1 contains `entries`, one per cut definition or manual instruction. Hole arrays remain one row with their original count and pitch. Parts without operations have no entries but remain included in `counts.parts`. Hidden parts are included. Source order is preserved, but it does not prescribe machining order.

Each entry retains the part ID, label, kind, material, nominal local dimensions and manufacturing provenance: parent/cabinet IDs, cabinet label, generation role, driven status, explicit overrides and exact catalogue pin where present. `operation` is a detached copy of the source definition, including its ID and label. Identify an operation by **part ID plus operation ID**; IDs or labels from different parts are not merged. `sourceComponentId` and `sourceJointId` retain explicit ownership independently of the part's assembly parent. An absent owner stays `null`; the schedule does not infer authority or approval from it.

Categories:

- `geometric-drilling`: board hole arrays and axial/transverse round-stock bores. `depthMode` is `blind`, `through` or `unassessed`. Finite depths at or beyond the nominal stock extent are through-holes. Invalid drilling definitions remain present, with unassessed depth mode; match their part/operation IDs to `readiness/manufacturing.json` for findings.
- `geometric-cut`: box cuts, mitres, dowel end trims and notches. These retain their full source definitions; no drilling depth mode or machine-readiness claim is attached.
- `manual-instruction`: manual machining definitions, including jig/template, hardware key, face, reference point, angle and written instruction. These remain separate from solid geometry and never acquire an inferred bore depth or through-hole status.

Lengths, diameters, depths, pitches and coordinates are millimetres; angles/azimuths are degrees. Board local X/Y/Z correspond to length/width/thickness, independent of BOM grain orientation. Round-stock local Z runs along length from the base-circle centre. Positions and rotations in the project do not transform these references. Numeric `NaN`, `Infinity` and `-Infinity` values are written as explicit strings in schedule JSON and CSV definitions, retaining invalid data without silently converting it to `null` or a valid dimension.

CSV exposes part/owner IDs, category, operation identity, drilling sizes, count/pitch, depth mode and manual template/instruction columns. Its final definition column preserves all remaining source fields as JSON. Commas, quotes and multiline instructions are escaped as CSV fields. Geometric cuts and manual instructions show unassessed in the CSV depth-mode column; structured JSON omits that property for those categories.

The schedule does not assess cut interactions, manual machining geometry, tooling, machine compatibility or schedule/drawing reconciliation. Existing drawing/cutlist reconciliation retains its existing scope. Example regressions check schedule agreement with drawing annotations, but are not a runtime reconciliation engine.
