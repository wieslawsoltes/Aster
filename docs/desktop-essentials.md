# Desktop essentials: ten Windows 11–inspired improvements

Research and implementation: 2026-09-08. Baseline: Aster `df9d6a4` (merged #4).
These are original browser-scoped implementations, not Windows system services.

## Why these ten

Priority is our engineering judgment: everyday usefulness, size of the gap in
Aster, and whether the complete user workflow can be delivered without a native
helper, account, paid API, or fictitious operating-system controls. The existing
Start menu, 67 web apps, taskbar, window manager, Win32 runtime, themes, calculator,
clock, calendar and basic file operations already covered much of the visible
Windows desktop. This round extends those capabilities rather than counting them
again. This is not a ranking published by Microsoft or a claim of Windows parity.

| Priority | Windows built-in reference | Gap in baseline Aster | Delivered workflow |
| --- | --- | --- | --- |
| 1 | [Explorer tabs and pinned files][tabs], [Explorer][explorer] | A decorative single tab, no independently navigable tabs | Up to 12 real folder tabs, individual navigation/search/view, restored tab state, favorites, safe text preview and query filters |
| 2 | [ZIP compression and extraction][zip] | No general browser-native ZIP tool | Create, inspect, download and atomically extract stored/DEFLATE ZIPs; Unicode and binary interoperability |
| 3 | [Clipboard history][clipboard] | File-operation clipboard only | Opt-in text history with search, deduplication, pinning, deletion and insertion back into the original Aster editor |
| 4 | [Focus sessions and DND][focus] | Independent timer and manual DND without a focus workflow | Persistent deadline, pause/resume, task choice, daily goal, scheduled quiet hours and priority completion notice |
| 5 | [Customizable Widgets][widgets] | Small fixed information panel | Reorderable, hideable cards with actual calendar/tasks, editable autosaved note, clock, focus totals and real virtual-file storage |
| 6 | [Snap groups][snap], [multiple desktops][desktops] | Basic snap and desktop switching only | Named saved window groups, three arrangements, restore/reuse open windows, desktop rename/reorder/removal and distinct backgrounds |
| 7 | [File History][history] | Overwriting a virtual file lost its previous contents | Transactional previous versions, filter/preview/download, restore-original or restore-copy, bounded retention |
| 8 | [Storage Sense][storage] | Storage totals and manual recycle-bin emptying only | Folder usage, largest files, browser quota reporting, previewed cleanup and opt-in aged-recycle-bin cleanup at startup |
| 9 | [Color filters][filters] and [contrast themes][contrast] | Text-size/contrast toggles only | Color filters, large pointer, reading guide and large text reader; optional installed local-voice read-aloud with pause/resume/stop |
| 10 | [Snipping Tool video capture][snips] | Still screenshots only | Permission-based screen/tab/window recording, pause/resume/stop, real video preview, download and virtual Videos saving |

Windows File History can back up to an external drive or network location. Aster's
same-browser version history is deliberately different: it provides recovery
from overwrites, **not protection from losing browser data or a device**. Likewise,
named manually saved Aster groups extend the idea of Snap groups; they are not an
exact reproduction of Windows' automatic group lifecycle.

## Entry points

Use **Settings → Desktop essentials** for all ten workflows. Nine new apps are
also searchable in Start: ZIP Archives, Clipboard History, Focus Sessions,
Widget Board, Window Groups, File History, Storage Manager, Accessibility Tools,
and Screen Recorder. File Explorer is upgraded in place. There are now **28
built-in apps plus the same 67 reviewed web apps**.

Explorer's **+** opens a tab, tab arrows navigate, and its More/context menus expose
archive/history actions. Filters compose with ordinary name search, for example
`kind:image`, `ext:txt report`, `size:>1mb`. Favorites appear in the sidebar.
**Snips → Record video**, **Task View → Saved window groups**, the notification
center's Focus button, and the taskbar's day/widgets button provide contextual
entry points.

When Aster receives the keys, `Ctrl+Alt+V` opens Clipboard, `Ctrl+Alt+F` Focus,
`Ctrl+Alt+W` Window Groups, `Ctrl+Alt+U` Accessibility and `Ctrl+Alt+R` Recorder.
Explorer handles `Ctrl+T`, `Ctrl+W` and `Ctrl+Tab` within its window. Some browser
or host shortcuts are reserved; the visible controls always remain available.

## Files, transactions and bounds

File writes use the version-2 IndexedDB schema. Upgrading adds a `history` store
without deleting either existing `files` or `meta`. The previous file, history
index pruning and replacement file commit in **one transaction**. A failed
transaction leaves the existing file unchanged. A blocked upgrade explains that
other Aster tabs should be closed and the page reloaded; it does not hang startup.
A previous version of Aster may have an open connection that cannot cooperate
with an upgrade until that tab closes.

History keeps at most 10 versions per path, 200 total and 32 MiB. Individual prior
files above 8 MiB are skipped. Identical string saves do not create duplicates;
Blob saves are treated as new versions without a costly full binary comparison.
History is enabled by default and can be disabled or cleared. Only normal virtual
file overwrites are tracked—not native mounted folders, bulk backup import,
Win32 private drives, remote iframe app storage or unsaved buffers. Restoring an
original captures the current version first. Important history can be downloaded
individually; ordinary Aster backup still exports current files, not this store.

ZIP heavy lifting uses short-lived **Workers**, leaving the desktop thread free
for input. Browser compression streams perform DEFLATE; stored ZIP remains an
encoding fallback. Two jobs maximum, 60-second deadline, 1,024 entries and 64 MiB
expanded payload per archive. Readers enforce size/CRC, central/local agreement,
non-overlapping data, bounded UTF-8 names and no duplicate/colliding paths.
Traversal, absolute paths, hidden components, symlinks, encryption, unsupported
methods and ZIP64/multi-disk archives are rejected. Extraction validates all
payloads before a new subtree is committed. Insert-only transactions roll back
on a concurrent destination collision instead of replacing another file. This
codec is independent of the existing emulated 7-Zip executable.

Storage Sense defaults **off**. Automatic mode runs at most once per day on
startup, never in a hidden background service. Cleanup selects only Aster Recycle
Bin roots with an actual `deletedAt` older than the chosen age, then revalidates
and deletes in one file transaction. A reviewed selection is matched by path and
deletion timestamp. Downloads, current documents, native disks, other apps' data
and version history are not automatic cleanup targets. Manual history removal
requires its own confirmation. Browser quota can include other storage sharing
the origin; the virtual-file totals describe only Aster's file store.

## Privacy, lifecycle and browser scope

Clipboard history defaults **off**. No polling or automatic system-clipboard read
occurs. Copy events in supported Aster fields are captured after opt-in; password
fields are excluded. Explicit **Read system clipboard** requires browser support
and permission. Unpinned text is memory-only and disappears on reload; pins alone
persist. Limits are 25 items and 16,384 characters each. There is no cloud sync or
clipboard capture from cross-origin app frames. Paste checks that the original
field remains connected and unchanged before replacing its recorded selection.

Focus uses wall-clock deadlines, so pauses in browser scheduling do not stretch a
session. Completion is credited once in the loaded session model. Multiple Aster
tabs do not synchronize a running timer in real time. Ordinary Aster toasts and
notification sounds are quiet during focus or configured quiet hours; records
remain in Notification Center. Manual DND is never silently overwritten. This
does not silence Windows, other tabs or iframe applications.

Window Groups retain app IDs, safe file/view metadata and normalized rectangles,
not unsaved text, credentials, child-frame state or executable CPU state. Up to
20 groups with 12 entries each; arranging supports up to four windows. Restoration
reuses matching open windows and does not close unrelated work. App minimum sizes
may affect a restored arrangement. The separate existing session/draft mechanism
remains responsible for unsaved Notepad recovery. Desktop removal moves windows
to a remaining desktop rather than closing them.

Accessibility color filters affect Aster's rendered layers without moving modal
controls beneath the desktop. The reading guide and pointer are visual aids, not
a screen reader. Read-aloud offers only voices marked `localService` by the
browser; absent local voices disable speech while keeping text reading usable.
This is not a promise of a particular voice, a full Narrator implementation,
color-vision clinical correction or host-wide accessibility changes.

Screen Recorder calls `getDisplayMedia` only from its explicit chooser action.
No capture starts on launch. Camera and microphone are not requested. Shared
system audio is optional and only available when the browser/source offers it.
The chosen codec depends on actual `MediaRecorder` support. Tracks, timers and
object URLs are released on stop/close, and a stream arriving after a closed
permission prompt is immediately stopped. A clip is bounded to 30 minutes/64 MiB;
a size overflow is diagnosed instead of saving a silently truncated file. Save or
download clips before closing. No video is uploaded by the recorder. Real capture
support and permission dialogs depend on browser, secure context and platform.

All new code is local vanilla JavaScript/CSS, packaged in the existing standalone
build. New UI uses browser text/controls; per-desktop wallpaper still uses Aster's
existing WebGPU renderer (or labeled Canvas fallback). This does not claim GPU
acceleration for every file/UI operation or a measured physical-GPU speedup.

## Verification

See [`tests/desktop-features/README.md`](../tests/desktop-features/README.md).
The new suite separates codec/model tests, real browser workflow tests, durable
IndexedDB reload/upgrade tests and a real video codec test with an explicitly
labeled synthetic canvas stream. The actual screen-permission chooser and audible
local speech remain manual capability checks. Existing web-app and Win32 suites
are retained unchanged in scope. No failing assertion is replaced by a success
label or a mocked feature implementation.

## Primary sources consulted

These links support the Windows baseline and API contracts—not claims about the
quality or compatibility of Aster's independent implementations.

[tabs]: https://blogs.windows.com/windows-insider/2022/10/11/releasing-windows-11-build-22621-675-to-the-release-preview-channel/
[explorer]: https://support.microsoft.com/en-us/windows/experience/fileexplorer/file-explorer-in-windows
[zip]: https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/zip-and-unzip-files
[clipboard]: https://support.microsoft.com/en-us/windows/apps/using-the-clipboard
[focus]: https://support.microsoft.com/en-us/windows/experience/focus-stay-on-task-without-distractions-in-windows
[widgets]: https://support.microsoft.com/en-us/windows/experience/personalization/stay-up-to-date-with-widgets-in-windows
[snap]: https://support.microsoft.com/en-us/windows/experience/snap-your-windows
[desktops]: https://support.microsoft.com/en-us/windows/experience/configure-multiple-desktops-in-windows
[history]: https://support.microsoft.com/en-us/windows/experience/backup-recovery/backup-and-restore-with-file-history
[storage]: https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/manage-drive-space-with-storage-sense
[filters]: https://support.microsoft.com/en-us/accessibility/windows/use-color-filters-in-windows
[contrast]: https://support.microsoft.com/en-us/windows/experience/personalization/personalize-your-windows-experience-with-themes
[snips]: https://support.microsoft.com/en-us/windows/apps/use-snipping-tool-to-capture-screenshots
