# Browser-only Win32 compatibility

Aster **Win32 Lab** loads real PE32 `.exe` bytes and runs their IA-32 instructions
inside a dedicated WebAssembly worker. Supported Windows DLL imports are bound to
an original JavaScript API implementation. GDI draws onto a persistent WebGPU
render target. No Wine, Docker, Linux VM, Windows image, companion, socket proxy,
remote executable service, account, or application upload is required.

This is an **experimental, deliberately small compatibility runtime**, not a
complete Windows emulator. Most existing Windows applications will fail because
of missing DLL exports, instructions, controls, or OS behavior. The four supplied
examples are original programs compiled to standard Windows executables, not
JavaScript rewrites disguised as `.exe` files. No executable hash selects a
hard-coded implementation. The hash is used only for private-drive identity.

## Run without installing anything

Open Aster, find **Win32 Lab** in Start, choose **GDI Playground**, **Win32 Pad**,
**Hello Win32**, or **Integer checksum**, and press **Run sample**. Alternatively,
choose **Open .exe**, select a compatible 32-bit executable, and press **Run
selected**. Dropping an EXE onto the app selects it but does not auto-run it.
Double-clicking an `.exe` in File Explorer opens the same launcher.

The generated **Aster.html includes the complete runtime and all samples**. It
works offline without separate files. The ordinary source edition works with
Aster's existing static server or GitHub Pages. There is no execution backend.
WebGPU needs a supporting browser and secure context; the UI explicitly reports
Canvas 2D when WebGPU is unavailable. Never enable Chromium's unsafe GPU test
flags for ordinary browsing. They are used only with the trusted CI fixtures.

**Stop** terminates the worker after requesting a final drive snapshot. A busy
x86 loop cannot block the main desktop. Normal window close flushes saved files;
force-close/crash/browser shutdown can lose the most recent unsnapshotted writes.
An EXE is not automatically restarted after a browser reload.

## What is implemented

| Layer | Implementation and bounds |
| --- | --- |
| PE loader | MZ/PE signatures, i386/PE32, GUI/console subsystem, header/section bounds, mapped import tables, named imports, HIGHLOW relocations, entry-point validation. Reports missing imports before executing instructions. |
| CPU | Original integer IA-32 interpreter compiled to Wasm, 8/16/32-bit operands, ModRM/SIB, integer arithmetic/flags, common branches/calls/returns, shifts/rotates, multiply/divide, string operations, CMOV/SETcc, FS-relative access. A bounded 16,384-entry decode cache avoids repeated parsing. |
| Scheduling | One emulated thread per worker; bounded instruction slices; browser event loop yielding; asynchronous Win32 message waits; synchronous, nested guest WNDPROC callbacks with recursion/instruction limits. |
| USER32 subset | Class registration, one top-level window per process, EDIT/BUTTON/STATIC children, creation/paint/close/destroy messages, queued input and commands, Get/Peek/DispatchMessage, window text, OK/Cancel message boxes, WM_TIMER timers. |
| GDI subset | DC/paint handling, solid brushes/pens, stock objects, selection/deletion, rectangles, ellipses, lines, pixels, text color/background, TextOutA/W, simple fonts and text measurement. |
| KERNEL32 subset | Process exit, monotonic clocks, performance counters, heap allocations, selected string functions, module/import lookup for implemented facades, synchronous private-file create/read/write/seek/close. |
| C runtime subset | A few `msvcrt.dll` allocation, memory, string and output functions using cdecl. This is not the MSVC CRT startup/runtime. |
| Storage | Case-insensitive private C: drive per executable SHA-256, snapshots to Aster's IndexedDB metadata, explicit download/copy to Aster files. UTF-16 strings are handled by W functions; ANSI uses Windows-1252. |

There are **115 named facade exports** in this revision. This is not a claim of
115 complete Windows API implementations. See the generated
[`browser-win32-exports.json`](browser-win32-exports.json) for their names and
argument counts, and `src/win32/runtime.js` for exact behavior.

### Intentional differences and unsupported features

