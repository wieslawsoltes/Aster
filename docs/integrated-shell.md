# Aster 1.6 — integrated shell and desktop interaction

Baseline: merged Aster 1.5 (`4e26277`). Original HTML/JavaScript/CSS implementation.

## Integration, not another app collection

The previous release delivered the underlying services. This release changes
where and how they are used, while keeping file data, clipboard policy, Focus
state, ZIP validation, and capture lifecycle in those existing reusable services.

| Capability | Normal user entry point in 1.6 | Window/taskbar behavior |
| --- | --- | --- |
| Clipboard history | Clipboard flyout, Start search, Settings → System → Clipboard | No utility window; paste returns to the original unchanged editor/selection |
| Widgets | Left taskbar day button or Widgets shortcut | Left-side board; close removes its view/subscriptions, not the data |
| Focus | Notification Center calendar footer; Clock → Focus sessions; Settings → System → Focus | Start/end inline or use the existing Clock/Settings window |
| Notifications | Taskbar date/bell → Notification Center | Read/dismiss/clear, calendar navigation, local agenda, Focus, DND |
| Quick settings | Network/sound tray group | Aster brightness/volume, night light, DND, theme, fullscreen and accessibility subpanel |
| Desktops/window groups | Task View | Inline rename, reorder, backgrounds, transfer/close desktops; save/restore arrangements |
| Snap Assist | Snap one window left/right or select a layout from Maximize | Choose the second window without opening a workspace utility |
| ZIP | Double-click ZIP in Explorer, or use Compress/Extract commands | Read-only compressed-folder listing in the existing tab; Extract all navigates that Explorer to the new folder |
| File History | Explorer → Properties → Previous versions; context menu/details pane | File properties tabs with preview, restore copy/original, download; no File History window |
| Storage and recovery | Settings → System → Storage / File recovery & backup | Uses the existing Settings window and transactional services |
| Accessibility | Quick settings subpanel or Settings → Accessibility | The same persisted settings and reading controls, not an additional window |
| Recording | Snips → Record | One Snips window, shared close/unsaved-capture guard, real production encoder |

Clock's timer/world-clock tools remain available beside its Focus sessions mode.
Snips keeps still capture/annotation and real recording. Switching modes disposes
the previous view. Active recording/unsaved clips require confirmation; streams
returned after a closed permission request are immediately stopped.

Explorer ZIP entries are read-only, not executable previews: extract before
editing or opening them. Folder entries can be traversed, and the existing tab,
breadcrumb, search, Up/Back and Extract all commands remain available. Editing,
pasting into, or drag-moving archive entries is deliberately disabled. ZIP64,
encryption, unsupported methods and archive limits remain as in the underlying
ZIP service. Extraction validates before an insert-only transaction; the source
archive and other files stay unchanged.

## Shell look and behavior

`src/shell-design.css` supplies original Fluent-inspired material layers, quieter
borders, 34px title bars, a 48px taskbar, centered controls, a compact six-column
pinned Start grid, revised recommendations, window previews, Settings navigation
and breadcrumbs, menu/dialog spacing and consistent light/dark states. High
contrast and reduced motion remain supported. Narrow screens use stacked cards
and contained flyouts. No Microsoft artwork, font bundle or runtime is shipped.
The CSS is a browser approximation of desktop materials, not the Windows Mica API.

Start exposes applications and system destinations separately. The nine older
utility descriptors are hidden from Start/App Center; their APIs remain registered
for existing integrations and regression tests. Visible routes call `OS.openApp`,
which dispatches to flyout/parent-app destinations instead of `OS.launch`ing the
utility. The low-level `OS.launch` remains available for legacy clients.

Persisted 1.5 sessions are migrated at restoration: Storage/Accessibility/History
become Settings pages, Focus becomes Clock, recording becomes Snips, and Archives
becomes Explorer. Transient Clipboard/Widgets/Window Groups windows do not reopen
automatically. Their data is retained. Old taskbar pins and saved-group entries
are mapped to parent apps. No recording, clipboard read or external file access
starts because a session was restored.

## Keyboard and focus

When delivered to this page, Windows-style shortcuts are handled: Meta/Windows
opens Start; Meta+V Clipboard, Meta+A Quick settings, Meta+N notifications,
Meta+W Widgets, Meta+Tab Task View, Meta+E Explorer, Meta+I Settings, Meta+Z Snap
layouts, Meta+arrows snap/minimize, Meta+D desktop and Meta+Shift+S Snips.
Browsers and host operating systems may reserve these combinations; Aster cannot
intercept keys that the browser does not deliver.

