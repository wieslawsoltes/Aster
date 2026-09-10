# Profile-aware file pickers — Aster 2.1

Aster's integrated web-file Open, Save As, and Choose Folder dialogs now share a
single reusable chooser with Windows, macOS, and Ubuntu/GNOME presentations.
The active **Aster profile**, not the physical computer's operating system,
determines the layout. Native browser fallback is intentionally unchanged.

## Appearance

| Profile | Presentation |
| --- | --- |
| Windows | Compact caption with close control, Explorer-style navigation and Quick access, detailed file columns, name/type fields, trailing Open/Save then Cancel. Uses the shell palette, including a dark shell with light applications. |
| macOS | Unified sheet-style header, centered Save As field, translucent Favorites sidebar, compact alternating rows and segmented view controls, trailing Cancel then primary action. Participates in the existing Liquid Materials service without placing effects over the controls. |
| Ubuntu/GNOME | Leading Cancel and trailing primary action in a real headerbar, geometric sidebar, larger rows, and app-palette surfaces. The light chooser stays light even though GNOME's top panel remains dark. |

All use Aster's original vector artwork, active accent/selection colors, installed
font stack, font-size and corner-radius settings. No native OS icon, font,
wallpaper or proprietary rendering assets are supplied. Light, dark, custom and
contrast presets remain supported. Native pixel-for-pixel parity is not asserted.
The macOS treatment is an Aster modal, not an AppKit child sheet.

Switching a theme while a picker is open moves the **existing** controls to the
new profile's action positions. It does not reload the iframe, recreate the name
input, discard its text or reset keyboard focus. Browser form controls use the
corresponding color scheme.

## Working controls

The sidebar opens actual Aster locations. The address field accepts an absolute
virtual directory path; Go or Enter navigates. Back, Forward, Parent folder and
breadcrumbs operate on a bounded 50-location history. A failed navigation does
not become a history entry. There are no nonfunctional cloud, network or recent
locations.

Single-click selects a folder; double-click or Enter enters it. In a folder
picker, Select folder confirms the selected child, or the current directory when
no child is selected. The filesystem root is navigable but is never grantable.
Open and Save As also accept a typed filename within the current directory.
Save As retains a suggested or typed name when a folder is selected, entered with
a double-click, or opened with the primary button. The first action navigates;
only confirmation in the destination selects a save target. Ctrl/Command-deselect
updates the name from the remaining selected file; a selected path takes precedence
over a stale display name. No deselected file is silently substituted.

Search filters the current folder; it is not a recursive filesystem search.
Sorting supports name, modified date, kind and size; names use locale-aware,
natural numeric order. Directories always precede files. Hidden dotfiles can be
shown explicitly; this does not reveal reserved system or app-private paths.

List and icon views, sort direction/column, hidden-file visibility and the preview
pane are saved as display preferences in IndexedDB under `file-picker-ui-v1`.
Saving is serialized. These preferences do **not** save file permissions or restore
expired handles, and they do not alter the requested file-type filters.

The optional preview shows metadata, the first 16 KiB of text, or a raster image.
Files above 8 MiB are metadata-only; the actual loaded Blob size is checked too.
HTML and SVG are inert text, not embedded documents. No PDF, executable, remote
URL, nested web page or media player is executed. Image URLs and delayed preview
results are discarded on selection change, close or revocation.

New folder, overwrite confirmation, cancellation and permission prompts remain
actual broker operations. Save As does not create a file merely by selecting a
name; the existing broker still stages data until the app closes its stream.

## Keyboard and accessibility

- Arrow keys, Home/End and type-ahead move through a roving-focus list. In icon
  view, vertical movement follows the actual rendered column count.
- Shift selects a range; Ctrl/Command toggles items. Ctrl/Command+A selects visible
  files in a multi-file picker, up to the existing 256-file selection limit.
- Ctrl/Command+L or Alt+D focuses the path. Ctrl/Command+F focuses search.
  Alt+Left/Right traverses history, Alt+Up goes to the parent, F5 refreshes, and
  Ctrl/Command+Shift+N opens New folder.
- Enter navigates or confirms the active field/item; Escape cancels. Tab and
  Shift+Tab remain inside the current modal. The desktop is temporarily inert;
  prior inert states and focus are restored on close.

