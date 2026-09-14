# File System Access fallback for non-Chromium browsers

**Status:** Draft.

**Plan:** _(writing-plans fills this in)_

## Problem

Save, Open and New go through the File System Access API (`showSaveFilePicker`,
`showOpenFilePicker`, a persisted `FileSystemFileHandle`). That API exists only in Chromium
browsers. `App.tsx` computes `supported = 'showOpenFilePicker' in window` and, when it is false,
`FileMenu` disables New, Open, Save and Save As entirely and shows "Save/Load requires Chrome or
Edge". A Firefox or Safari user cannot open a `.zimmu`, cannot save one, and cannot even start a new
project — the app is read-only to them.

This adds a fallback path so those browsers can open, save and start projects, and do not lose work
to a reload.

## Non-goals

- No change to Chromium behaviour. The handle-based reopen still wins on startup, and Save / Save As
  stay two separate in-place actions there.
- No storage-backend abstraction. There are exactly two mechanisms (FSAPI and download/upload); a
  general backend interface is unearned scope.
- No cloud or server persistence. Everything stays local to the browser.
- No new file-format version. The envelope written by a fallback save is byte-identical to a
  Chromium save.

## The forced mechanism

A non-Chromium browser cannot hold a writable file handle and cannot choose a save location from
script. So the mechanism is not a design choice:

- **Open** is a hidden `<input type="file" accept=".zimmu,application/json">`. Its change event
  yields a `File`; the text goes through the existing `parseFile` unchanged.
- **Save** is a download of the serialized envelope via the existing `downloadBlob`, named
  `<projectName>.zimmu`.

What *is* designed is how these fold into the existing hook and menu, and what happens across a
reload when no handle can be stored.

## Design

### Detection

`useFile` computes `supported = typeof window !== 'undefined' && 'showOpenFilePicker' in window`
once, and branches every file operation on it. `App` keeps computing its own `supported` for the
props it already passes to `FileMenu`; the two agree because they read the same global.

### Open (fallback)

`openFile`, in fallback mode, runs the unsaved-changes guard (`guardUnsaved`), then opens a file
picker built from a transient `<input type="file">` created in code (not mounted in the tree): set
`accept`, call `.click()`, and resolve on the `change` event. Read `file.text()`, run `parseFile`,
and apply the loaded envelope through the same path the FSAPI branch uses (`onFileLoaded`, reset
dirty, set the project name). No handle is stored, and `fileName` is set to the chosen file's
`.name` so the menu shows what is open. If the user cancels (the input fires no `change`), nothing
happens — the same silent no-op the FSAPI `AbortError` path gives.

### Save (fallback)

`Save` and `Save As` collapse to one action, surfaced as a single **Download .zimmu** menu item.
It serializes `buildEnvelope()` and calls `downloadBlob(content, '<projectName>.zimmu',
'application/json')`, then clears dirty and updates the saved snapshot
(`lastSavedSceneRef` / `lastSavedProjectNameRef`), exactly as an in-place save does — once the file
is downloaded the user has it. `createdAt` is stamped on first download as it is on first save.

### New (fallback)

`newFile` already uses no FSAPI (it clears the IDB handle and reseeds). The only change is that
`FileMenu` stops disabling it in fallback.

### Session restore

A new IndexedDB `session` object store (bumps `DB_VERSION` 4 → 5, added in `onupgradeneeded`
alongside the four existing stores) holds the last serialized envelope under a fixed key.

- **Write:** `useFile` writes the current envelope to the `session` store whenever the scene or
  project name changes, debounced so a burst of edits writes once. Written in **all** browsers, so
  the cache is warm regardless of the save mechanism.
- **Restore:** on startup, the existing handle-reopen runs first. If it restores a file, nothing
  else happens (Chromium's normal path). If no handle restores — every fallback browser, and a
  Chromium user who never granted one — the cached envelope is loaded as an **unsaved** session:
  `parseFile`-validated, applied through `onFileLoaded`, marked dirty, with no `fileName`. A reload
  therefore never silently loses work on a browser that cannot warn.
- An empty or absent cache leaves the app on its normal blank New state.

The cache stores the plain envelope object (structured-clone-able), not a handle, so it works in
every browser. It is cleared by `newFile` along with the handle, so starting a new project does not
leave a stale session to restore next reload.

### FileMenu

`FileMenu` takes `supported` already. In fallback:

- New and Open are enabled.
- Save and Save As are replaced by one **Download .zimmu** item (enabled whenever there is a scene).
- The "Save/Load requires Chrome or Edge" notice is dropped; a short "Downloads a .zimmu file" hint
  may replace it, or nothing.

In Chromium the menu is exactly as today.

## Components and boundaries

- `src/scene/idb.ts` — add the `session` store and `readSession` / `writeSession` / `clearSession`
  functions, mirroring the `handles` store's shape. `DB_VERSION` → 5.
- `src/scene/useFile.ts` — internal `supported`, fallback branches in `openFile` / `saveFile` /
  `saveAsFile`, the debounced session write, and the cache-restore arm in the startup effect. The
  hook's public shape is unchanged except that `saveFile` in fallback is the download action; a new
  boolean the menu can read (e.g. `canDownload` or reusing `supported`) tells `FileMenu` which items
  to show.
- `src/ui/FileMenu.tsx` — the fallback menu layout.
- `src/ui/download.ts` — reused as-is.

## Testing

- `parseFile` is already covered and unchanged.
- **idb `session` store:** `readSession` / `writeSession` / `clearSession` round-trip under
  `fake-indexeddb`, including the `onupgradeneeded` path from a fresh DB. Mutation-test that a bumped
  version without the store creation fails.
- **Fallback open:** given a `File`-like text, the open path runs `parseFile` and applies the
  envelope; a cancelled pick is a no-op.
- **Fallback save:** `downloadBlob` is called with `<projectName>.zimmu` and the serialized envelope;
  dirty clears afterward.
- **Session restore:** with no handle and a cached envelope, startup loads it as dirty with no
  `fileName`; with a handle, the cache is not consulted; `newFile` clears the cache.
- Chromium behaviour is pinned unchanged where existing `useFile` tests already assert it.
- Each guard is mutation-tested: break it, watch the right test fail, restore.

## Risks

- **`useFile` is React-hook heavy and effect-driven.** The debounced session write and the
  cache-restore arm live in effects; a test that cannot observe an effect proves nothing. Tests
  drive the hook the way existing `useFile` tests do and assert observable state, not internals.
- **Two startup paths must not both fire.** The cache restore must be gated on the handle reopen
  having produced nothing, or a Chromium user would see their file and then have it replaced by a
  stale cache. The gate is explicit and tested.
- **DB version bump.** Bumping `DB_VERSION` runs `onupgradeneeded` for every existing user; the new
  store must be created without touching the four existing ones. Covered by the fresh-DB and
  existing-DB upgrade tests.