Visible controls are always available. Browser-friendly aliases are Ctrl+Alt+V
(Clipboard), Ctrl+Alt+A (Quick settings), Ctrl+Alt+F (Clock Focus), Ctrl+Alt+W
(Task View), Ctrl+Alt+U (Accessibility) and Ctrl+Alt+R (Snips recording).
Explorer supports its existing tab shortcuts and Alt+Enter for properties.

Shell flyouts share one exclusive panel lifecycle. Escape closes the top surface
and restores its trigger/editor; Tab cycles inside the surface. Opening a context
menu in Start or Task View preserves that surface. Escape dismisses the context
menu first. An outside click retains focus on the clicked destination. File
properties and Settings dialogs remain above the desktop/visual filters.

## Architecture and performance

- `integrated-desktop.js`: scoped embedded-view adapter, destination routing,
  Settings pages, Clock/Snips modes, session migration and file-property/ZIP actions.
- `shell-experience.js`: flyouts, calendar/Focus, Task View/desktops, Snap Assist,
  shortcut routing and Start-pin state.
- `shell-design.css`: original desktop styling and responsive overrides.
- Existing `desktop-services.js`, `desktop-models.js`, `archives.js`: shared data,
  bounded Workers, storage policies and actual operations; not duplicated.

An embedded view implements the lifecycle expected by existing views, but never
registers in `OS.windows` or adds a taskbar button. Its subscriptions/intervals,
object URLs and pending capture resources are disposed with its surface/owner.
Settings re-navigation disposes the outgoing view, including rapid competing
navigation. Repeated flyout opening cannot retain an ever-growing list of active
views. Widget updates are data-driven; transient surfaces do not create another
persistent desktop polling loop. The existing WebGPU wallpaper/window renderer
and Win32 CPU/GDI implementation remain intact; CSS/text and native browser media
codecs are not advertised as WebGPU workloads.

## Deliberate browser boundaries

Connectivity shows the browser's online signal and does not pretend to toggle a
Wi-Fi adapter. Brightness, volume, night light, DND and accessibility apply to
Aster, not the host computer. Widgets use actual local tasks, calendar and file
statistics, not fabricated weather/news. Focus is not a cross-tab OS service.
The visual lock does not authenticate a user. Private file history, downloaded
backups, permissions and remote app origin boundaries are unchanged.

The 67 reviewed web apps still load lazily in Aster windows; they are not bundled
as offline copies. Their storage, GPU/capture/local-file access and service-worker
restrictions remain browser-dependent. Win32 compatibility remains a limited
browser execution layer, not universal Windows compatibility.

## Verification

See `tests/integrated-shell/README.md`. New browser scenarios verify visible
integration paths and count real windows/active views rather than accepting a
screenshot or app registration as proof. Local `--inject` is explicitly a restricted
environment fallback, not a claim of durable HTTP storage. Hosted tests use normal
HTTP, full reload, and the same standalone source. Existing model, desktop,
web-app, Win32, GUI, native-reference and source-rebuild workflows are preserved.

The recording test substitutes only a clearly labeled canvas stream for the
permission chooser's result. The production MediaRecorder, decoder, saved video
and track cleanup are real. Physical chooser behavior/system audio and host-key
interception still require platform checks. No physical-GPU benchmark is claimed.

## Primary design references

These references describe Windows and material placement, not verification of
Aster's implementation:

- [Clipboard flyout and System → Clipboard](https://support.microsoft.com/en-US/Windows/Apps/using-the-clipboard)
- [Focus in calendar/Clock/Settings](https://support.microsoft.com/en-us/windows/experience/focus-stay-on-task-without-distractions-in-windows)
- [Windows taskbar and tray](https://support.microsoft.com/en-US/Windows/Experience/Personalization/customize-the-taskbar-in-windows)
- [Configure multiple desktops](https://support.microsoft.com/en-us/windows/experience/configure-multiple-desktops-in-windows)
- [Snap windows](https://support.microsoft.com/en-us/windows/experience/snap-your-windows)
- [Mica material layering](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)
- [Modern app structure](https://learn.microsoft.com/en-us/windows/apps/develop/ui/windows-app-sdk-app-structure)
