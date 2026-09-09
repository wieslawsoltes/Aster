# Reproduce UI regression verification

From the repository root:

```sh
python build.py
node --test tests/ui-refinement/models.cjs
python -m pip install playwright
python -m playwright install --with-deps chromium firefox
python tests/ui-refinement/browser.py
python tests/ui-refinement/browser.py --standalone --output tests/ui-refinement/artifacts/standalone
python tests/ui-refinement/browser.py --engine firefox --output tests/ui-refinement/artifacts/firefox
```

`--browser /path/to/chromium` selects an existing browser. `--inject` is only a
local diagnostic when the managed browser blocks navigation: it does NOT verify
IndexedDB/reload persistence or offline file navigation. Reports explicitly label
that memory-only mode. The usual HTTP test starts its own local server.

No force clicks or substitute caption handlers are used. The test artifact keeps
results, actual screenshots, exact source and standalone checksums. The inherited
visual-materials workflow separately requires WebGPU and controlled optical pixel
comparison. Firefox uses its supported material fallback, not an assertion of
SVG backdrop-refraction equivalence.