Only one top-level custom-class window per process and four concurrent guest
workers are allowed. Nested child controls, native menus, resources/dialog
bundles, subclassing, owner drawing, scrollbars, clipboard, printing and drag/drop
inside the guest are not implemented. EDIT and BUTTON are browser DOM controls
for usable text input, selection, touch and accessibility; they are not pixel-
identical USER32 widgets. Top-level `CreateWindowEx` dimensions are treated as
client dimensions. Font metrics, classic colors, clipping and paint invalidation
are simplified. `InvalidateRect` invalidates the whole client; default class
background erasure is not implemented. Programs should paint their own surface.
`TranslateMessage` is an acknowledged facade no-op: browser text input supplies
WM_CHAR, rather than a Windows keyboard-layout translation engine.

Not supported: x64/ARM/Win16/DOS, x87/SSE/SIMD, protected-mode hardware, kernel
code/drivers, SEH, static TLS/TLS callbacks, threads, processes, arbitrary native
DLL loading, delay imports, dynamic executable allocation, COM/OLE, .NET, UWP,
MSI, MFC, full CRT startup, DirectX/OpenGL/Vulkan, audio and network APIs. A missing
function or unsupported instruction is an explicit diagnostic, not a fabricated
successful return. Certain implemented facade queries intentionally return
single-process values (for example, process/thread ID 1 and no debugger).

This is conceptually a binary compatibility layer, but **not Rosetta, a complete
x86-to-Wasm JIT, or a native-speed guarantee**. The first CPU tier is a Wasm
interpreter with a decode cache. There is no guest-generated JavaScript `eval`
and no native machine-code execution outside the browser.

## Graphics and performance design

GDI commands are batched into instanced WebGPU primitives. One draw submits the
batch into a persistent texture; a second draw presents that texture. Unchanged
pixels remain on the GPU. There is no remote screen stream and no full-frame
CPU screenshot upload. Text glyphs are rasterized by the browser once, uploaded
to a bounded atlas and subsequently drawn by the GPU. Browser controls overlay
the client canvas. Canvas2D is an explicit fallback, not labeled WebGPU.

The CPU runs off the main thread. Import thunks execute only at Windows API call
boundaries. The decoder cache is invalidated on guest/host writes to code pages,
not every stack or data write. Message waits sleep instead of polling. Mousemove,
paint and timer messages are coalesced and queues are bounded. Files are copied
only when changed or explicitly requested, not on every frame.

The reproducible checksum benchmark runs the **same PE32 program with the cache
on and off**, validates the resulting file, discards the first measurement and
reports three timed samples and their medians. `unit-results.json` contains the
actual observed timings. These are software-emulation observations, not an FPS
promise, native-Windows comparison or broad application benchmark. CI WebGPU
uses **SwiftShader**, so it validates the real GPU API/shader path in software;
it does not measure a physical GPU's performance.

## Storage and security boundaries

The fixed guest address space is **64 MiB**; the Wasm instance reserves **80 MiB**
including the emulator and decode cache. A process has at most 4,096 handles,
128 windows, 64 timers, 1,024 queued messages, 128 files, 8 MiB per file and 32 MiB
of file data. The EXE upload-to-memory limit is 16 MiB. Guest memory access is
checked before indexing the guest array. Guest addresses cannot directly name
Wasm interpreter state, JavaScript objects or the host filesystem.

Win32 file calls access only the selected executable's in-memory C: map. UNC,
device names, traversal, alternate drives and paths with unsafe components are
rejected. No host-directory permission is requested. No WinInet, Winsock,
CreateProcess or ShellExecute facade exists. UI strings use text nodes rather
than guest-supplied HTML. WebGPU coordinates, textures, queues and glyph caches
are bounded. Imported EXEs are not uploaded to any service.

Snapshots are keyed by the complete executable SHA-256. A second simultaneous
instance of the same EXE is rejected to avoid drive races. A different binary
receives a different drive. Files stay in the browser profile/origin; clearing
site data removes them. **Normal Aster backup currently does not include these
private drives.** Use **Files → Download** or **Copy to Aster** first. Imported
EXEs themselves are not retained by the launcher; keep your original file.

