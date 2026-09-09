# Compact web apps and Orbit website navigation — Aster 1.9.1

## App windows

All 74 reviewed catalog apps and installed custom HTML apps now hide the **Aster
host title bar by default**. Catalog app address/navigation toolbars and category
footers also default to hidden. A site's own toolbars and controls are untouched.
The host never injects CSS into an application to hide its internal interface.

**Settings → Apps → Web apps**, or search **Web apps** in Start, contains two
independent preferences: **Show web app title bars** and **Show web app address
toolbar**. These settings persist in the existing settings record, apply to open
and future windows, and never reload the app frame. Built-in apps (including
Orbit) retain normal title bars. A theme switch does not reset either preference.

The small upper-right control cluster provides a draggable handle (double-click
to maximize/restore; arrow keys move by ten pixels, Shift+arrow by one) and a
**Window controls** menu. That menu retains restore/minimize/maximize, desktop
transfer, close confirmation, Reload, Source, external browser and **Open in Aster
Browser**. Alt+Space opens it when delivered to the host or same-origin app.
Cross-origin pages cannot forward arbitrary keyboard shortcuts, so pointer and
Taskbar → right-click app → **Window controls · app name** remain available.
Resize handles, Task View, snapping and taskbar activation work normally. On touch,
the control cluster stays visible and has larger targets.

## Orbit

**Open in Aster Browser** is available from a web window's menu, the optional
address toolbar, taskbar Jump List, and the categorized Start entry's context
menu. It opens a separate Orbit window, preserving the original app's running
page. Orbit's home page also has **Your web apps**, which opens catalog sites
in the current Orbit tab rather than creating another app wrapper.

Orbit now honors explicit `OS.openApp('browser', {url})` launches. Enter HTTP/HTTPS
addresses, bare domain names (default HTTPS), or search terms in its address bar.
Search navigates to an HTTPS search-provider URL **inside Orbit**, not automatically
to a native tab. Back/Forward manage addresses requested through Orbit's controls;
Reload replaces the current frame; tabs retain their own navigation lists. There
are at most 20 tabs and 100 address-history entries per tab. Restoring a session
keeps the saved tab set and active tab instead of discarding it for the original
launch URL. Closed or superseded local-file requests cannot repopulate a tab.

## Browser boundaries and security

- Only validated HTTP/HTTPS and supported `aster://` destinations are accepted.
  Script/data/blob/file/unknown schemes, control characters, embedded credentials
  and oversized addresses are rejected. This is not a proxy or a native browser
  engine, and it does not read the host filesystem.
- Unknown remote sites and local HTML use an **opaque-origin sandbox**. They cannot
  access `parent.Aster`. Storage, sign-in and other APIs may be restricted.
- The exact 74 reviewed catalog roots use their existing trusted-app policy,
  including same-origin permission needed by IndexedDB, Workers and WebGPU.
  Camera/microphone/display capture and geolocation remain delegated only to the
  same specific catalog apps as before. Altered paths, query URLs and Aster itself
  are not promoted into that trusted policy. Projects sharing a GitHub Pages
  origin are **not mutually isolated** by the trusted-app iframe policy.
- Websites can forbid framing with CSP `frame-ancestors` or `X-Frame-Options`.
  No response headers are removed and no permission rules are bypassed. Orbit
  keeps a visible explanation and explicit **Open in browser ↗** fallback.
- A frame `load` event does not prove site success. Orbit does not infer success
  or claim to detect every embedding denial. Its address shows the last address
  entered through Orbit; cross-origin in-page redirects/history cannot be read.
- External tabs only open after explicit user action (including links/popups
  initiated by a guest site); external Aster actions use `noopener,noreferrer`.

Primary browser references, reviewed for this change:
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

## Verification

`node --test tests/web-chrome/models.cjs` validates inputs, local paths, exact
catalog trust, media scopes, defaults and packaged assets. `python
tests/web-chrome/browser.py` exercises real Aster controls against clearly labeled
controlled websites, including a real HTTP CSP-denial endpoint. Standalone repeats
the tests with a full file-URL reload and offline startup. The separate `--live`
run launches unchanged deployed Forma and NotepadXP, both compact and in Orbit,
with no response fixtures. Live results establish document startup, not all app
features. The inherited 74-site launcher regression remains enabled; its chrome
scenario now explicitly enables the optional title/toolbar before checking the
legacy controls and also asserts the new default is hidden.

`--inject` exists only for a policy-restricted local test browser. It injects the
standalone desktop and labeled iframe documents: that mode is **memory-only**, not
proof of network navigation, IndexedDB persistence or server frame-policy handling.
Hosted normal-HTTP and standalone checks are required before merging.
