# Shell launch workflows (Aster 1.8)

This update continues the integrated shell, on top of the reversible Explorer
operations from 1.7. There is no new utility app or native helper.

## Where the features live

| Windows-style workflow | Aster entry point and behavior |
| --- | --- |
| Open with | Explorer and desktop-file context menus. The chooser offers implemented handlers, opens the actual saved file, and supports a one-time choice or an explicit per-extension default. |
| Default apps | Settings → Apps → Default apps; search by extension or app, select a supported handler, or reset defaults. File Properties → Opens with → Change uses the same preference. |
| Run | Right-click Start → Run; Ctrl+Alt+O, or Win+R when the browser receives it. Opens registered Aster apps, virtual files/folders and supported settings destinations. |
| Taskbar Jump Lists | Right-click an app button. Open or pin its recent saved documents, remove entries, open a new window, pin/unpin the taskbar button, or close its windows through their existing save guards. |
| Startup apps | Settings → Apps → Startup. Explicit opt-in, optional minimized launch, no duplication of restored windows, and a startup=off recovery switch. |
| Recent-items privacy | Settings → Privacy & permissions → Recent items. Disable collection in Start and Jump Lists, clear recent entries while retaining pins, or clear Run history. |

Default apps, Startup and Recent items are also searchable from Start and from
the Settings search field. Flyouts and choosers do not create taskbar windows.
Run and Jump Lists support Escape and narrow layouts. The app chooser supports
arrow-key selection; Jump Lists have arrow/Tab navigation and focus restoration.

## Real file handling, not icon substitution

Dispatch consults the saved file's extension/MIME type and an explicit compatible
user choice. Images offer Photos and Paint; HTML offers Orbit Browser and Notepad;
SVG additionally offers Notepad. Media uses Media Player. ZIP opens Explorer's
compressed-folder view. EXE uses the existing limited Win32 Lab. Other files use
Notepad; there is no claim that Notepad decodes every proprietary format.

Only supported handlers appear. Arbitrary installed iframe apps or native EXEs
cannot register file handlers. Choosing Paint as the PNG default changes what
opens the file, but not whether the same picture appears in the Photos gallery.
File-type classification is therefore separate from configurable dispatch.

Preferences affect **Aster only**, not host Windows defaults, browser protocols
or local-folder associations. A filename without an extension can be opened once
but has no stored per-extension default. At most 128 custom associations persist.
Default-app display lists at most 256 known or discovered extensions. Browser
image/audio/video codec support still determines which payloads decode.

## Run command scope

Examples which use production routes:

```text
calc
notepad "/Documents/note with spaces.txt"
explorer C:\Documents
mspaint /Pictures/example.png
ms-settings:defaultapps
ms-settings:startupapps
ms-settings:display
ms-settings:clipboard
shell:downloads
shell:startup
winver
```

`C:\Documents` maps to Aster's `/Documents`, never the host's C: drive. Supported
aliases and settings/shell destinations are explicit tables in
`src/shell-command-models.js`. A visible registered app ID can also be launched.
A missing or unsupported command reports an error instead of fabricated success.

The parser does not evaluate JavaScript, run a command interpreter, start native
processes, or accept arbitrary network/script URLs. Device paths, UNC/network
paths, parent traversal, hidden roots, native mounts and control bytes are rejected.
Paths may contain punctuation as literal filename characters; it is not evaluated.
Only file-capable apps accept a path argument. Lines are bounded to 1,024 characters.

Run history records at most 20 successful command strings locally, including
paths typed by the user. Do not type secrets. The separate Clear Run history
control removes this metadata. Clearing recent documents does not clear Run
history, and a failed or cancelled command is not recorded.

## Jump Lists and privacy

Recent entries are driven by actual saved-file/folder opens, not synthetic
sample documents. Each entry includes only the app ID, virtual path and timestamp.
There are at most 60 recent app/path pairs and 24 deliberate pinned documents
across all apps; a Jump List displays up to eight unpinned recent entries per app.
An unavailable entry is disabled and can be removed. Removing or clearing metadata
never deletes the underlying file. A pinned document is reopened in its original
app, even when the extension's default has subsequently changed.

Tracking initially follows the existing Aster behavior (enabled), with migration
of existing recent paths. Turning it off clears unpinned recent metadata and hides
Start's recent recommendations, while keeping deliberate pins. It prevents new
collection until re-enabled, including in-flight stat requests from an older
tracking epoch. There is no monitoring of host files, clipboard, or remote app
contents. Paths under `/Local` and `/.Trash` are not recorded.

Preferences are in the existing IndexedDB `meta` store under `shell-launch`;
there is no schema upgrade or file-store reset. Serialized saves preserve ordering.
Stored state is validated, deduplicated and bounded on load and excludes arbitrary
app options or credential objects. These preferences are not included in Aster's
current backup export. Clearing site data removes them. Multiple browser tabs
are not a real-time synchronized preferences service.

## Startup apps

Nothing new starts by default. Up to six explicitly selected apps may start from
this allowlist: File Explorer, Notepad, Calculator, Calendar, Clock, Tasks,
Terminal, Settings. Each can start minimized. Automatic EXE execution, imported
code and remote web apps are deliberately excluded. Enabling a checkbox saves
the preference but does not launch the app immediately.

Startup runs once per page boot, after normal session restoration. If an app
already has a restored open window, the startup entry reuses it rather than
opening a duplicate or changing its saved state. New startup windows are staggered
with short browser yields. No fabricated startup-impact or native-process values
are shown.

Append `?startup=off` to Aster's address to skip these configured startup launches
for that load without deleting preferences. This switch does not disable Aster's
independent restore-previous-session setting. It is an Aster recovery option,
not Windows Safe Mode or a host login service.

## Implementation

`src/shell-command-models.js` contains deterministic bounded routing/state models.
`src/shell-launch.js` owns preferences, dispatch, Run, Jump Lists and Settings views.
`src/shell-launch.css` styles the shared shell surfaces. Explorer, Properties,
Start search, taskbar and boot use those services. `OS.fileTypeApp` preserves type
classification separately from configurable `OS.appForFile`.

Only this small catalog of handlers and local metadata loads at startup. Jump
List file checks are lazy, generation-guarded and stop updating a disposed surface.
No additional remote sites are loaded and no polling/background native process is
introduced. The existing WebGPU desktop and browser-only Win32 implementation
are unchanged; no graphics/CPU speedup is claimed for this shell-routing work.

## Verification

See `tests/shell-launch/README.md`. Automated checks separate pure models,
ordinary HTTP browser workflows, full-page persistence/startup, and the standalone
edition. Inherited Explorer, integrated-shell, desktop-feature, 67-site launcher
and Win32/WebGPU/native checks remain enabled. Existing file data and the session
undo engine are exercised alongside new defaults. OS-reserved keys and browser
codec/permission support remain platform dependent; visible controls are provided.

## Primary-source Windows references

These sources guide placement and familiar behavior, not a claim of full Windows
implementation or automatic parity with future Windows updates:

- [Microsoft: Change default apps](https://support.microsoft.com/en-us/windows/apps/change-default-apps-in-windows)
- [Microsoft: Launch Default Apps settings](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-default-apps-settings)
- [Microsoft: Settings URI reference](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings)
- [Microsoft: Windows keyboard shortcuts](https://support.microsoft.com/en-us/accessibility/windows/keyboard-shortcuts-in-windows)
- [Microsoft: File Explorer](https://support.microsoft.com/en-us/windows/experience/fileexplorer/file-explorer-in-windows)
