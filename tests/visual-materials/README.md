# Profile and material verification

```
node --test tests/visual-materials/models.cjs
python build.py
python tests/visual-materials/browser.py
python tests/visual-materials/browser.py --standalone --output tests/visual-materials/artifacts/standalone
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/visual-materials/browser.py --gpu --headed --output tests/visual-materials/artifacts/webgpu
```

Python requires Playwright, Pillow and its Chromium installation. Linux GPU tests
require Vulkan/SwiftShader. `--browser PATH` selects an existing Chromium.
`--inject` explicitly exercises memory-only injected HTML when managed navigation
is blocked; it skips full-page storage and offline startup assertions and is not
substituted for hosted HTTP verification.

Fourteen DOM-free checks cover bounded optical math, symmetry, sampling, theme
normalization, portable interchange, static/offline inclusion and bounded GPU
frame submission with preserved dirty state. GPU test waits allow software-adapter
latency, retaining actual completion assertions and failure diagnostics. Browser tests
use real windows/menus/settings with no substituted implementation. Reports retain
page exceptions, screenshots, renderer details and resource counters. The
checkerboard is labeled a test scene, not an external app or native screenshot.
The controlled screenshot comparison isolates refraction by zeroing displacement in the same SVG chain,
not native OS visual parity. The GPU test requires production WebGPU field use
and independently reads the compute output. Windows/macOS/Ubuntu light/dark and
mobile screenshots are retained for review. Physical-GPU speed, Safari/Firefox
rendering and native font metrics are outside this Chromium evidence.

The material readiness gate includes scheduled reconciliation and unresolved visible
surfaces, not just the current compute queue. Tests flush pending resize frames
before awaiting that gate; software-GPU waits allow 60 seconds but preserve all
optical-pixel and production-backend assertions.
