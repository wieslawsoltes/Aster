# Browser-only Win32 compatibility

Aster **Win32 Lab** executes real **32-bit x86 PE32** program bytes in a dedicated
WebAssembly Worker. Supported Windows imports bind to browser-backed JavaScript
implementations, and GDI draws through WebGPU. There is **no Wine, Docker,
companion, Windows installation, executable service, application upload or
remote desktop stream**. This is a small user-mode compatibility runtime, not a
bootable OS or a general Windows replacement.

The CPU is an original IA-32 interpreter compiled to Wasm, with a decoded-
instruction cache. It is **not a complete Rosetta-style optimizing JIT**. No file
name or executable hash selects a mock implementation. SHA-256 identifies each
private C: drive; the program's machine code owns its computation and callbacks.

## Original upstream binaries

These exact original Windows binaries are bundled, with hashes and provenance
in [`third-party/manifest.json`](../third-party/manifest.json). They are not
recompiled or patched for Aster.

| Program | Verified scenarios / limits |
| --- | --- |
| **7-Zip reduced console 26.03 (`7zr.exe`)** | Create an LZMA2 `.7z` from text and arbitrary binary bytes; test it in a fresh process; extract all bytes; extract an independently generated py7zr archive; reject corruption. Use `-mmt=off`; sample creation uses `-mx=1 -md=1m`. This is the reduced console, **not the 7-Zip GUI**, and full format/encryption coverage is not claimed. |
| **Tiny C Compiler 0.9.27 (`tcc.exe` + original `libtcc.dll`, headers/libraries)** | Load and relocate the original DLL, initialize main/DLL static TLS, compile ordinary C using `stdio.h`, write a normal Windows EXE, then run that EXE in a separate Aster Worker and verify its computed file. Invalid C produces a real compiler error, not an output EXE. This is a **legacy 2017 compatibility fixture**, not a current production-toolchain recommendation. `-run`, self-hosting, every compiler flag and arbitrary generated programs are not certified. |

A third application, **WineMine from Wine 9.0**, is built from pinned, unchanged
upstream gameplay and resource sources into a standard Windows EXE. Its build-only
entry/debug shims do not change the game. **No Wine runtime is used.** Select
**WineMine** and **Run sample** for the bitmap board, menus and modal dialogs.
This source-built fixture is distinct from the two unmodified upstream binaries
above. [GUI compatibility details](win32-gui.md) and the complete
[corresponding source](../third-party/winemine/winemine-source.zip) are included.

Four original compiled GUI/CPU examples remain: **Win32 Pad**, **GDI Playground**,
**Hello Win32**, and **Integer checksum**. The general runtime executes both the
third-party programs and these small test programs; examples are not substituted
with JavaScript apps.

PuTTY/PuTTYgen were researched as further targets. Their required cryptography,
networking and broader Windows UI/API behavior are outside this tested scope.
No working PuTTY, Notepad++, installer, modern game or arbitrary Windows app is
claimed. Compatibility is demonstrated by the scenarios above, not merely by
printing a help banner.

## Try it with no runtime installation

Open **Aster.html**, or Aster's static hosted page, and launch **Win32 Lab**.
Choose **7-Zip 26.03** and press **Run sample**. The prefilled arguments create
`sample.7z` from the private `welcome.txt`:

```text
a sample.7z welcome.txt -mmt=off -mx=1 -md=1m
```

Use **Files** to download the archive or copy it into Aster's documents. After
the process exits, **Import files** imports selected files into this executable's
private C:. Change the arguments and press **Run selected**, for example:

```text
t sample.7z -mmt=off
x my-archive.7z -mmt=off -aoa
```

Choose **TinyCC 0.9.27** and **Run sample**. Original support files and an editable
sample `hello-aster.c` are seeded only if missing. The default arguments are:

```text
-o hello-aster.exe hello-aster.c
```

Open **Files**, find `hello-aster.exe`, and click **Run EXE**. A new Worker executes
the generated machine code, displays its console output and creates
`compiled-result.txt` with the checksum **3726872593**. To compile another C file,
use **Import files** and change the arguments. Each different EXE has a separate
private drive; files are not automatically shared between compiler and output.

**Open .exe** selects another compatible executable. Drag/drop and File Explorer
select an executable without automatically running it. Arguments are passed to
the virtual process, never to a host shell. The optional stdin field supplies a
closed, preloaded input stream, not an interactive terminal.

The single-file edition embeds the runtime, both upstream applications/support
files, WineMine, all samples, license notices **and the complete corresponding
TinyCC and WineMine source archives**. End users need no build tools, account or extra download. Win32 Lab's
expanded diagnostics contain **Licenses**, **TinyCC source** and **WineMine source** download buttons.
The source edition uses ordinary static HTTP/HTTPS hosting; GitHub Pages is
sufficient. WebGPU and durable storage depend on browser/context. Fallback to
Canvas 2D or memory storage is clearly labeled.

## Implemented architecture

