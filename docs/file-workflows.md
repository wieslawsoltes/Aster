# Explorer file workflows (Aster 1.7)

This extends the integrated shell from #6. No extra utility app is registered.
Use the existing Explorer command bar, F2, Delete, drag/drop, and Ctrl+C/X/V.

## Delivered behavior

* Multi-item virtual file copies/moves use an explicit **Replace or skip files**
  dialog. Keep both, Skip, and (file/file conflicts only) Replace are supported.
  Folders are kept separate rather than silently merged. Skipped cut items remain
  on the Aster file clipboard.
* **Undo / Redo** are Explorer command-bar buttons and More menu items; Ctrl+Z,
  Ctrl+Y and Ctrl+Shift+Z work when Explorer's file list has focus, not in editors.
  Copy, move, rename, import, create, recycle and restore share the journal.
* **Batch rename** is the normal Rename/F2 action on a multi-selection. It previews
  numbered names or literal text replacement, preserves extensions, and rejects
  duplicate/occupied names before applying. Renames commit together.
* Dragging within the virtual drive moves; holding Ctrl copies. Imported browser
  File objects are copied. Native connected folders retain the old explicit
  permission-dependent operations, without claiming transactional rollback.
* **File operations** is a nonmodal shell progress surface, not a taskbar app.
  It shows actual prepared-record counts, queued/running/completed/error states,
  pause/resume and pre-commit cancellation. Hiding it does not cancel work.

## Transactions, recovery and scope

All selected virtual rows commit in a single IndexedDB files/history/meta
transaction. A prepared snapshot is rechecked **inside** the write transaction.
An intervening edit aborts the batch, without overwriting or partially writing.
Replacement files participate in the existing Previous versions service.
Normal write APIs stamp each record with a unique revision, so writes sharing a
millisecond, size or name still invalidate stale undo. Undo validates the entire
affected subtree; it will not delete a newly added descendant or overwrite a
newer save. Unrelated edits do not invalidate undo. Native folders, permanent
deletions, archive extraction, old API calls outside Explorer, and unsaved editor
buffers are not added to this journal.

The undo journal is memory-only: at most 20 operations and 64 MiB of referenced
before/after payloads in total. One batch is limited to 4,096 touched records and
64 MiB of referenced before/after payloads. Four jobs may be queued. A reload
keeps committed files/Previous versions but drops undo history. This is not a
backup and does not restore an overwritten unsaved editor buffer.

Progress counts virtual database records, **not** physical disk throughput.
Planning yields every 64 prepared records; immutable Blob payloads are not
reencoded or uploaded. Cancel is available until the atomic commit begins;
there is no false claim that an already committed transaction can be cancelled.
The optimistic commit may ask for retry even after an unrelated concurrent edit
while a batch was being prepared. This favors data safety over silently choosing
new outcomes after the user approved a preview.

## Verification

`node --test tests/file-workflows/models.cjs` checks the pure planner, conflicts,
subtrees, protected paths, rename swaps, inverse operations, binary payloads and
bounds. `python tests/file-workflows/browser.py` tests actual Explorer keyboard,
context menu, pointer drag, rename and conflict dialogs, file versions, queued
cancellation, stale undo and an intervening write during an open conflict dialog.
CI repeats on standalone HTML and checks full-page durable storage reloads.
`--inject` is a local memory-only fallback for managed browsers; it does not
establish IndexedDB or HTTP behavior. Existing shell, desktop, Win32/WebGPU and
all 67 live web-app startup checks remain enabled on the PR.

## Windows reference

The placement follows Microsoft's documented File Explorer copy/move controls
and Windows file-management keyboard shortcuts, rather than adding a second
file-management utility:

- https://support.microsoft.com/en-us/windows/experience/fileexplorer/file-explorer-in-windows
- https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows

Aster is browser-scoped; its database transactions and session-only undo limits
are not claims of NTFS or universal Windows filesystem behavior.
