# Aster Desktop

**Your space. Your pace.** An independent, Windows 11–inspired browser desktop built with plain HTML, CSS, JavaScript, and WGSL. Twenty-eight built-in apps, a shared file system, a window manager, and an implemented WebGPU graphics path. No runtime framework, package manager, external font, CDN, account, or backend is required.

Aster is a browser desktop, **not a bootable operating system or a general Windows replacement**. The experimental **Win32 Lab** runs a limited subset of real **32-bit x86 PE executables entirely in the browser**, using an original WebAssembly CPU interpreter, a JavaScript Windows API facade and WebGPU GDI rendering. No Wine, Docker, companion, OS image, native executable launch or streamed desktop is involved. Most existing Windows software is not yet compatible. Included applications are the original reduced 7-Zip console and legacy TinyCC binaries, plus a source-built Windows version of WineMine with unchanged upstream gameplay. TinyCC can compile a Windows EXE that Aster then runs. WineMine exercises PE resources, bitmap drawing, menus, modal dialogs and a private registry. Its game code runs as x86, not as a JavaScript port. See [the tested scope and instructions](docs/browser-win32.md) and [third-party licenses/source](third-party/README.md). Imported HTML/JavaScript apps continue to use isolated browser frames.

## Desktop essentials (1.5)

**Settings → Desktop essentials** opens ten substantial Windows-inspired workflows:
real Explorer tabs/favorites/preview, ZIP tools, opt-in Clipboard History, Focus
Sessions, a configurable live Widget Board, saved Window Groups and personalized
desktops, transactional File History, safe opt-in Storage Sense, Accessibility
Tools, and permission-based Screen Recorder. They work with the shared virtual
files, actual task/calendar data, existing window manager and standalone build.
The 67 categorized web apps and experimental Win32 runtime remain available.

See [the research, priorities, usage and exact browser limits](docs/desktop-essentials.md)
and [the independent workflow tests](tests/desktop-features/README.md). File History
is same-browser recovery, not an external backup. Clipboard capture and automatic
cleanup start disabled. Recording always requires an explicit browser chooser.


## Start

### GitHub Pages

