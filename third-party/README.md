# Bundled upstream Windows applications

These are **unaltered 32-bit Windows binaries**, executed by Aster's generic PE32/Wasm runtime. They are not JavaScript ports and are not rebuilt to fit Aster. Their original names, versions and licenses remain visible. `manifest.json` pins every shipped binary/support bundle and the corresponding TinyCC source by SHA-256.

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
