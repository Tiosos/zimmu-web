# Cutting List Color Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Color column (swatch + hex) to the cutting list table and CSV export, with color folded into the grouping key so parts differing only in color appear as separate rows.

**Architecture:** Two coordinated changes inside `src/ui/`: (1) `buildCsv.ts` — add color to the grouping key, add `color` to `GroupedRow`, add a `Color` CSV column; (2) `CuttingList.tsx` — add a `Color` table column with a swatch + hex cell and bump the empty-state `colSpan`. No `types.ts`, `useScene`, or file-format change — `color` already exists on `BoardPart`.

**Tech Stack:** TypeScript strict mode, Vitest + @testing-library/react, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-06-04-cutting-list-color-design.md`

---

## File map

| File | Change |
|------|--------|
| `src/ui/buildCsv.ts` | **Modify** — grouping key (line 20), `GroupedRow` (line 3), `map.set` (line 28), CSV header (line 52) + row (line 54) |
| `src/ui/CuttingList.tsx` | **Modify** — add `Color` `<th>` (after line 66), `<td>` (after line 85), bump `colSpan` 7→8 (line 76) |
| `src/ui/CuttingList.test.tsx` | **Modify** — update 5 breaking assertions, add 4 new tests, add `Color` header check |

Both source files are consumed only by each other and the one test file (verified by grep). No other consumers exist.

---

## Task 1: Color in grouping + CSV (`buildCsv.ts`)

**Files:**
- Modify: `src/ui/buildCsv.ts` (lines 3, 20, 28, 52, 54)
- Test: `src/ui/CuttingList.test.tsx`

This task is TDD. Write/update the data-layer tests first (they fail), then make
the minimal code changes to pass. The table (DOM) changes are Task 2.

### Step 1: Update the breaking data-layer assertions and add the new data-layer tests

- [ ] **Open `src/ui/CuttingList.test.tsx`. Make these 3 edits inside the
  `describe('buildCsv', …)` block.**

Edit 1 — the empty-header test (currently line 28). Replace:

```ts
    expect(buildCsv([])).toBe('Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts')
```

with:

```ts
    expect(buildCsv([])).toBe(
      'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts',
    )
```

Edit 2 — `formats a data row with correct field values` (currently line 41).
Replace:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,600,300,18,0')
```

with:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,#8b6914,600,300,18,0')
```

Edit 3 — `includes the cut count` (currently line 62). Replace:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,600,300,18,2')
```

with:

```ts
    expect(csv.split('\n')[1]).toBe('1,Left Side,,#8b6914,600,300,18,2')
```

- [ ] **Make a fourth edit inside the `describe('CuttingList', …)` block, in the
  `Copy CSV button writes CSV content to clipboard` test (currently lines
  287–291). This asserts `buildCsv` string output, so it must change in lockstep
  with the CSV change in this task — otherwise the suite goes red the moment this
  task's implementation lands. Replace:**

```ts
    expect(csvArg.split('\n')[0]).toBe(
      'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts',
    )
    expect(csvArg).toContain('1,Left Side,,600,300,18,0')
```

**with:**

```ts
    expect(csvArg.split('\n')[0]).toBe(
      'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts',
    )
    expect(csvArg).toContain('1,Left Side,,#8b6914,600,300,18,0')
```

- [ ] **Add one new test at the end of the `describe('buildCsv', …)` block, right
  before its closing `})` (currently line 86):**

```ts
  it('puts different colors on separate rows', () => {
    const csv = buildCsv([
      makePart({ id: 'p1', color: '#8b6914' }),
      makePart({ id: 'p2', color: '#ff0000' }),
    ])
    expect(csv.split('\n')).toHaveLength(3)
  })
```

- [ ] **Add two new tests at the end of the `describe('groupParts', …)` block,
  right before its closing `})` (currently line 163):**

```ts
  it('carries color onto the grouped row', () => {
    expect(groupParts([makePart()])[0].color).toBe('#8b6914')
  })

  it('splits parts that differ only by color into separate rows', () => {
    const rows = groupParts([
      makePart({ id: 'p1', color: '#8b6914' }),
      makePart({ id: 'p2', color: '#ff0000' }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].color).toBe('#8b6914')
    expect(rows[1].color).toBe('#ff0000')
  })
```

### Step 2: Run the test file to confirm the data-layer tests fail

