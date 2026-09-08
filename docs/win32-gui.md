# Browser-native Win32 GUI compatibility

This round extends Aster's generic Windows API layer so a program's **own x86
code** can use PE resources, bitmap graphics, menus, multiple/owned windows,
modal dialogs and a private registry. It adds 207 exported function names to the
previous 430 (637 total); these have explicitly partial semantics, not complete
Windows compatibility. Unsupported features are not converted into per-app HTML.

The concrete application fixture is **WineMine**, built as a normal PE32 Windows
EXE from pinned Wine 9.0 application sources. Its `main.c`, `dialog.c`, resource
script and bitmaps are unchanged. Only the build environment supplies a standalone
entry point and disabled debug/build macros. **No Wine runtime, server, virtual
machine, executable upload or native helper is involved.** The separately licensed
application's full corresponding source is bundled, including in `Aster.html`.

## Use

Open Aster, launch **Win32 Lab**, select **WineMine**, and press **Run sample**.
Click the board, right-click to flag, use **Game** to change difficulty or **Custom**
to enter dimensions/mines, and open **Fastest Times** for the nested dialog flow.
F2 goes through the executable's original accelerator resource. **Game → Exit**
lets the application's own shutdown code save preferences. **Stop** terminates a
process; it does not simulate unsaved application state or guarantee rundown.

Preferences are isolated to that executable's SHA-256 identity and saved to the
browser, never to the host registry. **Files → Export registry** downloads the
private snapshot. Clearing site data removes it. Normal Aster backups do not yet
include private Win32 registries or C: drives, so export important state explicitly.

WineMine has its original resource artwork/palette; it is not Microsoft's shipped
Minesweeper binary. It is also not a JavaScript Minesweeper recreation. 7-Zip and
TinyCC remain **unchanged upstream Windows binaries**, unlike this clearly labeled
source-built GUI fixture. They continue to execute through the same runtime.

## Architecture and supported contracts

### Resource parsing

`resources.js` reads mapped PE resource directories with bounded offsets,
entry/string budgets, cycle/duplicate detection and section validation. Resource
lookup supports names and integer IDs, language selection, string tables and
Find/Load/Lock/SizeofResource semantics within the process's mapped images.
LoadStringW also supports its zero-capacity pointer-return form.

Standard and extended menu/dialog templates are parsed with their respective
alignment, font and creation-data layouts. The standard control creation-data
size includes its size word; DIALOGEX `extraCount` does not. Malformed/oversized
resources fail rather than walking arbitrary guest memory or host objects.
Accelerator tables preserve virtual-key/modifier/command records.

### USER32 and dialogs

`gui.js` owns HWNDs, registered classes, class atoms and extra data; the browser
host provides the visible controls/surfaces. The process supports up to eight
top-level or owned windows and 128 HWNDs total. Standard control families are
**EDIT, BUTTON and STATIC**, including basic check/radio/group boxes. Focus,
enabling, capture, text, edit selection/limits, command notifications and child
IDs are mapped back to the guest. UTF-16/CRLF edit offsets are translated at the
browser textarea boundary.

Window geometry is internally consistent with a fixed virtual frame model and
client/screen conversion. Move/resize recreates the retained GPU client target
while reusing sprites. It does not reproduce every Windows non-client/DPI rule.
Invalidated rectangles coalesce before paint delivery.

A synchronous modal DialogBox call runs a bounded, reentrant **guest message
loop** and invokes the application's DLGPROC. WM_INITDIALOG, owner disabling,
Get/SetDlgItemText/Int, EndDialog results, OK/default Enter and Cancel/Escape work
for the supplied templates. Nested MessageBox confirmation returns to the outer
guest procedure instead of substituting app-specific behavior. Modeless dialog
creation is supported, but advanced navigation/control-specific behavior is not
certified.

Window destruction follows parent WM_DESTROY, child destruction, WM_NCDESTROY,
then handle removal. Children remain queryable during the parent's WM_DESTROY;
the window's extra data remains available until its non-client cleanup. Queued
bitmap cleanup is submitted before removing its browser surface. Capture,
focus, menus, timers and owned windows are cleaned up without relying on a
cooperating GPU fence to permit force-stop.

Menus support resource and API construction, nested popups, command dispatch,
check/radio/enabled state and accelerators. Quotas bound menu trees; cyclic
submenus are rejected. Opening a popup does not increment persistent resource
counts. Menu and dialog text is created as DOM text, not interpreted as HTML.

### GDI bitmaps and retained WebGPU sprites

`bitmaps.js` implements compatible memory DCs/bitmaps, selected-object ownership,
BITMAP/DIBSECTION queries, DIB creation and scanline transfer, and **SRCCOPY**
BitBlt/StretchBlt with positive extents, cropping and nearest-neighbor scaling.
Memory-to-memory overlapping copies have snapshot semantics. Client drawing
uses the same logical coordinates as the guest's input messages.

The decoder accepts bounded uncompressed 1/4/8/16/24/32-bit DIB data, legacy/core
and Windows headers, palettes, top-down/bottom-up layout and supported 16/32-bit
bitfield masks. Decoder tests compare the three source BMPs against hashes from
an independent Pillow decode. Compressed/RLE data and invalid masks are rejected.

Static bitmap resources are decoded once and uploaded once per revision and
window. Later blits send an ID, source rectangle and destination rectangle—not
the full bitmap pixels. WebGPU batches compatible sprite draws into material
runs on the retained render target. Texture update/delete commands keep order
relative to earlier draws, including a texture changed twice in a single batch.
The explicit Canvas2D fallback follows the same command-order contract.

