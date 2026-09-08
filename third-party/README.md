# Bundled upstream Windows applications

7-Zip and TinyCC below are **unaltered 32-bit Windows binaries**, executed by Aster's generic PE32/Wasm runtime. They are not JavaScript ports and are not rebuilt to fit Aster. Their original names, versions and licenses remain visible. `manifest.json` pins every shipped binary/support bundle and the corresponding TinyCC source by SHA-256.

## 7-Zip reduced console 26.03

- Author: Igor Pavlov. This is `7zr.exe`, the reduced 7z console program distributed with the **public-domain LZMA SDK**, not the full 7-Zip GUI/UnRAR distribution.
- Original binary: https://github.com/ip7z/7zip/releases/download/26.03/7zr.exe
- Project and license: https://www.7-zip.org/sdk.html
- Tested use: `a`, `t`, `x` with `-mmt=off`; creation uses `-mx=1 -md=1m` within the 64 MiB guest budget. Text and arbitrary binary bytes round-trip; an independently created archive is also tested. No claim of full format or encryption coverage.

## Tiny C Compiler 0.9.27 (legacy Windows release)

- Copyright Fabrice Bellard and TinyCC contributors. **GNU LGPL version 2.1 or later**, with each included MinGW header retaining its own notices. Aster's MIT license does not relicense this software.
- Project: https://bellard.org/tcc/
- Official distribution: https://download-mirror.savannah.gnu.org/releases/tinycc/tcc-0.9.27-win32-bin.zip
- `tinycc/COPYING`: complete LGPL license.
- `tinycc/tcc-0.9.27.tar.bz2`: complete corresponding original release source, including build instructions/scripts. No TinyCC source or binary was patched.
- `tinycc/tcc-win32.txt`: original Windows build/use instructions.
- `src/win32/third-party/tcc.exe`: original executable.
- `src/win32/third-party/tcc-files.json`: base64 transport packaging of original `libtcc.dll`, all included headers and the 32-bit library files. File bytes are unchanged; 64-bit libraries are excluded because this runtime is i386-only. `fetch.py` reproduces the packaging from the pinned ZIP.

The offline `Aster.html` embeds the license notice **and the complete TinyCC source archive**; Win32 Lab's **Licenses** and **TinyCC source** buttons download them locally. Static hosting publishes this directory as well. Modified/replacement private DLLs and headers may be imported; bundled defaults seed only missing paths. No signature restriction prevents modifying the LGPL components.

This 2017 release is a **legacy compatibility fixture**, not a recommendation for a current production toolchain or for compiling hostile input. The working scenarios are documented in `docs/browser-win32.md`; most Windows software remains incompatible.

## Reproduce the original fixtures

```sh
python third-party/fetch.py
```

This maintainer-only command retrieves the pinned original distribution, verifies hashes before writing, packages only the documented paths, and checks the reproduced hashes. Users do not need to download or install a compiler/runtime.

## WineMine (Wine 9.0 application, source-built PE32)

This third fixture is **not an original upstream precompiled binary**. It is a
Windows EXE built from the unchanged `programs/winemine` gameplay and resource
sources at Wine commit `fd1153552d779e1ac14b0b1c48fbd1cde894eb0a` (Wine 9.0).
Copyright Joshua Thielen, Marcelo Duarte and contributors; **LGPL-2.1-or-later**.
Aster's MIT license does not relicense this application or its artwork.

`winemine/build.py` verifies every source/resource Git blob before compiling.
Two build-only shims supply a standalone entry point and disabled Wine debug/build
macros. No gameplay source is modified. Standard Windows DLL imports resolve to
Aster's generic API layer in the browser. No Wine runtime library is distributed
or started. Source-built compatibility is deliberately distinguished from the
unchanged 7-Zip/TinyCC binaries.

- `src/win32/third-party/winemine.exe`: compiled Windows application.
- `winemine/winemine-source.zip`: complete corresponding application source,
  resources, entry/debug shims, reproducible build script and LGPL license.
- `winemine/COPYING.LIB`: complete LGPL license.
- `winemine/provenance.json`: pinned revision, source/resource hashes, exact
  compiler/build command and binary/source-archive SHA-256 values.

Both static hosting and the offline HTML include the source archive. **WineMine
source** downloads it from Win32 Lab. Modified/rebuilt EXEs remain loadable through
**Open .exe**; there is no signature or application-hash restriction. To rebuild
on a maintainer machine with MinGW-w64 GCC/windres:

```sh
python third-party/winemine/build.py --output /tmp/winemine-build
```

For an offline rebuild, extract `winemine-source.zip` to a separate directory and
pass that directory as `--source`. The existing GUI runtime accepts the rebuilt
ordinary PE32 file without changing or recompiling Aster. Tests check that a
rebuild using the same compiler reproduces the committed binary, and execute
that same binary independently on a disposable native Windows CI runner.

Tested scenarios and remaining GUI limits are in `docs/win32-gui.md`. WineMine's
resources have their own original color palette; Aster does not replace them with
Microsoft artwork or force them to match a particular Windows Minesweeper release.