Nested prompts retain their own focus trap. Closing or revoking a chooser disposes
its theme/filesystem listeners, refresh timer, and preview
resources. Cross-frame promise completion waits for the overlay's hit-test update
(two animation frames with a bounded timeout fallback), preventing the next real
iframe click from being swallowed after inert is removed.

At narrow widths, places become a horizontally scrollable strip, optional columns
collapse, and the preview is hidden without losing its preference. Portrait and
short landscape layouts retain the name and primary/cancel actions on screen.
Contrast, forced colors, larger text, reduced motion and opaque surfaces have
explicit styles. Keyboard bindings reserved by the browser/host can remain
unavailable to a page. Screen-reader behavior should also be checked manually;
automated role/focus checks are not a screen-reader certification.

## Architecture and authority

`src/file-picker-models.js` is a pure model for ordering, filtering, selection,
preferences and history. `src/file-picker.js` owns only presentation, navigation,
focus, display preferences and bounded read-only previews.

`src/web-io-host.js` remains the authority boundary: activation checks, path
validation, selected file/folder kind checks, overwrite confirmation, grant
creation, permission revocation, stream handling and atomic writes stay in the
broker. It supplies validation and mutation callbacks to the chooser. New-folder
transactions recheck the session **and** whether the chooser has closed before
committing. The SDK/client protocol and sandbox flags are unchanged.

Asynchronous navigation uses monotonic request generations. Obsolete stat/list
responses cannot replace a later path, clear a newer error or overwrite newly
typed text. Filesystem refreshes reuse the same location and retain valid selection.
All final selection/write checks still use live broker data; a stale row is not
permission to overwrite newer work.

There is one chooser for all broker routes (including file inputs and generated
downloads). This release does not replace Aster's unrelated text prompts, Win32
application-owned native dialog emulation, an app's custom document database, or a
browser-native chooser when integration is disabled. Existing cross-origin SDK,
native drag-out and FileSystemHandle facade limits in [Web Files](web-files.md)
still apply.

## Verification

`tests/file-pickers/` exercises real installed HTML fixtures, real pointer/key
operations, twelve presets times three dialog kinds, byte-preserving workflows,
new-folder/overwrite behavior, type filtering, safe preview cleanup, live profile
switching, keyboard focus, portrait/landscape layouts, and durable display
preferences. The inherited `tests/web-io/` suite remains enabled and verifies
security boundaries, revocation, concurrent edits, native browser fallback,
transfers and unchanged deployed NotepadXP/TwinForge.

The root-selection UI assertion now checks the disabled primary action and separately asserts that the broker grant validator still rejects `/`; its other security/workflow assertions are retained.

Hosted Chromium HTTP and standalone/offline runs plus an independent Firefox run
are required before merge. `--inject` local testing is memory-only and is not
persistence evidence. See [reproduction](../tests/file-pickers/README.md).

## Primary design references

The implementation adapts patterns, not native artwork or platform code:

- Microsoft, [Common Item Dialog](https://learn.microsoft.com/en-us/windows/win32/shell/common-file-dialog).
- Apple, [Using the Open and Save Panels](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/UsingtheOpenandSavePanels/UsingtheOpenandSavePanels.html).
- GNOME HIG, [Dialogs](https://developer.gnome.org/hig/patterns/feedback/dialogs.html).
- GNOME, [File dialogs](https://developer.gnome.org/documentation/tutorials/beginners/components/file_dialog.html).
- WAI-ARIA APG, [Modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
  and [Listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/).

## Recovery provenance

The previous branch contained three incomplete encoded transfer chunks, not an
integrated picker. Ten complete records (including the reviewed model, styles,
host integration and guide) were recovered with before/after SHA-256 validation.
The truncated `file-picker.js` tail and missing test suite were completed in this
round, using the preserved UI prefix. Incomplete transfer text is not shipped.

This round also checks write policy in the New Folder transaction, uses labelled
breadcrumb buttons and accessible sort toggles, and preserves user input across
asynchronous preference loading. Both editable source and rebuilt standalone are
verified together before merge. Display-preference exports are not included in
Aster's generic backup; no file authority is stored with those preferences.
