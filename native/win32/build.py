#!/usr/bin/env python3
"""Rebuild the browser CPU and original Windows EXEs using LLVM; no Windows SDK.
End users do not run this script. Prebuilt WASM and PE32 samples are committed.
"""
import argparse, os, re, shutil, struct, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def tool(name):
    value=os.environ.get(name.upper().replace('-','_')) or shutil.which(name)
    if not value: raise SystemExit(f'Missing build-only tool: {name}')
    return value
def run(args): subprocess.run([str(a) for a in args],check=True)
def build():
    clang,link,ar=tool('clang'),tool('lld-link'),tool('llvm-ar')
    run([clang,'--target=wasm32','-O3','-ffreestanding','-fno-builtin','-nostdlib',ROOT/'native/win32/x86.c','-Wl,--no-entry','-Wl,--export-all','-Wl,--initial-memory=83886080','-Wl,--max-memory=83886080','-Wl,-z,stack-size=1048576','-Wl,--strip-all','-o',ROOT/'src/win32/x86.wasm'])
    header=(ROOT/'examples/win32/miniwin.h').read_text()
    with tempfile.TemporaryDirectory() as temporary:
        tmp=Path(temporary);objects=[]
        for dll,name,count in re.findall(r'^API\((\w+),[^,]+,(\w+),[^;]+?,(\d+)\);',header,re.M):
            # COFF short import objects, IMPORT_NAME_UNDECORATE. Real Windows
            # receives ExitProcess, while the linker sees _ExitProcess@4.
            symbol=f'_{name}@{int(count)*4}'
            data=symbol.encode()+b'\0'+(dll+'.dll').encode()+b'\0'
            path=tmp/(name+'.obj');path.write_bytes(struct.pack('<HHHHIIHH',0,65535,0,0x14c,0,len(data),0,3<<2)+data);objects.append(path)
        run([ar,'rcs',tmp/'win32.a',*objects])
        output=ROOT/'src/win32/examples';output.mkdir(exist_ok=True)
        for source in sorted((ROOT/'examples/win32').glob('*.c')):
            obj=tmp/(source.stem+'.obj')
            run([clang,'--target=i686-pc-windows-msvc','-O2','-ffreestanding','-fno-builtin','-fno-stack-protector','-mno-sse','-mno-sse2','-c',source,'-o',obj])
            run([link,'/entry:entry','/subsystem:windows','/machine:x86','/nodefaultlib','/safeseh:no','/timestamp:0','/out:'+str(output/(source.stem+'.exe')),obj,tmp/'win32.a'])
    print('Built WebAssembly CPU and four standard PE32 examples.')
if __name__=='__main__': build()