This code is not a formally verified malware-analysis sandbox. Emulator,
browser or GPU-driver vulnerabilities and denial-of-service risks remain.
Use trusted test programs and keep the browser updated. There is no claim that
all malicious executables are safe to run.

## Verification and rebuilding

No toolchain is required by end users. Prebuilt runtime and samples are committed.
For maintainers, LLVM (`clang`, `lld-link`, `llvm-ar`) rebuilds the CPU and samples:

```sh
python3 native/win32/build.py
python3 build.py
node tests/win32/unit.cjs
python3 -m pip install playwright pillow
python3 -m playwright install chromium
xvfb-run -a -s '-screen 0 1440x1000x24' python3 tests/win32/browser.py --gpu --headed
python3 tests/smoke.py
```

The unit suite covers real integer machine-code execution, guest bounds, code
cache invalidation, unsupported opcodes, PE rejection, relocations, imports,
private file paths, actual compiled callbacks/file writes and the cache benchmark.
The browser suite drives real Win32 program controls, verifies WriteFile bytes,
loads them with ReadFile, restarts/reloads the private drive, reads pixels back
from the actual GDI render target, tests timer/pointer interaction, validates an
unsupported EXE, stops an infinite x86 loop, and runs standalone HTML offline.
The GPU CI job **fails if it uses Canvas fallback** or has a WebGPU validation
error. A separate Windows runner executes the unchanged checksum sample as a
native Windows EXE and checks its output.

Reports, screenshots and the rebuilt standalone HTML are retained in CI
artifacts. Test fixture success does not imply that Notepad++, Office, Photoshop,
WinMine or any other untested third-party Windows executable works.

## Research and rationale (2026-09-07)

- Microsoft's [PE format specification](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)
  documents PE32, import-address tables and relocation structures. The loader
  implements a bounded subset rather than booting Windows.
- Microsoft's [Win32 window-message guide](https://learn.microsoft.com/en-us/windows/win32/learnwin32/window-messages)
  explains message queues and window-procedure dispatch. Aster maps browser input
  to those guest-facing contracts, with the limitations described above.
- [retrowin32](https://github.com/evmar/retrowin32) is an existing high-level Windows
  emulator demonstrating that an `.exe` can be paired with CPU emulation and an
  API implementation directly in a browser. Its README also warns about narrow
  compatibility and points to a successor. No code is copied from it here.
- [v86](https://github.com/copy/v86) takes a different route: PC hardware emulation
  plus runtime x86-to-Wasm translation. That broader system architecture is not
  needed for this small user-mode API subset; Aster does not integrate v86.
- [BottleShip](https://github.com/jenissimo/bottleship) describes a more ambitious
  browser high-level-emulation engine with Win32 and DirectX mapped to web APIs.
  Its advertised game compatibility was not independently verified for this PR;
  neither its engine nor games are bundled here.
- The [WebGPU specification](https://gpuweb.github.io/gpuweb/) supplies the GPU
  resource/pipeline model. CPU emulation remains in Wasm; GPU work is used where
  it fits naturally: batching, rasterization, text and compositing.
- Chromium's [SwiftShader guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)
  and [WebGPU test configuration](https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/web_tests/FlagSpecificConfig)
  document software-GPU testing. This is for CI verification, not a recommendation
  to weaken normal browser security.

Linux GPU CI also installs `libvulkan1 mesa-vulkan-drivers xvfb xauth`. It runs full Chrome on a virtual X display with a consistent SwiftShader Vulkan presentation path, and compares a screenshot pixel with the GPU readback. These are test-runner dependencies only, never Aster end-user dependencies.

Graphics use acknowledged Worker credits: top-level window creation waits for the browser surface, and batches wait for presentation/GPU completion before guest drawing continues. A deliberately slow-display regression runs the real GDI EXE and verifies bounded outstanding batches. This prevents a fast guest from overflowing the renderer during GPU initialization or slow software rendering.
