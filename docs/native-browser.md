# Orbit with a real browser engine — Aster Desktop 2.5

## Which edition fixes websites **inside** Aster?

**Aster Desktop**, the native application, supplies Chromium. Its ordinary website
tabs are real, isolated `WebContentsView` documents displayed in Orbit's content
area. They are not iframes, external browser windows, screenshot simulations, an
HTML-rewriting proxy, or a service hosted by someone else. Google and other sites
can be loaded as top-level documents without removing their framing headers.

**GitHub Pages and `Aster.html` opened in Chrome/Safari/Firefox cannot create native
Chromium views.** They still support compatible iframe apps and external tabs.
Selecting Native Chromium there explains the required desktop runtime. The known
Google search/login routes no longer show a broken iframe on an explicit Embedded
webview request. This guidance is not a universal framing-policy detector.

A PWA installation does not change iframe security. No promise is made that a
JavaScript setting can bypass `frame-ancestors` or `X-Frame-Options` in a normal
browser. The native process is the architectural difference.

## Start from source

With Node.js 22.12 or later installed, from this repository:

```sh
cd desktop
npm ci
npm start
```

Open Orbit from Aster's taskbar and enter `https://www.google.pl/`. In this edition,
**Automatic** uses native Chromium for ordinary sites. **In Aster (Chromium)** and
**Native Chromium (desktop)** explicitly select it. A saved **Browser tab** site
preference still opens externally: reset that site override or choose Native
Chromium. Local HTML and reviewed catalog apps in Automatic mode keep the existing
sandboxed iframe and Aster Files integration.

The first `npm ci` downloads the pinned Electron runtime. After installation,
`npm start` needs no companion server or browser extension. Website access still
requires your network connection.

## Downloadable builds

The **Native Orbit desktop** GitHub Actions workflow packages Linux x64, Windows
x64, and macOS x64/arm64 applications. Download the artifact matching your system
from a successful run, extract it, and launch **Aster Desktop** (`aster-desktop`
on Linux/Windows). Each package has `ASTER-BUILD.json` with the source commit,
Electron version and standalone SHA-256.

These are **unsigned development builds**, not signed/notarized installers.
Operating-system trust checks may prevent launch. Do not disable OS security or
Chromium's sandbox to launch them. For Linux, the OS must support Chromium's
sandbox (user namespaces or an appropriately installed setuid sandbox helper).
The CI runner installs the supplied helper with its standard root ownership and
setuid mode; the application never uses `--no-sandbox`.

## What works in native Orbit

Pages run JavaScript, links and ordinary forms with their real HTTP(S) origins.
The engine reports the actual title, redirects and navigation history to Orbit.
Back, forward, reload and stop control that engine, not a list of iframe requests.
Tabs retain their page state while switching. Native keyboard input, text
selection, copy/cut/paste, scrolling and the browser's file-upload chooser work
inside the view. Ctrl/Command+L returns to Orbit's address field; T/W open/close
Orbit tabs, and F opens the native page-find field. The native toolbar also
provides zoom through Orbit's menu, mute and print. Downloads use a native Save As
prompt and are never automatically opened.

Ordinary `target=_blank` GET links open new Orbit tabs. **POST-to-new-window and
opener-dependent popups, including some OAuth flows, are not supported** in this
initial native adapter. Some providers reject embedded desktop runtimes for
sign-in; DRM, extensions, passkeys and every website feature are not certified.
Camera, microphone, geolocation, notifications and device permissions are denied
by this initial native policy. Browser-native selection/paste does not require
permission to programmatically read the clipboard.

Only the unobscured foreground native view is shown. Background tabs keep running,
but their slot shows a resume placeholder. Aster dialogs, menus, other windows,
visual lock, minimization and movement temporarily hide the native surface so it
cannot cover the desktop UI. Side-by-side simultaneous visible native surfaces
and translucent DOM compositing over a live native page are not implemented.

## Storage and privacy

Aster's files/preferences use a separate, durable application profile. The native
website session uses its own **in-memory** partition. Website cookies, cache and
storage are not imported from Chrome/Safari and do not survive exiting Aster
Desktop. Native pages share that website session, like tabs in one private browser
window. Aster's opt-in URL history remains separate and can contain query strings.

**Orbit settings → Clear native website session** closes those pages and removes
website data after confirmation; it does not erase Aster documents. Native
website file pickers and downloads operate on the real host filesystem after your
selection; they are not the virtual Files application's pickers. The iframe-only
Files/Clipboard SDK broker is not silently injected into arbitrary native pages.

Aster's visual lock is not operating-system authentication. Use the real OS lock
for a security boundary. No remote-control listener, clipboard polling or cloud
browser service is created.

## Security boundary

The local shell is served at `aster-app://desktop/index.html` from an allowlisted
runtime directory. A context-isolated, sandboxed preload exposes a narrow browser
API only to that exact main frame. Every IPC request checks the sender WebContents
and main-frame identity in the main process. Guests have no preload, Node.js,
Electron API, desktop bridge or access to the application protocol. Their session
blocks non-web resource schemes and top-level non-HTTP(S) navigation/redirects.

Website CSP, CORS, X-Frame-Options, TLS verification and Chromium sandboxing remain
enabled. No security headers are deleted, no certificate exceptions are installed,
and no arbitrary evaluate/file/shell APIs are exposed to the renderer. Native
surfaces are clamped to the content window and hidden if the shell stops sending
layout heartbeats. The browser engine is pinned, but must be kept updated; this is
not a claim of a security audit or production certification.

## Verification and primary references

`node --test tests/native-browser/models.cjs` tests routing, URL/path/bounds
validation and guest preferences. `cd desktop && npm test` launches the actual
Electron runtime, tests unchanged CSP/XFO fixture responses in both iframe and
native contexts, actual input/clipboard shortcuts, redirects/history, retained
tabs, native view lifecycle, shell overlay visibility and IPC isolation.
`ASTER_LIVE=1 npm test` additionally loads Google's actual homepage and saves both
its rendered page and an X11 screenshot of it inside Aster. Controlled fixtures,
actual external loading and unsupported capabilities are distinguished in reports.

- Electron WebContentsView: https://www.electronjs.org/docs/latest/api/web-contents-view
- Electron security checklist: https://www.electronjs.org/docs/latest/tutorial/security
- Electron webContents navigation: https://www.electronjs.org/docs/latest/api/web-contents
- CSP framing policy: https://www.w3.org/TR/CSP/#directive-frame-ancestors
