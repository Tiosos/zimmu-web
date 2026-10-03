# Manufacturing checks notes

Base: merged PR #81, main 46d2f98. Scope excludes drilling and machine compatibility. Preserve effective banding while recording unresolved requests separately.

Implementation: shared stock adds resolution facts and requested edge definitions. The checker covers all parts and retains stable target IDs. Live UI and captured exports use the effective library merge; existing production assessment semantics stay separate. Packet manifest adds manufacturing counts and hashes the full JSON report. No file format change.

Focused regressions cover solid/round stock, hidden items, finite boundaries, intentional thickness overrides, unresolved cabinet edges, explicit bare overrides, nested and detached label scopes, pricing/placement independence, detached stock, save/reopen, full PDF pagination, and capture before async exports. Four deliberate mutations (finite predicate, edge designation, thickness override, duplicate owner scope) each fail assertions; original bytes restored.

Local validation: 157 test files passed; 2,765 tests passed and 10 skipped. Typecheck, lint, production build, catalogue build, E2E typecheck and diff whitespace check passed. Full baseline CSV/nesting/label regressions remain green.

Max-level PR review: four fail-first regressions reproduced false resolution of inherited toString/constructor/__proto__ names and loss of an explicit __proto__ material during effective-library merging. Shared record stock now resolves only own definitions; effectiveMaterialsOf uses own-property entries and preserves explicit special names without changing prototypes. Added explicit-name stock/edge snapshot coverage and an integration regression proving the dialog's 200-finding limit leaves all 205 findings in the exported effective-library snapshot. Corrected duplicate-label wording for loose parts.

Reviewed final source: 157 files passed; 2,771 tests passed, 10 existing skips. Typecheck, lint, production and catalogue builds, and diff whitespace checks passed before publishing the fixes. No further blocking findings in material/edge precedence, nested label ownership, hidden items, detached records, snapshot capture, PDF completeness or packet hashes.
