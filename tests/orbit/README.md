# Orbit verification

```sh
node --test tests/orbit/models.cjs
python build.py
python -m pip install playwright
python -m playwright install chromium firefox
python tests/orbit/browser.py
python tests/orbit/browser.py --standalone --output tests/orbit/artifacts/standalone
python tests/orbit/browser.py --engine firefox --output tests/orbit/artifacts/firefox
python tests/orbit/browser.py --live --output tests/orbit/artifacts/live
```

The primary suite operates real Aster windows, tabs, dialogs, virtual file bytes,
SDK ports, native download/file selection and storage. HTTP tests serve controlled
pages from a real local server: `/orbit-fixture/denied` returns actual CSP
`frame-ancestors 'none'` and X-Frame-Options DENY. The same bytes must render when
opened by the real top-level handoff. Tests do not replace a blocked frame with a
mock successful site or remove its headers. The live run opens the unchanged
Google site through the Aster handoff, without route mocks or response rewriting;
it reports consent/challenge content honestly and is not a login guarantee.

Persistence uses a full-page IndexedDB reload, not an in-memory remount. It checks
that restoring addresses triggers no remote contact. A deliberately aborted real
IndexedDB transaction must publish neither a stored nor an in-memory bookmark.
The standalone repeats local HTML execution after networking is disabled.

The local managed Chromium disallows HTTP/file navigation. `--inject --browser
/usr/bin/chromium` is a separately labeled memory-only check, never a substitute
for the hosted HTTP, Firefox and offline gates. Timing tests delay a real source
read, not its bytes. Fixtures explicitly opt out of unknown-page confirmation
except the dedicated dirty/unknown state tests, which use real Cancel/Continue.
No forced clicks, filtered page errors or disabled assertions are used.

The inherited compact-app suite now chooses explicit webview mode for embed
checks and tests top-level search handoff instead of the superseded embedded
search behavior. It retains actual CSP denial, iframe identity, local isolation,
late reads, popup fallback, session reload and live catalog tests. Its session
check opts into the new address-restoration policy. App Center's saved-link test
checks the handoff first, then explicitly chooses webview and asserts the original
opaque policy. File SDK conformance explicitly requests a webview for its existing
cooperative fixture. These are intended route migrations, not removed coverage.

The workflow retains reports, real screenshots, exact tracked source and
standalone digest, and uses an independent Firefox engine. GPU/native/desktop
checks remain in inherited workflows; Orbit tests do not constitute physical GPU
benchmarks, native-browser parity or exhaustive external-site certification.
