# Shelves & Interiors

Select a cabinet and open **Shelves & Interiors**. Select one or several physical openings, or use **Select all editable openings**. The list shows current settings and any staged replacements. Openings with detached shelf boards are locked; this tool never takes ownership of them.

Set fixed and adjustable shelf counts, pin positions per row, one/two rows per side and front/rear setbacks. Pitch stays at the supported 32 mm. **Stage shelf settings** copies the form into the selected openings without changing the project. Copy settings from a current/staged opening, stage one standard adjustable shelf, or **Remove shelves and drilling**. Discard a single opening's draft independently. Clear selection retains staged changes; Reset and Cancel discard them.

**Preview interiors** regenerates the cabinet using the proposed settings. It checks construction and retained drawer fit, confirms requested shelf boards were generated and validates actual pin arrays against their boundary panels. A shelf without a generated insertion/placement solution or with too few pin positions blocks Apply. Drilling outside panel edges and overlapping front/rear rows also block. The current generator requires both setbacks to clear the 5 mm pin bore radius, including when using a single row. Requested pin counts are limited by the opening height; the preview shows actual bore totals.

The preview shows affected shelf board counts and dimensions, hardware quantity changes, the cabinet elevation and shelf insertion statuses. Angled insertion remains visible as a diagnostic. These model checks do not replace production or installation assessment. No dimensions, fronts, opening IDs, drawer settings, material definitions, board overrides or catalogue pins are copied or cleared.

Apply changes all staged interiors in one **Apply cabinet interiors** undo step. An unchanged proposal cannot create history. External geometry, material, drawer, placement or catalogue changes require Reset before staging/previewing again; worker mesh updates alone do not. Leaving the tab discards the draft. Save the project normally after applying.

Per-opening form limits are 32 fixed shelves, 32 adjustable shelves and 1,000 requested pin positions. At most 100 openings may be staged at once. Existing production complexity limits also apply to the cabinet before count-driven geometry work; the workspace reports the limit instead of silently reducing requested quantities. Very large or invalid existing cabinets may need correction with the original controls first.
