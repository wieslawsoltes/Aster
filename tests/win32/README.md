# Browser-only Win32 verification

The executable runtime is `src/win32/`. Tests never provide an executable server,
Wine installation or native companion to the browser. Development dependencies
are installed only on the test runner.

## Suites

```sh
node tests/win32/unit.cjs
node tests/win32/backpressure.cjs
python build.py
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/win32/browser.py --gpu --headed
python tests/smoke.py
```

The 40 unit checks exercise actual IA-32 machine code, memory bounds, instruction
cache invalidation, PE loader validation/relocation, Windows import resolution,
compiled callbacks, file operations and a cached-versus-uncached checksum
benchmark. A Worker transport regression verifies that an actual unsupported
import is reported **before** normal exit handling can schedule Stop. Failed
programs must retain their diagnostic and zero-executed-instruction count.

`backpressure.cjs` runs the real GDI executable with deliberately slow surface
creation and draw acknowledgements. It requires the surface to be ready before
painting and outstanding batches to remain bounded.

The browser suite has 15 checks in HTTP + WebGPU mode. It verifies real selected
EXEs, Unicode control/file round-trips, process restart, persistence across a
full page reload, native pointer/timer callbacks, GPU texture readback, the
presented screenshot pixel, unsupported-import diagnostics, and termination of
an infinite guest loop while the desktop remains responsive. An additional
rendering regression suppresses animation callbacks and submits 40 batches;
the final pixel must be correct and no backlog may grow. The standalone check
runs the checksum EXE after disabling network access.

For restricted development environments:

```sh
python tests/win32/browser.py --inject --browser /path/to/chromium
```

Injected mode has 13 checks, uses an opaque origin and does **not** certify
WebGPU or durable storage. Passing this mode is not a substitute for the
required HTTP/WebGPU CI run.

## CI evidence

`.github/workflows/browser-win32.yml` tests the shipped runtime/binaries, rebuilds
them from the original C sources with LLVM, and repeats the tests. It also runs
the 44-check Aster desktop regression suite. A separate Windows job runs the
**identical `compute.exe`** directly and verifies `4248471154` in its output file;
that reference host is test-only. It does not certify the GUI samples on Windows.

The `browser-win32-evidence` artifact contains the tracked-source ZIP, checked-in
standalone edition, rebuilt edition, binary hashes and source commit provenance,
unit/benchmark reports, shipped and rebuilt browser reports, backpressure report,
and genuine screenshots. The native reference is a separate artifact. Retention
is 14 days. Always inspect the workflow conclusion and reports: a workflow file
or screenshot alone is not proof of a successful test run.

WebGPU CI uses Chromium's SwiftShader software adapter. It checks real WebGPU
commands/shaders and presentation, not physical GPU speed. Cache timings compare
two modes of this software emulator on one original checksum program; they are
not native-Windows performance, frames per second or general compatibility.

## Real upstream application compatibility

`node tests/win32/compat.cjs` adds **24 checks** covering the extension API/CPU
semantics, malformed inputs, readonly/share/heap/descriptor boundaries, and the
**original unmodified 7-Zip 26.03 and TinyCC 0.9.27 binaries**. This is not a mock
console banner: 7-Zip creates, tests and extracts text/binary archives, extracts
an independent py7zr archive and rejects corruption. TinyCC loads its relocated
original DLL and TLS, compiles C, and its generated Windows EXE computes and
writes the expected result. Invalid C fails rather than producing an EXE.

`apps-browser.py` repeats useful operations through actual browser UI controls
and Workers, with network disabled after static asset loading. Its six checks
include the import picker, persisted archive testing, compilation, and **Files
→ Run EXE** for compiler output. `--standalone` repeats the same operations from
the complete offline HTML, without an execution server or external assets.
The console, PE output and archive bytes are genuine; screenshots are captured
from these running tests. `--inject` is only a restricted local development mode
and does not certify IndexedDB or WebGPU.

```sh
node tests/win32/compat.cjs
node tests/win32/exports.cjs --check
python tests/win32/apps-browser.py
python tests/win32/apps-browser.py --standalone --output tests/win32/artifacts/standalone-apps
```

CI's `upstream-native-cross-check` downloads the **same run's actual artifacts**.
On a real Windows runner it uses the original `7zr.exe` to test/extract the
Node-Wasm, browser-Worker, and standalone-browser archives and compares every
byte. It also executes each TinyCC-produced EXE directly on Windows and verifies
the computed file, then compiles the same C natively with the same original
TinyCC distribution. That Windows host is independent validation only; Aster
never connects to it. `native-apps.json` records seven reference checks.

No EXE is patched, recompiled or filename-substituted. TinyCC is the legacy 2017
release, not a recommendation for production compilation of hostile input. No
claim of full x87 precision, full CRT behavior, all 7-Zip options, GUI 7-Zip,
TinyCC `-run`, PuTTY or general application compatibility is made.
