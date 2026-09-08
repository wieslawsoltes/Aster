# Theme verification

This suite was reconstructed after discovering the original source transfer was
truncated. Nineteen complete source delta records were recovered with their original
before/after SHA-256 checks; the CSS tail, window work-area integration, guest color
transport and this test suite were completed separately. The old claimed 21/104
results are not used as evidence for this revision.

```sh
node --test tests/themes/models.cjs tests/themes/win32.cjs
python build.py
python tests/themes/browser.py
python tests/themes/browser.py --standalone
python tests/themes/browser.py --gpu --headed
# Actual Windows only:
python tests/themes/native.py
```

The 19 format/model checks use independent zlib decoding references, theme/asset
bounds, Windows INI interchange, CAB validation and CUR/ANI/WAV fixtures. Six guest
checks cover per-process system colors, stable stock brushes, ordinary Win32 theme
messages, bounded coalescing, invalid updates and a real x86 import-thunk call.

Browser tests use production Settings controls, taskbar/menu handlers, file chooser,
real CAB Workers, actual WAV decode, and a running compiled Windows EXE. They verify
live window identity/unsaved text, preset layout, dock/Start geometry, custom themes,
local images, disposal, zero page exceptions and malformed input rejection. Normal
HTTP and standalone add full-page IndexedDB reload and recovery-URL checks. Standalone
also reloads offline. WebGPU mode requires actual WebGPU desktop and guest surfaces
and a GDI pixel readback; Linux CI uses software Vulkan, not hardware benchmarks.

`--inject --browser /usr/bin/chromium` is a restricted-environment fallback. It is
memory-only evidence, not proof of normal URL loading, durable storage or GPU use.

The native Windows oracle uses expand.exe on an Aster-generated CAB and makecab.exe
MSZIP output on a multi-block input, comparing every output byte. USER32 actually
loads the original static/animated cursor files. An independent Python WAV parser
checks the sound fixture. It does not install themes or exercise native .msstyles.

Assertions are not retried into success. The source recovery/import workflows are
removed from the branch before final CI and merge; only reusable tests remain.
