# Personal construction presets

Capture the non-sizing settings from the Construction draft as named, described personal presets. Store an independent versioned browser library; it is not company catalogue publication or a project rule change. Dimensions, sections, placement, product/rule pins, per-board overrides and frame opening layouts are never captured. Presets stage draft settings; only the existing validated construction preview can update geometry in one undo step.

## Scope

The 25 deliverables are library, draft capture, names, descriptions, local persistence, reload, search, sorting, settings summary, rename, description edit, replacement from draft, duplicate, delete, single export, library export, validated import, collision handling, selective groups, shell/back reuse, base reuse, fronts/frame reuse, materials/joinery reuse, difference table and guarded preview integration, and storage/material/concurrency diagnostics.

Groups are shell (top/back), base (mode/toe dimensions), fronts (mount/reveal), frame (enabled/member dimensions/pair stile), materials (four panel slots), joinery (joint method). All start selected. Loading a group retains all other draft fields. Frame layouts remain destination-specific through constructionCandidate. Half-overlay without frame and destination geometry incompatibilities are blocked by constructionErrors at preview.

## Data and limits

Version 1 JSON format zimmu-construction-presets. Maximum 100 entries, 256 KiB UTF-8, names/IDs 1–80 characters, descriptions up to 500, timestamps non-negative finite. Explicit field allowlist strips geometry, identity and unknown metadata. Enum/boolean validation is strict. Positive finite frame sizes; nonnegative finite toe dimensions/reveal; canonical numeric strings. Invalid imports are atomic. Fresh IDs and case-insensitive unique suffixed names on append; never replace existing entries implicitly.

## Storage and interactions

Load errors preserve corrupt raw storage and disable writes until a successful reload. Write compares current localStorage raw with captured raw; concurrent changes refresh and require retry. Quota/unavailable storage shows failure and retains current visible data. Storage events refresh library. File import uses a generation guard on newer requests, external storage refresh, edits, unmount. Export available even after write failure. No scene dirty flag for library-only edits.

## Verification

Pure tests for strict parsing/limits/collision/selection/identity preservation. UI tests for CRUD, import/export, storage failures/conflicts and draft staging. Browser flow through real CabinetEditor verifies preview, apply, undo, reload and reuse. Mutation-test added guards with backed-up source and assertion failures. Required typecheck/lint/full unit suite, both builds and focused browser regressions before local commit.
