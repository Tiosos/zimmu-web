# Stage 4 manufacturing record checks

Add advisory stock, edge, cut-size and label identity checks derived solely from detached shared manufacturing records. Include every part, even hidden items. Preserve existing geometry, CSV and saved-file schemas.

A material must resolve to a definition. Boards require positive finite stock thickness and dimensions; valid explicit thickness overrides are respected. Optional sheet dimensions, when supplied, must be finite and positive. Solid stock does not require a sheet. Round stock requires positive finite length and diameter, not board thickness. Edge requests retain unresolved cabinet rules as well as manual overrides; effective banding remains unchanged. Requested edges require resolved edge stock with positive finite thickness. Report existing cut-size errors and non-finite dimensions.

Duplicate nonempty labels are case sensitive after trimming, scoped to nearest cabinet, otherwise immediate parent assembly, otherwise loose parts. Stable IDs remain authoritative. Empty labels are flagged. One finding can target multiple parts. All findings are retained; UI shows at most 200 and exports retain all. Explicitly leave drilling, machine compatibility, hardware suitability and physical installation unassessed. Exports remain available and findings never certify machine readiness.

Readiness UI, PDF and packet use the field-level effective material library merge. New snapshot manufacturing section and readiness/manufacturing.json are additive. Manifest hashes include the JSON and count manufacturing findings. Existing production checks remain unchanged.

Validation: pure checker boundary/ownership/override tests, source detachment and price-only invariance, PDF pagination and frozen snapshots, packet hashes/captured libraries, full unit/type/lint/build checks, then draft PR and CI/browser verification.
