# Manufacturing checks notes

Base: merged PR #81, main 46d2f98. Scope excludes drilling and machine compatibility. Preserve effective banding while recording unresolved requests separately.

Implementation: shared stock adds resolution facts and requested edge definitions. The checker covers all parts and retains stable target IDs. Live UI and captured exports use the effective library merge; existing production assessment semantics stay separate. Packet manifest adds manufacturing counts and hashes the full JSON report. No file format change.

Focused regressions cover solid/round stock, hidden items, finite boundaries, intentional thickness overrides, unresolved cabinet edges, explicit bare overrides, nested and detached label scopes, pricing/placement independence, detached stock, save/reopen, full PDF pagination, and capture before async exports. Four deliberate mutations (finite predicate, edge designation, thickness override, duplicate owner scope) each fail assertions; original bytes restored.

Local validation: 157 test files passed; 2,765 tests passed and 10 skipped. Typecheck, lint, production build, catalogue build, E2E typecheck and diff whitespace check passed. Full baseline CSV/nesting/label regressions remain green.