- [ ] **Run the whole file (not a filtered subset — the Copy CSV assertion lives
  in the `CuttingList` describe and must be checked here too):**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected — these fail (CSV/grouping not yet color-aware):
- `buildCsv > returns only the header…` (header lacks `Color`)
- `buildCsv > formats a data row…` and `> includes the cut count` (row lacks hex)
- `buildCsv > puts different colors on separate rows` (1 row, not 2 → 2 lines, not 3)
- `groupParts > carries color onto the grouped row` (`row.color` is `undefined`)
- `groupParts > splits parts that differ only by color…` (groups into 1 row)
- `CuttingList > Copy CSV button…` (header + row lack the color column)

All other tests pass — the DOM `Color` column does not exist yet, but no test
asserts it until Task 2.

### Step 3: Add `color` to the `GroupedRow` interface

- [ ] **In `src/ui/buildCsv.ts`, add a `color` field to `GroupedRow` (currently
  lines 3–13), placed after `material`:**

```ts
export interface GroupedRow {
  key: string
  qty: number
  labels: string
  material: string
  color: string
  length: number
  width: number
  thickness: number
  cuts: number
}
```

### Step 4: Add color to the grouping key

- [ ] **In `groupParts()`, change the key (currently line 20) from:**

```ts
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}`
```

**to:**

```ts
    const key = `${p.length}×${p.width}×${p.thickness}|${p.material}|${p.color}`
```

### Step 5: Populate `color` in the new-group branch

- [ ] **In the `map.set(key, { … })` call (currently starting line 28), add
  `color: p.color` after `material: p.material`:**

```ts
      map.set(key, {
        key,
        qty: 1,
        labels: p.label,
        material: p.material,
        color: p.color,
        length: p.length,
        width: p.width,
        thickness: p.thickness,
        cuts: p.cuts.length,
      })
```

The accumulation branch (existing group found) is unchanged — every row has a
single color by construction.

### Step 6: Add the Color column to the CSV output

- [ ] **Change the CSV header (currently line 52) from:**

```ts
  const header = 'Qty,Labels,Material,Length (mm),Width (mm),Thickness (mm),Cuts'
```

**to:**

```ts
  const header = 'Qty,Labels,Material,Color,Length (mm),Width (mm),Thickness (mm),Cuts'
```

- [ ] **Change the row builder (currently line 54) from:**

```ts
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.length},${row.width},${row.thickness},${row.cuts}`
```

**to:**

```ts
    return `${row.qty},${quoteField(row.labels)},${quoteField(row.material)},${row.color},${row.length},${row.width},${row.thickness},${row.cuts}`
```

`row.color` is output raw — hex strings never contain a comma, quote, or newline,
so `quoteField` is unnecessary (matches the unquoted numeric columns).

### Step 7: Run the whole test file to confirm it is fully green

- [ ] **Run:**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: **all** tests in the file pass — the updated CSV/grouping assertions,
the 3 new data-layer tests, and the updated Copy CSV test. The DOM `Color`
column is not yet present, but no test asserts it until Task 2, so the suite is
green. This task therefore commits a green suite.

### Step 8: Typecheck and commit

- [ ] **Run:**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Commit:**

```bash
git add src/ui/buildCsv.ts src/ui/CuttingList.test.tsx
git commit -m "feat: add color to cutting list grouping and CSV export"
```

---

## Task 2: Color column in the table (`CuttingList.tsx`)

**Files:**
- Modify: `src/ui/CuttingList.tsx` (lines 66, 76, 85)
- Test: `src/ui/CuttingList.test.tsx`

### Step 1: Add the DOM `Color` assertions

(The Copy CSV string assertion was already updated in Task 1, since it tests
`buildCsv` output. This task only adds DOM-level assertions for the table column.)

- [ ] **In the `renders table column headers` test (currently lines 184–194), add a
  `Color` assertion after the `Material` line (currently line 188):**

```ts
    expect(screen.getByText('Material')).toBeTruthy()
    expect(screen.getByText('Color')).toBeTruthy()
```

- [ ] **Add one new test at the end of the `describe('CuttingList', …)` block, right
  before its closing `})` (currently line 293):**

```ts
  it('renders the Color column header and the hex value for a part', () => {
    render(<CuttingList parts={[makePart()]} projectName="Test" onClose={vi.fn()} />)
    expect(screen.getByText('Color')).toBeTruthy()
    expect(screen.getByText('#8b6914')).toBeTruthy()
  })
```

