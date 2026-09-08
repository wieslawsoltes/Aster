#!/usr/bin/env python3
"""Build WineMine as a Windows PE32 app, not as a Wine runtime component.

Requires MinGW-w64 gcc/windres on the maintainer's build machine. The application
sources/resources are pinned and unchanged. The entry/debug shims replace Wine's
build environment only. The complete corresponding app source accompanies the
binary. No end-user toolchain or Wine installation is required.
"""
from pathlib import Path
import argparse, hashlib, json, os, re, shutil, subprocess, urllib.request, zipfile

ROOT = Path(__file__).resolve().parents[2]
REV = 'fd1153552d779e1ac14b0b1c48fbd1cde894eb0a'  # Wine 9.0, historical test fixture
FILES = {
    'main.c': 'cd0763042d389569ac074162b788b6d2984729ac',
    'dialog.c': '47412413381bb032d1c21587d408dfe9a97cac5d',
    'main.h': 'b3d95a2cc150727ce797d0da26f5c3409bb28c11',
    'resource.h': '7a576a6564d0d1b5818fafbb4ac23c78c86ff5a3',
    'winemine.rc': '1e1bdeae5bc5f31559ace67dfd9bdfaacf28a549',
    'faces.bmp': '77f20f441156df2bae0f34bd4f4440e7d60b83e4',
    'leds.bmp': '487c7095aa218d49b40cd26da5e26e8b7f449c7b',
    'mines.bmp': '6850b6eb8ee5446f018b619f3e4407d4ebb11958',
    'winemine.ico': '1c57b4e05492c434e6520896ce33e62123c1ba0e',
    'winemine.manifest': 'd0fe0a892c4d650054bfa302013b859e32dd4add',
}

def download(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Aster-Win32-fixture-build'}), timeout=40) as response:
        data = response.read(2 * 1024 * 1024 + 1)
    if len(data) > 2 * 1024 * 1024:
        raise ValueError('Upstream file exceeds source limit')
    return data

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'tests/win32/artifacts/winemine-build')
    parser.add_argument('--source', type=Path, help='Offline source tree from a previous artifact')
    args = parser.parse_args()
    out = args.output.resolve(); source = out / 'source'; source.mkdir(parents=True, exist_ok=True)
    records = {}
    for name, expected in FILES.items():
        url = f'https://raw.githubusercontent.com/wine-mirror/wine/{REV}/programs/winemine/{name}'
        data = (args.source / name).read_bytes() if args.source else download(url)
        blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        if blob != expected:
            raise ValueError(f'Upstream git blob mismatch: {name}')
        (source / name).write_bytes(data)
        records[name] = {'gitBlob': blob, 'sha256': hashlib.sha256(data).hexdigest(), 'url': url}
    license_url = f'https://raw.githubusercontent.com/wine-mirror/wine/{REV}/COPYING.LIB'
    license_data = (args.source / 'COPYING.LIB').read_bytes() if args.source else download(license_url)
    (source / 'COPYING.LIB').write_bytes(license_data)
    (source / 'wine').mkdir(exist_ok=True)
    (source / 'wine/debug.h').write_text('''/* Build-only replacements for disabled Wine debug tracing. */
#ifndef ASTER_WINE_DEBUG_SHIM
#define ASTER_WINE_DEBUG_SHIM
#define WINE_DEFAULT_DEBUG_CHANNEL(name)
#define WINE_TRACE(...) ((void)0)
#define WINE_WARN(...) ((void)0)
#define WINE_ERR(...) ((void)0)
#define WINE_FIXME(...) ((void)0)
#ifndef ARRAY_SIZE
#define ARRAY_SIZE(a) (sizeof(a) / sizeof((a)[0]))
#endif
#endif
''')
    wide = bool(re.search(r'\bwWinMain\s*\(', (source / 'main.c').read_text()))
    entry = 'wWinMain' if wide else 'WinMain'
    char = 'LPWSTR' if wide else 'LPSTR'
    (source / 'entry.c').write_text(f'''/* Aster fixture build entry. App main.c/dialog.c are unchanged. */
#include <windows.h>
int WINAPI {entry}(HINSTANCE, HINSTANCE, {char}, int);
void aster_entry(void) {{
    int result = {entry}(GetModuleHandleW(0), 0, ({char})L"", SW_SHOWNORMAL);
    ExitProcess(result);
}}
''')
    gcc = os.environ.get('MINGW_GCC', 'i686-w64-mingw32-gcc')
    windres = os.environ.get('MINGW_WINDRES', 'i686-w64-mingw32-windres')
    if not shutil.which(gcc) or not shutil.which(windres):
        raise SystemExit('Install gcc-mingw-w64-i686 and binutils-mingw-w64-i686 for fixture builds')
    subprocess.run([windres, '-I.', 'winemine.rc', '-O', 'coff', '-o', 'resources.o'], cwd=source, check=True)
    command = [gcc, '-Os', '-mno-sse', '-mno-sse2', '-mfpmath=387', '-fno-stack-protector',
               '-D__USE_MINGW_ANSI_STDIO=0', '-I.', '-include', 'wine/debug.h', '-nostartfiles', '-mwindows',
               '-Wl,--entry,_aster_entry,--no-insert-timestamp', '-o', str(out / 'winemine.exe'),
               'main.c', 'dialog.c', 'entry.c', 'resources.o', '-lcomctl32', '-lshell32',
               '-luser32', '-lgdi32', '-ladvapi32', '-lmsvcrt', '-lkernel32']
    subprocess.run(command, cwd=source, check=True)
    (source / 'resources.o').unlink()
    shutil.copyfile(__file__, source / 'build.py')
    with zipfile.ZipFile(out / 'winemine-source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob('*')):
            if path.is_file():
                info = zipfile.ZipInfo(path.relative_to(source).as_posix(), (2024, 1, 16, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())
    report = {'name': 'WineMine', 'sourceRevision': REV, 'license': 'LGPL-2.1-or-later',
              'sourceBuiltWindowsBinary': True, 'unchangedApplicationSources': True,
              'buildAdaptation': 'Standalone entry point and disabled debug-trace/build macros; no gameplay modifications.',
              'compiler': subprocess.check_output([gcc, '--version'], text=True).splitlines()[0],
              'command': command, 'files': records,
              'sha256': {name: hashlib.sha256((out / name).read_bytes()).hexdigest() for name in ['winemine.exe', 'winemine-source.zip']}}
    (out / 'provenance.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main()
