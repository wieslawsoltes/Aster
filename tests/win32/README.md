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