| Layer | Scope |
| --- | --- |
| PE loader | Bounded MZ/PE32/i386 headers, mapped sections/imports, entry validation, HIGHLOW relocations, named and ordinal exports, data imports, private DLL dependencies and single-thread static TLS templates/callbacks. Unknown imports fail before guest execution. |
| CPU | Common integer IA-32 instructions, 8/16/32-bit operands, ModRM/SIB, arithmetic/flags/branches, stack/calls, string operations, CMOV/SETcc, FS access, bit-test/modify and bit scans. LOCK is accepted only on supported memory RMW instructions in this single-thread model. |
| x87 subset | Eight-register stack/tags, binary32/64 loads/stores and arithmetic, integer conversions, comparisons, control/status and selected constants/rounding. Extended 80-bit representation is converted through **binary64 intermediates**: full 80-bit precision/range is not emulated. SSE, transcendental operations, packed BCD and full FPU environment operations remain unsupported. |
| Loader lifecycle | Up to four private in-memory DLLs, at most 2 MiB mapped image each; acyclic dependencies; bounded exports; process-attach DllMain and TLS callbacks; aligned static TLS data and emulated TEB. Private DLL unload/detach, loader-lock semantics, forwarded exports and delay imports are not implemented. No DLL is loaded into the host OS. |
| Kernel services | Bounded allocations and heap ownership/reallocation, module queries, private synchronous files, sizes/seeks/truncation, directory enumeration, rename/copy/delete, DOS attributes, times, UTF-8/UTF-16/1252/OEM437 conversions, argument/environment strings and single-thread synchronization/TLS. Unsupported privileged operations return documented failures, not host privileges. |
| C runtime | Selected MSVCRT startup/data globals, cdecl/varargs, args/env, stdio/descriptors, memory/string operations, formatting, integer/numeric conversion, guest callbacks and bounded setjmp/longjmp. This is **not** a full MSVC/UCRT implementation. File translation/locale/format semantics are partial; CRT streams are unbuffered. |
| USER32 | Up to eight top-level/owned windows per process, EDIT/BUTTON/STATIC controls, window-extra data, ordered destruction, message/timer/input dispatch, menus, accelerators, standard/extended resource dialogs and nested modal DLGPROC callbacks. Browser controls overlay the client surfaces. |
| Resources / registry | Bounded PE resource lookup, string tables, standard/extended menus/dialogs, accelerators and bitmap decoding. Bounded private per-executable registry with typed values, enumeration, access checks and browser persistence. No host registry access. |
| GDI / WebGPU | Retained client surfaces, primitives/text, memory DCs, bitmaps, DIB sections, cropped SRCCOPY BitBlt/StretchBlt and nearest-neighbor GPU sprites. Immutable sprites upload once per revision/surface; watched guest-memory pages track direct DIB writes. |
| OLE data subset | BSTR allocation and scalar/BSTR VARIANT operations with correct ordinal aliases. No COM/Automation server or object activation. |

The generated [export manifest](browser-win32-exports.json) lists **637 function
entries**: **623 partial implementations** and **14 explicit fail-on-call entries**,
plus **7 ordinal aliases** and **16 data imports**. This count does not imply 637
complete Windows APIs. Some real programs import optional threading/exception
paths that are never used in the tested scenario; those named entries bind but
**throw an explicit unsupported error if called**. Completely unknown imports
reject the image. Exact behavior lives in `src/win32/` and the generated manifest.
The GUI round adds 207 function names; this is not 207 complete Windows APIs.

Not implemented: x64/ARM/Win16/DOS, kernel services/drivers, general SEH/C++
exceptions, threads/child processes, dynamic executable memory, COM/.NET/UWP,
MFC, full CRT/UCRT, advanced common/owner-drawn controls, general raster operations,
DirectX/OpenGL, audio, guest
networking, host clipboard/printers/devices or arbitrary DLL discovery. Browser
controls/GDI font metrics are not pixel-identical Windows widgets. Most existing
Windows programs remain incompatible.

## Performance design and evidence

The CPU runs off the main UI thread. The bounded 16,384-entry decode cache avoids
repeated instruction decoding and invalidates when executable bytes change.
API thunks cross into JavaScript only at API boundaries. Message waits sleep;
paint/timer/mouse events are coalesced. Execution slices, callback budgets and
Worker Stop keep a busy executable from blocking the desktop.

GDI batches use instanced primitives and a retained GPU texture. A second draw
presents that texture. Cached browser-rasterized glyphs avoid repeating text
rasterization. There is no remote framebuffer and no full-screen CPU screenshot
upload. Credits wait for surface readiness and GPU completion, prevent unbounded
queues, and work even when animation callbacks are suspended. Stop/file messages
bypass the rendering queue. Bitmap resources are decoded once and static sprite
blits reuse retained GPU textures rather than sending RGBA pixels repeatedly.
Writable DIB sections use reference-counted guest-page watches; ordinary guest
stack/data writes outside those pages do not invalidate the sprites. Texture
updates and deletes preserve ordering relative to previously submitted draws.
**WebGPU does not accelerate 7-Zip compression or
TinyCC's CPU work**; those execute in Wasm.

