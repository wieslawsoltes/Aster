# Your web apps in Aster

Open **Start → Your web apps → a category → an app**. All 110 reviewed external
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
Further explicit batches include the workspace/design apps and the 26 additions
listed below.
The reviewed inventory now contains 111 repositories and the collection 110 apps.
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
| Design & Graphics | 14 |
| 3D & Animation | 15 |
| CAD & Manufacturing | 15 |
| Science & Simulation | 11 |
| Process & Automation | 11 |
| Buildings & Maps | 6 |
| Office & Productivity | 17 |
| Development & Data | 11 |
| Audio & Video | 7 |
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

## Workspace and design additions

| App | Category | GitHub Pages edition |
| --- | --- | --- |
| Velsign | Office & Productivity | Browser-local agreement preparation and signing demos |
| Folio | Office & Productivity | Documents, knowledge pages and project databases |
| Mireva Studio | Design & Graphics | Interface design, vectors and multi-screen prototypes |
| Orivane | Office & Productivity | Whiteboards, notes, diagrams and presentations |
| Velora Design Studio | Design & Graphics | Presentations, social graphics and multipage designs |

These are explicit additions, not a change to the original date-window audit.
The previous VoltWeave, Stratum Intelligence, Veldra, Avolith and Aureon entries
remain present. The inventory retains the actual HTTPS response, document title,
response hash and inspected README hash for each new entry.

All five launch their public Pages edition and store local work in their own
browser storage. Server-backed accounts, cross-device collaboration and connected
AI require each project's separately deployed backend; Aster does not supply or
silently connect those services. Velsign's local signing demo does not establish
verified identities or certified signatures. Export important work from the app
before clearing its site data. These additions receive no camera, microphone,
screen-capture or geolocation delegation.

## September 22 creative, engineering and productivity additions

The owner explicitly requested these 26 repositories on September 22, 2026.
Their public repository metadata, README blobs and live HTML responses were
inspected separately from the original date-window audit. The inventory retains
actual response hashes, byte counts, document titles, headers and per-entry audit
timestamps. No discovery request or remote application load is made at Aster boot.

| App | Category | Repository |
| --- | --- | --- |
| Veyra Compositing Studio | Audio & Video | `Veyra` |
| ChromaForge Material Studio | 3D & Animation | `ChromaForgeMaterialStudio` |
| Veyra Video Studio | Audio & Video | `VeyraStudio` |
| Tessera Studio | 3D & Animation | `TesseraStudio` |
| Lumera Studio | 3D & Animation | `LumeraStudio` |
| RelayForge Electrical | CAD & Manufacturing | `RelayForgeElectrical` |
| Astrum Studio | 3D & Animation | `AstrumStudio` |
| Vellum Vector Studio | Design & Graphics | `VectorStudio` |
| Stratum FX | 3D & Animation | `StratumFX` |
| CinderLab | 3D & Animation | `CinderLab` |
| TerraWeave | Buildings & Maps | `TerraWeave` |
| ImplicitForge | CAD & Manufacturing | `ImplicitForge` |
| Patina Studio | 3D & Animation | `PatinaStudio` |
| PigmentLab | Design & Graphics | `PigmentLab` |
| Orbitarium | Science & Simulation | `Orbitarium` |
| Duo Studio | Development & Data | `DuoStudio` |
| Aperture CAD | CAD & Manufacturing | `ApertureCAD` |
| DrawingWeb Studio | Design & Graphics | `DrawingWeb` |
| Counterform Studio | Design & Graphics | `CounterformStudio` |
| Revector Studio | CAD & Manufacturing | `RevectorStudio` |
| Avenor Mail | Office & Productivity | `AvenorMail` |
| Auralis Studio | Audio & Video | `Auralis` |
| Claude Code Design | Development & Data | `ClaudeCodeDesign` |
| RichTextWeb Document Studio | Office & Productivity | `RichTextWeb` |
| GridWeb Workbook Studio | Office & Productivity | `GridWeb` |
| Xamora Studio | Development & Data | `XamoraStudio` |

ChromaForge opens `/ChromaForgeMaterialStudio/studio/` and Stratum FX opens
`/StratumFX/app/`, bypassing their marketing homepages. These are exact reviewed
exceptions, shared by the desktop launcher and Aster Browser; arbitrary project
subpaths, queries, credentials and other origins are not promoted to trusted apps.
Auralis starts at its reviewed root, which redirects to its studio. The two Veyra
repositories have distinct launcher names: **Veyra Compositing Studio** and
**Veyra Video Studio**. RichTextWeb, GridWeb and DrawingWeb open their published
editor samples, not their package registries.

Auralis receives **microphone-only** recording delegation, still subject to browser
permission. None of the other 25 additions receives camera, microphone, screen
capture or geolocation delegation. No existing app's permissions are changed.
Aster does not connect accounts, send mail, provision collaboration servers,
install native plug-ins, supply AI keys or grant its file/clipboard broker consent
on an app's behalf. In particular, Avenor's on-device mode is not internet mail;
connected mail needs its separately configured backend. Native folders, external
services and graphics capabilities remain subject to each app and browser.

These apps also appear in **App Center → Discover** with the existing Start/taskbar
pinning, desktop shortcuts and window actions. As with the earlier entries,
remote storage is not automatically included in Aster backups. Export important
work inside the individual app. The single-file Aster build embeds these catalog
entries and host code, not the remote applications or their backends.

## Hosting, permissions and trust

These are independently hosted applications, not copies bundled with Aster and
not Windows EXEs. The existing browser-only Win32 runtime remains separate.
Loading an app needs its live site or that app's own offline cache. The standalone
Aster HTML embeds the catalog and window host, **not all 110 application payloads**.

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
reload, offline messaging, mobile layout, and standalone hosting/cleanup. It also searches and launches all 26 September 22 additions and checks their
exact entry points and microphone-only scope. It uses
**explicit inert page fixtures** to isolate host behavior. `--inject` is a local
fallback for managed browsers that block HTTP; it does not verify HTTP storage.

`python tests/web-apps/browser.py --live --gpu --headed` is separate and uses
**all real deployed sites without fixtures**. It records each final URL, document
title, DOM/control/canvas counts and load time, and captures representative app
windows. It verifies iframe startup and usable page content, not every feature
of every external application or physical-GPU performance. The existing desktop
and Win32 suites continue to run on the integration PR.