[Open Aster Desktop](https://wieslawsoltes.github.io/Aster/) · [Standalone HTML](https://wieslawsoltes.github.io/Aster/Aster.html)

The hosted edition uses HTTPS and the same local-first application source. Files remain in your browser workspace; GitHub Pages does not receive your virtual files.

### Single-file edition

Open `Aster.html` in a modern desktop browser. All application code, styles, icons, and initial sample content are contained in that file or generated locally. There are no external app assets to fetch. Browser policies may restrict persistence and hardware APIs for files opened directly. Aster automatically uses its fallback renderer and displays a warning when durable storage is unavailable.

### Localhost edition — recommended for browser APIs

Run `Launch Aster.cmd` on Windows or `Launch Aster.command` on macOS. On Linux, run `./start.sh`. These convenience launchers require Python 3, with no third-party Python packages.

Alternatively, from this directory:

```sh
python3 start.py
```

The launcher opens:

```text
http://localhost:8765/
```

The server is bound to **127.0.0.1 only**. It serves this project, not arbitrary folders on your machine. Keep its terminal open. Press Ctrl+C to stop it. To avoid opening the browser automatically:

```sh
python3 start.py --no-browser
```

An existing static server also works. Serve this directory over HTTPS or a loopback address. No rewrite rules, database server, or build step is necessary. Keep the same browser profile, hostname, and port when returning to a saved workspace; browser storage is origin-specific.

## The desktop

The shell includes a centered or left-aligned taskbar, Start menu, app/file/settings search, running-app indicators, window previews, context menus, notification center, calendar flyout, quick settings, desktop shortcuts, selection rectangles, and a visual lock screen. Window operations include dragging, eight-direction resizing, minimizing, maximizing, side/corner/third snap layouts, and virtual desktops with Task View.

Appearance settings include light/dark/system themes, four original procedural ribbon palettes, accent colors, transparency, reduced motion, high contrast, text size, and graphics resolution. Brightness and volume controls affect **Aster**, not system-wide hardware settings. Online status and battery information are shown only from browser-provided signals; they are not fake Wi-Fi/Bluetooth control panels.

## Built-in apps

| App | Implemented operations |
| --- | --- |
| File Explorer | Home, gallery, breadcrumbs, history, list/grid views, sorting, file search, multi-selection, folder creation, copy/cut/paste, rename, move, drag-and-drop import, metadata preview, downloads, recycle bin, restore, and permission-based local-folder mounting. |
| Notepad | Real text editing, Unicode, open/save/save-as, local text import, download, find/replace, wrap, zoom, safe Markdown preview, unsaved-change prompts, and session drafts. |
| Orbit Browser | Tabs, address input, back/forward/reload, built-in home/apps pages, local HTML execution, sandboxed website embedding, and external-browser opening. Sites may refuse to be embedded. |
| Terminal | A real virtual-file-system command interpreter: `ls`, `cd`, `pwd`, `cat`, `echo`, redirection, `touch`, `mkdir`, `cp`, `mv`, `rm`, `tree`, `find`, `export`, `open`, `edit`, `apps`, `launch`, `ps`, `kill`, `theme`, `desk`, and more. It is not the host shell. |
| Paint | Pressure-aware brush, eraser, line, rectangle, ellipse, flood fill, eyedropper, custom colors, stroke size, filled shapes, undo/redo, image import, canvas resize, PNG save/download, and unsaved-change protection. |
| Photos | Local gallery, thumbnails, decoded image display, zoom, pan, rotate, rotated PNG export, and open-in-Paint. |
| Media Player | Actual local audio/video playback, playlist, transport controls, repeat, playback speed, volume, and an audio-frequency visualizer. A short, original synthesized WAV is included. Codec support is provided by the browser. |
| Code Studio | HTML/CSS/JS source tabs, line numbers, indentation, project saving, runnable isolated previews, console/error forwarding, HTML export, run-as-app, and add-to-Start. |
| Snips | User-authorized screen/tab/window capture through the browser, PNG save/download, and open-in-Paint. Capture support and the chooser are browser-dependent. |
| Calculator | A non-`eval` arithmetic parser, scientific functions, parentheses, powers, factorial, percentages, memory, history, and keyboard entry. |
| Calendar | Month view, date selection, local events, editing, deletion, notes, and reminders while the Aster tab is open. No Google/Microsoft account integration is implied. |
| Clock | Local and world clocks, stopwatch/laps, countdown timer, and in-desktop alerts. Timers continue after the app window is closed, but require the Aster tab to stay open. |
| Tasks | Local task creation, completion, priorities, due dates, notes, editing, filtering, deletion, and undo. |
| Mines | Multiple board sizes, safe first click, flood reveal, flagging, chord reveal, keyboard controls, timer, win/loss detection, and best times. |
| Settings | Six working sections covering system preferences, personalization, app management, storage/backup, accessibility, and capability information. |
| Task Manager | Actual Aster window instances, end-task with unsaved-change checks, renderer statistics, available browser heap information, and storage information. It cannot manage host-OS processes. |
| App Center | Built-in app catalog, launch, desktop shortcuts, HTML app installation, and custom-launcher removal. No external store or paid app downloads. |
| Win32 Lab | Run original 7-Zip 26.03 and TinyCC 0.9.27 Windows EXEs offline, compile and launch C programs, pass arguments/import private files, inspect imports and CPU metrics, draw GDI primitives with WebGPU, operate EDIT/BUTTON controls, and persist/download a per-executable private C: drive. Explicit limited compatibility. |
| Welcome | Desktop orientation, app shortcuts, customization entry points, and clear operating boundaries. |

## Shared files and local folders

The virtual workspace uses IndexedDB with `files` and `meta` stores. Files may contain text or binary `Blob` content. Standard folders are `/Desktop`, `/Documents`, `/Downloads`, `/Pictures`, `/Music`, `/Videos`, and `/Projects`. Virtual deletion moves files into `/.Trash` with their original path; restore recovers nested contents and avoids name collisions. Virtual subtree moves/copies are performed in a single file-store transaction.

File Explorer's **Local folders** action calls the browser's directory picker from an explicit user gesture. Only the directory the user selects is mounted, beneath `/Local/<folder name>`. Read/write permissions are browser-controlled. Mount handles are session-only; reconnect after reloading. Aster does not request access to your entire disk. Local deletion is permanent and requires a confirmation; it does not use your actual OS recycle bin. Cross-volume/native moves can involve multiple operations and are not atomic.

Browser-local storage is not a backup. Data can be lost when site data is cleared, private browsing ends, the browser evicts storage, or the profile is removed. Aster requests persistent-storage status only through the Storage settings action; approval remains the browser's decision. If IndexedDB is unavailable, the app falls back to memory and explicitly warns that the session is temporary.

## Backup and restore

Use **Settings → Storage → Export backup** regularly. The JSON backup includes virtual file contents, task/event records, custom HTML app launchers, and selected metadata. Binary files are encoded as base64. Connected native folders are **never included or modified** by backup restoration.

Restore validates the format, normalized paths, parent directories, content size, and launcher records, then asks before merging. Matching virtual files and task/event collections are replaced. Appearance settings are deliberately left unchanged; exported appearance/world-clock metadata is informational in this version. Close and reopen Tasks and Calendar after restoring an open workspace.

Backup generation supports up to **100 MiB of virtual file data**. Import is limited to a **150 MiB JSON file**, **100 MiB expanded file content**, and **30,000 file/folder records**. Download large media separately. Those limits are intentional safeguards, not a claim that very large folders have been performance-tuned.

## Graphics architecture

Aster uses a **hybrid renderer**. WebGPU renders the procedural desktop wallpaper and rounded window surfaces/shadows; HTML/CSS renders controls and text. Paint uses Canvas 2D for pixel editing, and the browser's media engine decodes audio/video. This is not an all-canvas rasterization of every UI element. Keeping native text controls provides browser selection, input methods, focus, and editing behavior without trying to reimplement them in shaders.

`src/renderer.js` contains two actual WGSL pipelines. A single `GPUDevice` is shared across the wallpaper and per-window GPU canvas contexts. Separate window surfaces maintain the correct stacking order against HTML contents. The renderer handles adapter failure and device loss by switching to an original Canvas 2D wallpaper and CSS window surfaces. App functionality does not depend on having WebGPU.

Graphics options constrain device pixel ratio and texture dimensions. Ambient wallpaper animation is capped at approximately 30 submissions per second; interaction can invalidate the next frame independently. With animation disabled, drawing occurs on invalidation rather than continuously. Native window movement uses `translate3d` and pointer updates are coalesced through `requestAnimationFrame`. Painting avoids per-pixel queue allocations in flood fill; audio analysis reuses its sample buffer and stops visualizer work when paused.

Task Manager reports **frame submissions per second and CPU command-encoding/submission time**. These are not display refresh measurements, GPU execution time, host CPU utilization, or per-app process CPU statistics. No physical-GPU speed claim or benchmark is made.

WebGPU requires a supported browser, a permitted adapter, and a secure context. Localhost is a practical development origin; HTTPS is required for ordinary remote hosting. Check **Settings → About Aster** for the actual renderer and browser capabilities, rather than assuming WebGPU is active.

## Running HTML apps

Open App Center and choose the HTML import action, or create a project in Code Studio and use **Add to Start**. Installed apps live as ordinary HTML files in the virtual workspace; their launcher metadata is stored separately. Removing a launcher leaves its source file intact.

Frames allow scripts, forms, modal dialogs, and downloads, but deliberately omit `allow-same-origin`. Imported apps cannot directly access `parent.Aster`, the parent DOM, or the workspace database. They are not granted local directory handles. Code Studio's console bridge validates both the frame source and a per-preview token.

This is not a malware-analysis sandbox or a CPU/memory quota system. Imported apps can request network resources and execute arbitrary JavaScript inside their frame; run sources you trust. Host system commands and unrestricted native Windows execution are unsupported. Win32 Lab is a separate, limited PE32 compatibility runtime with a bounded worker and a private drive; see docs/browser-win32.md.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| Ctrl+Space | Start/search |
| Ctrl+Alt+T / Ctrl+Alt+N | Terminal / Notepad |
| Ctrl+Alt+D | Show/restore desktop |
| Ctrl+Alt+Left / Right | Snap focused window |
| Ctrl+Alt+Up / Down | Maximize / minimize |
| Ctrl+Alt+Tab | Task View |
| Ctrl+Alt+L | Visual lock |
| Escape | Dismiss flyouts, menus, or dialogs |
| Ctrl+S | Save in Notepad, Paint, and Code Studio |
| Ctrl+F | Find in Notepad |
| Ctrl+Enter | Run Code Studio preview |
| F2 / Delete | Rename / delete in File Explorer |

Some keys may be reserved by the real browser or operating system. The visual lock is explicitly **not authentication**. Alt+F4 is handled only when delivered to the page; your host environment may consume it first.

## Source layout

```text
index.html                  Desktop layers and script loading
Aster.html                  Generated single-file edition
src/core.js                 Helpers, app registry, IndexedDB, file system, seed data
src/renderer.js             WebGPU shaders, surfaces, scheduling, Canvas fallback
src/windows.js              Window lifecycle, snapping, dialogs, notifications
src/apps-files.js           Explorer, Notepad, Orbit, Terminal
src/apps-creative.js        Paint, Photos, Media, Code Studio, Snips
src/apps-tools.js           Calculator, Calendar, Clock, Tasks, Mines
src/apps-system.js          Settings, backups, Task Manager, App Center, Welcome
src/shell.js                Start, taskbar, desktop, flyouts, timers, startup
src/styles.css              Original responsive light/dark design
sw.js                       Same-origin offline asset cache
manifest.webmanifest        Installable-web-app metadata
assets/                     Original SVG/PNG application icons
start.py                    Optional loopback-only server
build.py                    Standalone HTML builder
tests/smoke.py              Reproducible integration checks
TESTING.md                  Results, limitations, manual acceptance checks
LICENSE                     MIT license and branding notice
```

Edit source files directly and reload. Rebuild the single-file version with:

```sh
python3 build.py
```

No transpilation is required. The optional server and bundler use only Python's standard library. Tests alone use Playwright. No browser binary or testing dependency is shipped in this archive.

The multi-file edition includes a service worker for caching its own static assets after a successful first load. Service-worker installation/offline operation was not verified in the restricted build environment. The standalone edition does not register a service worker and has no external app assets.

## Validation and known boundaries

The delivered source passed **43 automated Chromium checks** plus a separate standalone-HTML boot check. They exercised actual controls, JavaScript, drawing, audio playback, virtual files, and sandbox behavior. See `TESTING.md` and `tests/results.json` for the exact scope.

The build container's managed browser blocks ordinary navigation. Tests therefore loaded source into an isolated `about:blank` document. **The verified runtime was Canvas 2D with memory storage. WebGPU shader compilation/device rendering, IndexedDB persistence across reloads, service-worker offline startup, real directory permission dialogs, and real screen-capture permission dialogs were not verified here.** Their source implementations are included, but must be checked on a supported browser before relying on those paths. No claim of full Windows parity, production hardening, cross-browser certification, or hardware rendering performance is made.

Unsaved text/source drafts participate in session metadata; unsaved Paint pixels are not automatically restored after a reload. Save drawings before restarting. Native folder handles are not restored. Browser-embedded websites can refuse framing, and browser media support determines available codecs. Calendar/timer alerts require the tab to remain open and may be delayed by background throttling.

## Primary API references

- WebGPU: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- Secure contexts: https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts
- Directory picker: https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Storage quotas/eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- Frame sandboxing: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- Screen capture: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia

Aster's branding, wallpaper, icons, sample artwork, and sample audio are original. No Microsoft logos, proprietary OS assets, or bundled font files are included. Aster is not affiliated with Microsoft.
