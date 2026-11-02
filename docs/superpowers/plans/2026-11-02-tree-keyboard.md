# Project tree keyboard implementation plan

> Use superpowers:executing-plans inline; the existing managed worktree isolates development from the distribution and live vault.

**Goal:** Navigate visible project/task rows with Up/Down, toggle branches with Enter, rename with Space, add with the =/+ key, invoke task deletion with Delete and today with T, and enlarge both disclosure arrows.

**Architecture:** A bundled tree-keyboard controller registers existing rows and their parents, delegates local keyboard events, preserves a single focus anchor per note/leaf, and restores focus after controlled renders without scrolling. Keyed project/task caches update changed headers while retaining input nodes and current source references. Dataview data updates call an incremental update callback rather than clearing the view. Navigation links also retain their nodes when unchanged. Real text/date/select controls retain native keys and IME behavior. Left/Right and Home/End follow visible tree order.

**Spec:** User requested keyboard navigation and larger triangles, with the existing minimal interface. Final mapping: Enter expands, Space renames, =/+ adds, Delete invokes task X, T invokes task 今.

**Constraints:** No new controls; no accidental completion on row Enter; no capturing Ctrl+Z or editable-field keys; preserve source data and same-level ordering.

**Review focus:** collapsed/hidden rows; nested-parent navigation; focus after rename/Esc/refresh; native checkbox/button behavior; inactive panes; teardown; enlarged arrows retaining indentation.

- [x] Add RED/GREEN tests for pure navigation decisions; implement the controller and view row registration.
- [x] Run example-only DOM/view tests for focus, editing, incremental updates, input keys and disclosure sizes; review and fix findings.
- [x] Update CSS, guides, build/version and package hashes; integrate/deploy/push the verified result.

## Verification ledger

- 125 source tests pass (116 existing and 9 navigation-decision tests).
- 44 checks pass in a separate hidden Electron Chromium window with the actual view, bundle and CSS, using an in-memory example backend. No personal notes or main-window input are accessed.
- Regression checks include closed-details visibility, collapsed-parent entry, leaf entry reopening, native date-panel dismissal, pane ownership, pointerdown during data updates, input composition/caret preservation, continuous Enter, project ordering, larger arrows, wider indentation, outline alignment and stable navigation links.
- Reading and editing views keep separate table controllers with shared note/leaf selection; hidden sibling views and switching between modes do not disable keyboard navigation.
- The =/+ shortcut invokes the existing row plus button, including disabled-state rules. Project rows add top-level tasks; task rows add children and focus the input. Plain equals and Shift-plus are accepted, while editable fields and IME keep their native keys.
- Delete and T invoke the existing task buttons; project rows do not expose those actions. Held keys do not repeat deletion/today toggles. Tests verify subtree deletion and undo, today add/cancel, native text keys and Ctrl+T, and the final Enter/Space mapping.
- Independent review findings resolved; final review reports no remaining P1/P2.
- The browser check generator and its fixture ship in `维护资料/GTD快捷操作源码/界面验证/`.
