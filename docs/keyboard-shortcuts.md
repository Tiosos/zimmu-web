# Keyboard Shortcuts

## Non-modifier

| Key | Action | Notes |
|-----|--------|-------|
| `F` | Activate snap/align mode | |
| `C` | Activate cut mode | |
| `J` | Activate dado joint mode | Click housing face, then housed board's end |
| `L` | Activate half-lap joint mode | Click first board, then the overlapping second board |
| `M` | Activate mortise & tenon mode | Click the mortise face, then the perpendicular tenon end |
| `B` | Activate box / finger joint mode | Click one board's end, then the perpendicular equal-width end of another |
| `T` | Activate tongue & groove joint mode | Click one board's long edge, then the facing long edge of another |
| `Escape` | Cancel snap, cut, or joint mode | No-op if none is active |
| `Home` | Frame all visible parts | Keeps the current view direction; no-op when nothing is visible |
| `H` | Toggle visibility of selected part | Suppressed in snap/cut/joint mode |
| `Delete` / `Backspace` | Remove selected part | Suppressed in snap/cut/joint mode |

## With Ctrl / Cmd

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+Y` | Redo (Windows/Safari alias) |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+O` | Open |
| `Ctrl+N` | New |
| `Ctrl+D` | Duplicate selected part |
| `Ctrl+Shift+E` | Open cutting list |

## Scene tree

The scene tree is one tab stop (the selected row, or the row you last focused). Move inside it with the arrow keys; Tab leaves it.

| Key | Action |
|-----|--------|
| `ArrowDown` / `ArrowUp` | Focus the next / previous visible row |
| `Home` / `End` | Focus the first / last row. In the tree, `Home` moves focus and does **not** frame the view |
| `ArrowRight` | Expand a collapsed branch; on an expanded one, focus its first child |
| `ArrowLeft` | Collapse an expanded branch; otherwise focus the parent row |
| `Enter` / `Space` | Select the focused row |

Moving focus does not select. `Delete`, `Backspace`, `H` and `Ctrl+D` act on the **selected** part, so they are ignored while a different row has focus — press `Enter` on the row first. Selecting a part with the mouse moves focus to its name field in the edit panel so it can be renamed at once; selecting with the keyboard leaves focus on the row, so the arrow keys and these shortcuts keep working.

## Dialogs

The cutting list, 2D drawings and project structure dialogs move focus inside when they open, keep `Tab` / `Shift+Tab` within them (wrapping at either end), and return focus to the control that opened them when they close. With several open, only the newest traps `Tab`. `Escape` closes the dialog.

## Source change review dialog

| Key | Action |
|-----|--------|
| `Alt+ArrowDown` / `Alt+ArrowUp` | Focus the next / previous visible pending finding, wrapping at either end |
| `Alt+Home` / `Alt+End` | Focus the first / last visible pending finding |

These shortcuts respect finding search, part, classification, change type and review-status filters. They are unavailable during report operations or draft restoration. Reviewed-only views have no pending navigation targets.

| Key | Action |
|-----|--------|
| `Alt+Shift+ArrowDown` / `Alt+Shift+ArrowUp` | Focus the next / previous visible finding with a nonempty note, wrapping at either end |
| `Alt+Shift+Home` / `Alt+Shift+End` | Focus the first / last visible finding with a nonempty note |

Note navigation follows displayed finding order and filters, including reviewed-only views. It focuses the note editor and leaves review progress unchanged. Whitespace-only notes are skipped. Ctrl/Cmd-modified shortcuts and composing text are left alone.
