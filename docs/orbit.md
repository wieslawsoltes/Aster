# Orbit Browser and reusable webviews (Aster 2.3)

> **Native desktop edition:** Aster 2.5 adds real Chromium views inside Orbit.
> See [native browser setup](native-browser.md). The iframe/external-tab behavior
> described below remains the behavior of the browser-hosted edition. Selecting
> Native Chromium requires the desktop runtime; a PWA or standalone HTML is not
> that runtime.


## Opening websites

Automatic mode opens ordinary HTTP(S) addresses and searches in a **real browser
 tab**, not a nested iframe. Address-bar Enter and the home search Go action use
the actual user gesture. OS/API launches and restored addresses instead show a
handoff page with **Open in browser** and **Open browser window** controls; they
do not surprise users with popups. A popup request is not proof that a page loaded:
`noopener` intentionally hides the returned window reference, and browser policy
can still suppress the new tab. The ordinary anchor remains available.

Choose **Embedded webview** for a website that permits framing. Exact reviewed
catalog roots embed automatically and retain the existing per-app policy. A saved
App Center web link is still opaque even when its URL matches a catalog app.
**Page not visible?** offers a handoff instead of interpreting iframe load as
success. The load event and a timeout cannot reliably detect cross-origin frame
denials. HTTPS desktops route insecure HTTP embed requests to external tabs.

The screenshot's Google failure was a framing restriction, not something WebGPU
can change. Orbit does not strip response headers, proxy credentials, disable
sandboxing, inject itself into arbitrary sites, or emulate another full browser.
Google, authentication and downloads in external tabs are handled by the user's
real browser. Those tabs cannot be navigated, read or closed by Orbit.

## Browser tools

Tabs retain their actual iframe across tab activation, minimizing and theme
changes. Per-tab requested-address Back/Forward history is bounded to 100 entries;
20 tabs and 10 closed addresses are retained. Reopen restores remote addresses to
a click-to-open handoff, not an automatic network request. In-page navigations
inside noncooperative cross-origin frames are not a complete Orbit history.

The menu has tab/window handoff, per-origin opening preferences, webview windows,
Install website as app, Save website shortcut in Files, Copy address, 50–200% zoom
for embedded pages, reopen and compact navigation controls. Keyboard alternatives
include Ctrl/Cmd+L, T, W, D, H, R and Ctrl/Cmd+Shift+T, and Alt+Left/Right; keys
reserved by the host browser/OS are available only when it delivers them.

Bookmarks support title editing, search, removal and actual JSON import/export.
History recording is off by default; enabling it stores up to 200 requested URLs,
including query strings. Clearing history does not clear another browser's
history. There are at most 200 bookmarks and 100 site-opening overrides.

**Settings → Apps → Orbit Browser**, or `aster://settings` in Orbit, selects the
search provider, history policy, address restoration and confirmation policy.
Session address restoration is off by default and also requires desktop session
restoration. Saved addresses wait for a user action after reload. Guest document
bodies, passwords and file grants are not serialized into tab state.

## Files and App Center

`.asterlink` and conventional `[InternetShortcut]` `.url` files open through
Orbit's Files association. Only validated HTTP(S) URLs are accepted; icon DLLs,
commands and other host metadata in `.url` files are ignored. Shortcut text is
bounded to 64 KiB. Local HTML is read from Aster's virtual filesystem, limited to
5 MiB, and executed in the existing opaque sandbox, not with desktop privileges.

Install website as app pre-fills App Center's existing editable metadata form.
The shared webview handles saved HTTPS apps; there is no second app registry.
App Center metadata editing preserves live documents. Browser bookmarks are
included in desktop backup; browsing history and site policies are deliberately
excluded from that backup and no permissions are restored by bookmark import.

## Host APIs

```js
// Return/resolve a real Aster window. Ordinary URLs wait for user handoff.
const browser = await Aster.openURL('https://www.google.pl/');
await Aster.openURL('https://example.org/', {newWindow: true});

// Explicit embedded single-page window, still subject to browser frame policy.
const window = Aster.openWebview('https://example.org/', {compact: true});
await window.ready;

// Inside a built-in app, with an existing live Aster owner window:
const view = Aster.webviews.create(container, {owner: appWindow, isolated: true});
await view.navigate('https://example.org/', {mode: 'webview'});
const off = view.on('change', state => console.log(state.status));
await view.back();
await view.forward();
await view.reload();
view.setZoom(1.2);
await view.stop();
off();
view.dispose();
```

These are trusted desktop APIs, not globals exposed to sandboxed guests. The
owner must be a registered live window. There is a global 40-webview bound. Owner
closure releases the view, frame, timers, message port, focus hooks, file-broker
attachment and pending leave confirmation. A superseded asynchronous read cannot
attach a document after newer navigation or disposal.

`navigate`, `back`, `forward`, `reload` and `stop` enforce leave confirmation.
`load` is the lower-level host primitive used by Orbit after it has guarded its
own tab navigation; it is not an untrusted guest API. Unknown embedded dirty
state is protected by default. Cooperating pages can report explicit dirty/clean
state. Closing Orbit checks all retained tabs, not only the selected tab.

## Optional guest presentation SDK

Include `sdk/aster-webview.js` in a cooperating page. It has no dependency on the
file SDK and exposes only presentation:

```js
AsterWebview.setDirty(true);   // call when the application has unsaved edits
AsterWebview.setDirty(false);  // call after a successful save
AsterWebview.update();         // after pushState or an application title change
```

The SDK accepts a MessagePort only from its direct parent window. The parent
sends to the exact child window and scopes the channel to its navigation
lifetime. A child may report a bounded title, a boolean dirty state and an HTTP(S)
address on its **requested origin only**. Global messages cannot set host state.
The host accepts at most 30 state reports per second. Reports never grant files,
change iframe sandbox flags, invoke desktop APIs or add navigation history.
Titles/addresses are explicitly labeled page-reported, not browser-certified.

The SDK initially reports clean; applications adopting it must call setDirty on
edits. It does not infer arbitrary editor state. Hash/popstate and title updates
are observed; pushState changes require update. The SDK is optional and normal
websites do not automatically become cooperative.

## Recovery and verification

The previous session retained only the self-contained development HTML, not its
editable test/docs tree. All inline runtime modules were recovered from that
file. Rebuilding them with the existing builder first reproduced the delivered
**6,037,677-byte** HTML byte-for-byte. Tests, this guide, service-worker inventory
and the optional guest SDK were then reconstructed explicitly. No uninspected
previous test claims are counted as fresh evidence.

Continuation checks found and fixed narrow-window toolbar wrapping that left no
content area after changing to short landscape. The navigation now uses a compact
two-row grid and preserves all actions. OS.openURL initializes saved search
preferences before resolving search text. Test evidence is described in
`tests/orbit/README.md` and retained as workflow artifacts.

## Primary specifications

- Content Security Policy, frame-ancestors: https://www.w3.org/TR/CSP/#directive-frame-ancestors
- HTML iframe and sandbox model: https://html.spec.whatwg.org/multipage/iframe-embed-object.html#the-iframe-element
- HTML user activation: https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation
- HTML cross-document messaging: https://html.spec.whatwg.org/multipage/web-messaging.html