DIB sections can be modified by actual x86 stores into guest memory. The Wasm
CPU tracks revisions only on **reference-counted watched pages**; bitmaps sharing
a page retain independent watches. Host API writes participate in the same
revision mechanism. Unrelated stack/data writes do not force sprite redecoding.
This is change tracking, not a JIT or a claim of physical-GPU speed.

Limits include 128 bitmap objects, at most 2048 pixels per side / four million
pixels per bitmap, and 32 MiB total bitmap pixels. Memory-DC primitives are a
small subset. Screen/window readback as a BitBlt source, non-SRCCOPY raster ops,
mirrored extents, alpha blending, halftone scaling, compressed DIBs, printing and
full device-context mapping/clipping behavior are not implemented. Memory-DC
text/ellipse paths and unsupported operations fail explicitly.

### Private registry

`registry.js` exposes bounded A/W open/create/query/set/delete/enumerate/info
operations on private root/key/value maps. Names are case-insensitive; values
preserve their type and bytes. It supports string/multi-string/binary/DWORD/QWORD
values, required-buffer-size reporting, selected access-mask checks and
process-only volatile branches. Import validates the complete snapshot before
replacing live state. Limits are 256 keys, 512 values, 16 KiB per value and 1 MiB
of value bytes, with bounded key depth/name length.

Nonvolatile changes are snapshotted through the Worker transport into IndexedDB,
keyed by the full executable hash. Registry and final Stop/file messages bypass
the graphics queue. These are private application preferences, **not Windows
registry virtualization against a host hive**: no host/system registry, remote
registry, DACL implementation, WOW64 registry view separation, notifications,
transactions or synchronous native disk flush is provided.

## Verification and reproduction

```sh
node tests/win32/unit.cjs
node tests/win32/compat.cjs
node tests/win32/gui.cjs
node tests/win32/backpressure.cjs
node tests/win32/exports.cjs --check
python build.py
xvfb-run -a -s '-screen 0 1440x1000x24' python tests/win32/gui-browser.py --gpu --headed
```

The new contract/executable suite has 39 checks and the new browser suite has
nine scenarios. Existing CPU, 7-Zip/TinyCC, backpressure and desktop suites remain
in CI. Browser tests inspect actual GPU output and presented screenshot pixels,
exercise menu/dialog/native callbacks and reload private preferences. The offline
single-file test disables networking. GPU mode fails on Canvas fallback.

An independent Windows job executes the **same checked-in WineMine EXE** to verify
native client dimensions, dialog input/results and preference values. A separate
Linux job rebuilds it offline from the bundled corresponding source with MinGW
and compares executable hashes. Native Windows/MinGW/Xvfb are maintainer/CI tools,
not Aster application dependencies. Read the exact workflow status and artifact
provenance before treating these test definitions as passed evidence.

Restricted local `--inject` tests use an opaque origin, memory storage and often
Canvas2D; those results do not certify WebGPU or reload persistence. CI WebGPU
runs use software SwiftShader Vulkan. That executes real WGSL/WebGPU commands,
but is **not a physical-GPU throughput benchmark**. Neither the tests nor a
screenshot certify all gameplay states, universal GUI compatibility, exact
Windows font/widget pixels or arbitrary application performance.

## Remaining compatibility boundaries

The CPU remains a bounded 32-bit interpreter/cache, not Rosetta-style optimizing
translation. No x64, threads, general SEH, SSE, .NET/COM, DirectX, audio, networking,
Windows drivers or installer service is added. Advanced common controls (list/
tree/combo/rich edit), owner-drawn menus, arbitrary custom child painting,
clipboard/IME/accessibility parity and native theme/DPI/font matching are outside
this round. Icon/cursor loading currently provides metadata handles, not complete
icon/cursor rasterization. Dynamic child reparenting is rejected. Query and
fallback behavior is documented in the source/export manifest.

Use trusted programs and input. Bounded resources and guest-pointer checks are
not a formal proof against emulator/browser/GPU vulnerabilities. Force termination
or browser shutdown may lose unflushed state.

## Primary references

- [Microsoft PE resources](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#the-rsrc-section): resource directory and data layout.
- [DLGTEMPLATE](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-dlgtemplate), [DLGITEMTEMPLATE](https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-dlgitemtemplate), [DLGITEMTEMPLATEEX](https://learn.microsoft.com/en-us/windows/win32/dlgbox/dlgitemtemplateex): alignment, fonts and distinct creation-data lengths.
- [DialogBoxIndirectParamW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-dialogboxindirectparamw): modal loop and owner/result behavior.
- [WM_NCDESTROY](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-ncdestroy): lifetime relative to child destruction.
- [CreateDIBSection](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-createdibsection), [BitBlt](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-bitblt): writable DIB bits and GDI copy contracts.
- [RegCreateKeyExW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regcreatekeyexw), [RegQueryValueExW](https://learn.microsoft.com/en-us/windows/win32/api/winreg/nf-winreg-regqueryvalueexw): volatile creation and buffer/error semantics.
- [WebGPU specification](https://gpuweb.github.io/gpuweb/): retained resources and ordered queue submission.
- [Pinned WineMine source](https://github.com/wine-mirror/wine/tree/fd1153552d779e1ac14b0b1c48fbd1cde894eb0a/programs/winemine): unchanged application/resource code and LGPL notices.
