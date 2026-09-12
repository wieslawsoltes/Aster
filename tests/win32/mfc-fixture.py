#!/usr/bin/env python3
"""Fetch and verify the unchanged public MFC regression target; never execute it.

The executable hash is from the user's BatchEncoder.exe, not from a rebuilt or
patched sample. Acquisition is explicit test infrastructure, never app startup.
"""
import argparse
import hashlib
import io
import json
import struct
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

URL = 'https://github.com/wieslawsoltes/BatchEncoder/releases/download/5.1/BatchEncoder-5.1-Win32.zip'
SHA256 = 'ffb606292bad46bf0b3724630167f9d3d860eb37574da696fe7d28aecceff913'
MAX_ARCHIVE = 2 * 1024 * 1024
MAX_CONTENTS = 16 * 1024 * 1024


def acquire(output, source=None):
    if source:
        data = Path(source).read_bytes()
    else:
        request = urllib.request.Request(URL, headers={'User-Agent': 'Aster-MFC-regression/1'})
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read(MAX_ARCHIVE + 1)
    if len(data) > MAX_ARCHIVE:
        raise ValueError('Fixture archive exceeds quota')
    files = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 512 or sum(i.file_size for i in entries) > MAX_CONTENTS:
            raise ValueError('Fixture content exceeds quota')
        for info in entries:
            path = PurePosixPath(info.filename.replace('\\', '/'))
            if path.is_absolute() or '..' in path.parts or ':' in str(path):
                raise ValueError('Unsafe fixture path')
            if info.is_dir():
                continue
            key = str(path)
            if key.casefold() in {p.casefold() for p in files}:
                raise ValueError('Duplicate fixture entry')
            files[key] = archive.read(info)
    executable = [p for p in files if PurePosixPath(p).name.lower() == 'batchencoder.exe']
    if len(executable) != 1:
        raise ValueError('Expected exactly one BatchEncoder.exe')
    binary = files[executable[0]]
    if len(binary) != 1268736 or hashlib.sha256(binary).hexdigest() != SHA256:
        raise ValueError('Public executable differs from the supplied original')
    pe = struct.unpack_from('<I', binary, 0x3c)[0]
    if binary[:2] != b'MZ' or binary[pe:pe+4] != b'PE\0\0' or struct.unpack_from('<H', binary, pe+4)[0] != 0x14c:
        raise ValueError('Expected the original i386 PE32 application')
    output.mkdir(parents=True, exist_ok=True)
    (output/'BatchEncoder-5.1-Win32.zip').write_bytes(data)
    (output/'provenance.json').write_text(json.dumps({
        'source': URL, 'license': 'MIT', 'upstream': 'wieslawsoltes/BatchEncoder',
        'sourceTag': '5.1', 'binaryPath': executable[0], 'binarySHA256': SHA256,
        'binaryBytes': len(binary), 'archiveSHA256': hashlib.sha256(data).hexdigest(),
        'files': {p: hashlib.sha256(b).hexdigest() for p, b in sorted(files.items())},
        'verification': 'Unmodified public executable equals the user-supplied executable; not a runtime pass.'
    }, indent=2), encoding='utf-8')
    print(f'Verified original BatchEncoder PE32 and {len(files)} portable files: {SHA256}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).parent/'artifacts/mfc-fixture')
    args = parser.parse_args()
    acquire(args.output, args.source)
