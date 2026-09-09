# Your web apps in Aster

Open **Start → Your web apps → a category → an app**. All 74 reviewed external
projects have an entry. Search by app name, repository name, purpose or category
from the normal Start search field. Category submenus have Back navigation,
keyboard controls and a single-column touch layout on narrow screens.

Each entry launches the real deployed site in an ordinary Aster desktop window:
its optional titlebar and compact window menu support dragging, minimizing, maximizing, snapping, resizing,
virtual desktops and taskbar activation. The titlebar, address toolbar and category footer are hidden by default. Enable
either titlebar or toolbar in **Settings → Apps → Web apps**. The small upper-right
window controls and taskbar menu stay available. The optional toolbar contains a
read-only app address, **Reload app**, **Open in Aster Browser**, **Open in browser**,
and **Source**; these actions are also in the window menu. Right-click a Start
app to pin it to the taskbar or create a desktop shortcut. Multiple instances
are allowed; closing a window asks you to save first because the host cannot
reliably detect an embedded app's dirty documents.

## Scope and provenance

The audit includes public, non-fork repositories owned by `wieslawsoltes` created
from **Sunday 2026-09-06 00:00 through Tuesday 2026-09-08**, Europe/Warsaw time.
The half-open UTC interval is `2026-09-05T22:00:00Z` to `2026-09-08T22:00:00Z`.
This correctly includes Vellum, which was created just after midnight locally
but still on September 5 in UTC. It is a reviewed snapshot, not a claim that
future repositories will be discovered automatically.

The original audit found 68 candidate repositories and included 67 external apps.
Veyra Workspace and Asterion EDA were subsequently added at the owner's request,
followed by TwinForge, Branchglass, Notepad XP, Formalyth and Jailbreak.
The reviewed inventory now contains 75 repositories and the collection 74 apps.
Their individual audit timestamps and live response evidence are retained. **Aster
itself is intentionally excluded**, rather than recursively embedding the host
desktop. No other candidate was dropped. Every app's deployed entry point returned
HTTP 200 with HTML during the audit. Readmes and deployed pages were inspected
for categorization, rather than guessing from repository names alone.

`src/web-app-catalog.js` is the reviewed runtime catalog. The full candidate
inventory, creation timestamps, readme hashes, deployed titles, response hashes
and frame-policy headers are in `docs/web-app-inventory.json`. The source audit is
retained in GitHub Actions run `34197096920`, artifact `web-app-project-inventory`.
The catalog does not contact GitHub or preload any remote site when Aster starts.

## Categories

| Submenu | Apps |
| --- | ---: |
| Design & Graphics | 8 |
| 3D & Animation | 7 |
| CAD & Manufacturing | 9 |
| Science & Simulation | 9 |
| Process & Automation | 10 |
| Buildings & Maps | 5 |
| Office & Productivity | 11 |
| Development & Data | 8 |
| Audio & Video | 4 |
| Games | 3 |

## Requested additions

- **Veyra Workspace**: Office & Productivity. Local collaboration workspace,
  notes, meetings and whiteboard. Camera, microphone and screen sharing are
  delegated to its iframe but still require browser permission. Static Pages
  hosting does not supply Veyra's optional live collaboration server.
- **Asterion EDA**: CAD & Manufacturing. Electronic design automation workbench.
  Its frame does not receive camera, microphone or screen-capture delegation.

- **TwinForge**: Office & Productivity. Dual-pane file management and archives.
- **Notepad XP** (`NotepadXP`): Office & Productivity. Classic plain-text editor.
- **Branchglass**: Development & Data. Git history, branches, staging and diffs.
  Its Pages application starts in sandbox mode; the optional native Git backend
  is not installed, connected or supplied by Aster.
- **Jailbreak**: Development & Data. C#, XAML and MSIL compiler toolchain and IDE;
  it is not a game or a device-jailbreaking tool.
- **Formalyth**: CAD & Manufacturing. Design and manufacturing workbench.

None of these five additions receives camera, microphone, screen-capture or
geolocation delegation. Native folder dialogs and other host-reserved features
may require **Open in browser**; Aster does not bypass browser restrictions.

All entries are searchable by their app titles and repository names. They use
Aster's existing window controls, taskbar entries, Reload, Source and Open in
browser actions. Launching an app does not preload the other sites.

## Hosting, permissions and trust

These are independently hosted applications, not copies bundled with Aster and
not Windows EXEs. The existing browser-only Win32 runtime remains separate.
Loading an app needs its live site or that app's own offline cache. The standalone
Aster HTML embeds the catalog and window host, **not all 74 application payloads**.

All catalog entries are fixed HTTPS URLs on `wieslawsoltes.github.io`. The host
rejects arbitrary schemes, origins, credentials, query strings and altered launch
paths. Links opened in a separate tab use `noopener noreferrer`. Executables,
files, passwords and Aster backups are not uploaded by the launcher.

The frames intentionally allow scripts and their normal origin so the apps can
use storage, Workers and WebGPU. These are trusted user-owned projects. **Projects
on the same GitHub Pages origin share a browser security origin: the iframe
sandbox is not an isolation boundary between them.** A genuinely untrusted app
needs a separate origin and a different, restricted integration design.

Clipboard, fullscreen and media autoplay permissions are delegated to the frame,
not automatically granted by Aster. Recording and collaboration/calling apps additionally receive camera,
microphone and screen-capture delegation; mapping apps may request geolocation.
The browser still decides whether to prompt or allow each operation. Local folder
pickers, sign-in, popups, WebGPU and capture can depend on the browser and embedding
context. **Open in browser** is always available for such features, or when a
site later disallows framing. This host is window chrome, not an installation of
Google Chrome or a way to bypass browser permissions.

Closing/reloading a window removes its browsing context, stopping its scripts,
Workers and graphics contexts. Minimizing does not reload or discard documents.
The iframe may manage its own storage/session independently of Aster. Aster's
normal backup does not collect the remote projects' private storage.

## Verification

`node --test tests/web-apps/catalog.cjs` checks exact inventory coverage, local-date
boundaries, category coverage, URL allowlisting, immutable registration, lazy
loading and standalone/service-worker integration.

`python tests/web-apps/browser.py` checks category navigation, search, input,
window chrome, minimize/maximize/restore, resizing, snapping, iframe/taskbar focus,
reload, offline messaging, mobile layout, and standalone hosting/cleanup. It uses
**explicit inert page fixtures** to isolate host behavior. `--inject` is a local
fallback for managed browsers that block HTTP; it does not verify HTTP storage.

`python tests/web-apps/browser.py --live --gpu --headed` is separate and uses
**all real deployed sites without fixtures**. It records each final URL, document
title, DOM/control/canvas counts and load time, and captures representative app
windows. It verifies iframe startup and usable page content, not every feature
of every external application or physical-GPU performance. The existing desktop
and Win32 suites continue to run on the integration PR.