`unit.cjs` measures cached versus uncached execution of the same checksum PE,
verifies identical output, discards warmup and records all timed samples. Reports
are software-emulator microbenchmarks, **not native-Windows speed or FPS**. No
physical-GPU benchmark or arbitrary-application speed guarantee is claimed.

## Storage and security

The guest address space is 64 MiB; the Wasm instance reserves 80 MiB including the
CPU/cache. Limits include four guest processes, 4,096 handles/process, 128 windows,
64 timers, 1,024 queued messages, 512 files, 8 MiB/file and 32 MiB file data. Main
EXE input is capped at 16 MiB. All guest pointers remain inside bounded guest
memory; they cannot address interpreter state, JS objects or host directories.

Files use a case-insensitive private C: map. UNC/devices/alternate drives/path
traversal are rejected. No native-folder permission, executable upload, socket
proxy, `CreateProcess`, or `ShellExecute` is involved. Selected source filenames,
console text and titles render as text nodes, not HTML. Private DLL names must be
simple `.dll` basenames and resolve only from files already in that process.

Changed file bytes and deletions are snapshotted to IndexedDB under the full EXE
SHA-256. Restart/reload persistence is tested. **Attributes, file times and empty
directories currently last only for the process; nonempty directories are
inferred from persisted file paths.** Stop requests a final snapshot, but force
termination, faults or browser shutdown can lose unflushed writes. Private drives
are not part of normal Aster backups: use **Download** or **Copy to Aster** first.
Clearing site data erases them. Only one live instance per EXE hash is allowed to
avoid persistence races. The launcher does not retain arbitrary imported EXEs.

Registry state is separate from private files and also keyed by the full EXE
SHA-256. Nonvolatile typed values are snapshotted to IndexedDB; volatile branches
remain process-only. **Normal Aster backups do not yet include private registries
or private C: drives.** Use **Files → Export registry** and export important files.
Registry APIs never read or modify the host OS registry. Snapshot completion is
asynchronous; `RegFlushKey` does not provide native synchronous disk-flush semantics.
A program must run its own normal exit path to save its preferences; force Stop
cannot invent unsaved application state.

Use trusted programs and trusted input. This is **not a formally verified
malware-analysis sandbox**; emulator/browser/GPU vulnerabilities and resource
exhaustion risks remain. Never enable unsafe Chromium GPU test flags for normal
browsing. Test flags, LLVM, Xvfb and the native Windows reference runner are
maintainer/CI tools only, not application dependencies.

## Reproduce verification

```sh
node tests/win32/unit.cjs
node tests/win32/compat.cjs
node tests/win32/gui.cjs
node tests/win32/exports.cjs --check
node tests/win32/backpressure.cjs
python build.py
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/win32/browser.py --gpu --headed
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/win32/apps-browser.py --gpu --headed
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/win32/apps-browser.py --gpu --headed --standalone --output tests/win32/artifacts/standalone-apps
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/win32/gui-browser.py --gpu --headed
python tests/smoke.py
```

Maintainers can rebuild the original CPU/four local examples with
`python native/win32/build.py` (LLVM), but the two third-party EXEs are always
unaltered upstream binaries. `python third-party/fetch.py` reproduces their
hash-pinned packaging. WineMine has its own pinned source build,
`python third-party/winemine/build.py`; MinGW is a maintainer-only dependency.
[Test documentation](../tests/win32/README.md) explains
negative tests, artifacts and independent native references. The workflow must
pass at the exact head being merged; screenshots alone do not establish success.

## Primary sources and rationale

- [Microsoft PE format](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format): PE32 headers, imports/exports, relocations and TLS structures.
- [Microsoft window messages](https://learn.microsoft.com/en-us/windows/win32/learnwin32/window-messages): queues and WNDPROC dispatch.
- [Microsoft SetFileAttributesW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-setfileattributesw): DOS attributes and failure behavior.
- [LZMA SDK / 7zr](https://www.7-zip.org/sdk.html): reduced console, formats and public-domain license. Only the pinned binary/version in the manifest is certified by our tests.
- [TinyCC project](https://bellard.org/tcc/) and [manual](https://bellard.org/tcc/tcc-doc.html): native compiler/linker, Windows support and LGPL. Full corresponding source accompanies our binary distribution.
- [WebGPU specification](https://gpuweb.github.io/gpuweb/): GPU resource/command/pipeline model. CPU emulation and graphics are separate.
- [Chromium SwiftShader guidance](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md): software-GPU CI. Our tests execute real WebGPU/WGSL and compare readback with presented pixels, not physical GPU throughput.

All CPU/PE/API implementation here is original Aster code. No Windows system DLL,
OS image, Microsoft program, proprietary font or Wine runtime implementation is
bundled. The separately licensed WineMine application and its corresponding
source are included as an explicitly identified compatibility fixture. Third-party application licenses are in [the notices/source directory](../third-party/README.md).
