# Adaptive artwork and desktop refinement verification

Run from the repository root with Node and Python Playwright installed:

```sh
python build.py
node --test tests/desktop-refinement/models.cjs
python -m playwright install --with-deps chromium firefox
python tests/desktop-refinement/browser.py
python tests/desktop-refinement/browser.py --standalone --output tests/desktop-refinement/artifacts/standalone
python tests/desktop-refinement/browser.py --engine firefox --output tests/desktop-refinement/artifacts/firefox
```

The permanent `desktop-refinement.yml` workflow also rebuilds the standalone and
checks reproducibility, saves exact source/checkouts and retains actual screenshots.

Sixteen pure model checks cover all icon families, 29 unique illustrations per
family, no external/executable SVG, input/size/LRU bounds, migration/portable theme
settings, virtual path validation, safe preview kinds, pin reorder rules, and
independent Show Desktop snapshots.

Nineteen browser scenarios exercise original artwork across all twelve presets,
live icon-family Settings without lost editor state, three icon contact sheets,
six theme captures, seven real app windows beyond the former four-card cutoff,
keyboard card activation, unsaved-close cancellation, pointer and keyboard pin
reorder, queued pin writes, separate virtual desktops, Explorer Space/context
preview, inert HTML, actual raster and PCM-WAV decoding, media limits/failures,
Unicode file association dispatch, late-read cancellation, owner disposal, narrow
390px geometry and alternate/forced-color appearances. No app is substituted.
A controlled delayed-read scenario wraps the real filesystem read solely to delay
its completion and exercise cleanup; it does not substitute file contents.

HTTP and standalone add a full-page IndexedDB reload check for icon selection,
pin order and file bytes, giving **20 scenarios**. Standalone additionally reloads
with networking disabled and previews saved Unicode, giving **21 scenarios**.
Firefox runs the same 20 HTTP scenarios using its own engine and the existing
CSS-blur fallback. Successful runs require zero uncaught page errors.

`--inject` is only for managed local environments that prevent URL navigation. It
inserts the identical standalone HTML into a page, uses memory storage, skips the
durable-reload/offline checks, and explicitly labels that evidence. It is not a
replacement for hosted HTTP/IndexedDB or standalone verification.

The media tests verify decoding/duration and resource cleanup, not physical audio
output. No dedicated video encoding/DRM test is added in this suite. Window cards
are actual metadata, not fake screenshots. Existing independent optical/WebGPU
and Win32 workflows remain responsible for their shader/pixel/native comparisons;
this suite is not a GPU benchmark. Native Windows/macOS/GNOME pixel parity and all
features of the 74 embedded websites are not claims made by these tests.
