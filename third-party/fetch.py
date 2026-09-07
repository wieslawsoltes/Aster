#!/usr/bin/env python3
"""Retrieve hash-pinned upstream fixtures; never execute downloaded programs."""
import base64
import hashlib
import io
import json
import tarfile
from pathlib import Path, PurePosixPath
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / 'third-party/manifest.json').read_text())

def fetch(url, expected):
    request = urllib.request.Request(url, headers={'User-Agent': 'Aster-reproducible-fixture-builder'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(16*1024*1024+1)
    if len(data) > 16*1024*1024 or hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Upstream fixture checksum/size mismatch: ' + url)
    return data

def main():
    seven, tcc = MANIFEST['7zr'], MANIFEST['tinycc']
    products = {seven['path']: fetch(seven['binaryURL'], seven['sha256'][seven['path']]),
                tcc['sourcePath']: fetch(tcc['sourceURL'], tcc['sha256'][tcc['sourcePath']])}
    archive = zipfile.ZipFile(io.BytesIO(fetch(tcc['distributionURL'], tcc['distributionSHA256'])))
    candidates = {}
    for item in archive.infolist():
        path = PurePosixPath(item.filename)
        if path.is_absolute() or '..' in path.parts or item.is_dir():
            continue
        if path.parts[0] != 'tcc':
            continue
        name = '/'.join(path.parts[1:])
        if name == 'tcc.exe':
            products[tcc['path']] = archive.read(item)
        elif name == 'libtcc.dll' or name.startswith('include/') or name in ['lib/gdi32.def','lib/kernel32.def','lib/libtcc1-32.a','lib/msvcrt.def','lib/user32.def']:
            if item.file_size > 2*1024*1024 or name in candidates:
                raise ValueError('Unexpected support file')
            candidates[name] = archive.read(item)
    records = [{'path': name, 'base64': base64.b64encode(data).decode()} for name, data in sorted(candidates.items())]
    # Keep the committed serialization byte-for-byte reproducible.
    products[tcc['supportPath']] = (json.dumps(records, separators=(',', ':'))+'\n').encode()
    for item in MANIFEST.values():
        for path, expected in item['sha256'].items():
            if hashlib.sha256(products[path]).hexdigest() != expected:
                raise ValueError('Repacked fixture mismatch: ' + path)
    with tarfile.open(fileobj=io.BytesIO(products[tcc['sourcePath']]), mode='r:bz2') as source:
        license_bytes = source.extractfile('tcc-0.9.27/COPYING').read()
    products['third-party/tinycc/COPYING'] = license_bytes
    products['third-party/tinycc/tcc-win32.txt'] = archive.read('tcc/doc/tcc-win32.txt')
    products['src/win32/third-party/NOTICE.txt'] = (ROOT/'third-party/notice-prefix.txt').read_bytes() + license_bytes
    for path, data in products.items():
        destination = ROOT / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        print(path, len(data), hashlib.sha256(data).hexdigest())

if __name__ == '__main__':
    main()