A single part is rendered on purpose — `getByText('#8b6914')` would throw if two
rows shared a color and produced two matching nodes.

### Step 2: Run the test file to confirm the two DOM tests fail

- [ ] **Run:**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: exactly two failures, both because the `Color` `<th>`/`<td>` do not
exist yet:
- `CuttingList > renders table column headers` (no `Color` header)
- `CuttingList > renders the Color column header and the hex value for a part`

Every other test passes (Task 1 made all CSV/grouping assertions green).

### Step 3: Add the Color header column

- [ ] **In `src/ui/CuttingList.tsx`, add a `Color` `<th>` between the `Material`
  header (line 66) and the `Length (mm)` header (line 67):**

```tsx
              <th className="pb-2 px-2 font-medium text-xs">Material</th>
              <th className="pb-2 px-2 font-medium text-xs">Color</th>
              <th className="pb-2 px-2 font-medium text-xs">Length (mm)</th>
```

### Step 4: Add the Color data cell

- [ ] **Add a `Color` `<td>` between the material cell (line 85) and the length
  cell (line 86):**

```tsx
                  <td className="py-1.5 px-2 text-xs">{row.material || '—'}</td>
                  <td className="py-1.5 px-2 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-sm border border-border flex-shrink-0"
                        style={{ background: row.color }}
                      />
                      {row.color}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-xs">{row.length}</td>
```

### Step 5: Bump the empty-state colSpan

- [ ] **Change the empty-state cell's `colSpan` (currently line 76) from `7` to
  `8`:**

```tsx
                <td colSpan={8} className="py-3 text-muted-foreground text-center text-xs">
```

### Step 6: Run the full test file to confirm everything passes

- [ ] **Run:**

```bash
pnpm vitest run src/ui/CuttingList.test.tsx
```

Expected: all tests pass (updated breaking assertions + 4 new tests + Color
header check).

### Step 7: Typecheck, lint, full suite, commit

- [ ] **Run:**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 0 type errors, 0 lint errors, all tests pass (233 passed | 5 skipped —
229 previous + 4 new).

- [ ] **Commit:**

```bash
git add src/ui/CuttingList.tsx src/ui/CuttingList.test.tsx
git commit -m "feat: add Color column to cutting list table"
```

---

## Self-review checklist

**Spec coverage:**
- ✅ Grouping key includes color (Task 1, Step 4)
- ✅ `GroupedRow.color` field added and populated (Task 1, Steps 3, 5)
- ✅ CSV Color column, raw hex, no quoting (Task 1, Step 6)
- ✅ Table Color `<th>` between Material and Length (Task 2, Step 3)
- ✅ Table Color `<td>`: swatch (`w-3 h-3 rounded-sm border`) + hex (Task 2, Step 4)
- ✅ Empty-state `colSpan` 7→8 (Task 2, Step 5)
- ✅ No color normalization — `===`/exact-string only (no `.toLowerCase()` anywhere)
- ✅ All 5 breaking assertions updated — 3 `buildCsv` + 2 Copy CSV strings all in Task 1 Step 1 (so Task 1 commits green); only DOM assertions in Task 2
- ✅ 4 new tests: 2 `groupParts`, 1 `buildCsv` (Task 1 Step 1), 1 `CuttingList` DOM (Task 2 Step 1)
- ✅ Color header inline-added to `renders table column headers` (Task 2 Step 1)
- ✅ Single-part render for the hex-text DOM test (Task 2 Step 1)
- ✅ Regex assertions left untouched (correctly survive — not edited in any step)

**Placeholder scan:** None found. Every step has exact code, exact line numbers, exact commands.

**Type consistency:** `GroupedRow.color: string` (Task 1 Step 3) matches `p.color` (a `BoardPart` hex string) in Steps 4–5; matches `row.color` usage in CSV (Step 6) and the table cell (Task 2 Step 4). `makePart()` already sets `color: '#8b6914'`, so all assertions using that value are consistent.

**Green-suite-per-task invariant:** All CSV-string assertions (including Copy CSV) are updated in Task 1, in lockstep with the `buildCsv` change, so Task 1 commits a fully green suite. Task 2 adds only DOM assertions, which fail until the `Color` `<th>`/`<td>` exist. No task commits a red suite.
