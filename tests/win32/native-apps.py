"""Independent native Windows reference for artifacts made by browser/Wasm execution.
This job is a TEST ONLY; Aster itself never connects to this Windows host.
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def main(evidence):
    if os.name != 'nt':
        raise SystemExit('This independent reference requires an actual Windows runner')
    output = ROOT / 'tests/win32/native-artifacts'
    output.mkdir(parents=True, exist_ok=True)
    report = {'tests': [], 'host': 'Native Windows, independent reference only', 'hashes': {}}
    seven = ROOT / 'src/win32/third-party/7zr.exe'
    tcc = ROOT / 'src/win32/third-party/tcc.exe'
    manifest = json.loads((ROOT / 'third-party/manifest.json').read_text())
    for item in manifest.values():
        for name, expected in item['sha256'].items():
            actual = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            assert actual == expected, name
            report['hashes'][name] = actual

    def run(command, cwd):
        proc = subprocess.run(list(map(str, command)), cwd=cwd, capture_output=True, timeout=60)
        assert proc.returncode == 0, (command, proc.returncode, proc.stdout, proc.stderr)
        return proc.stdout.decode('utf-8', errors='replace')

    try:
        # Check both Node-hosted Wasm and actual browser-Worker products on Windows.
        groups = [('compat', 'emulated.7z', ['payload.txt', 'binary.bin'], 'compiled.exe'),
                  ('real-apps', 'browser-created.7z', ['welcome.txt'], 'browser-compiled.exe'),
                  ('standalone-apps', 'browser-created.7z', ['welcome.txt'], 'browser-compiled.exe')]
        for group, archive, names, executable in groups:
            folder = evidence / 'tests/win32/artifacts' / group
            assert folder.is_dir(), folder
            with tempfile.TemporaryDirectory() as tmp:
                work = Path(tmp)
                test_output = run([seven, 't', folder / archive, '-mmt=off'], work)
                run([seven, 'x', folder / archive, '-mmt=off', '-aoa'], work)
                for name in names:
                    assert (work / name).read_bytes() == (folder / name).read_bytes(), name
                report['tests'].append({'test': group + ' archive accepted by native 7-Zip; all bytes match', 'status': 'PASS', 'output': test_output})
                exe = folder / executable
                stdout = run([exe], work)
                actual = (work / 'compiled-result.txt').read_bytes().replace(b'\r\n', b'\n')
                assert actual == b'TCC compiled inside Aster: 3726872593\n', actual
                assert 'Hello from a real Windows EXE compiled inside Aster!' in stdout
                report['tests'].append({'test': group + ' compiler-produced EXE runs on native Windows', 'status': 'PASS', 'sha256': hashlib.sha256(exe.read_bytes()).hexdigest(), 'stdout': stdout, 'computedFile': actual.decode()})
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / 'tcc.exe').write_bytes(tcc.read_bytes())
            for entry in json.loads((ROOT / 'src/win32/third-party/tcc-files.json').read_text()):
                path = work / entry['path']
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(base64.b64decode(entry['base64'], validate=True))
            (work / 'hello-aster.c').write_bytes((ROOT / 'examples/win32/hello-aster.txt').read_bytes())
            run([work / 'tcc.exe', '-o', 'native-compiled.exe', 'hello-aster.c'], work)
            stdout = run([work / 'native-compiled.exe'], work)
            text = (work / 'compiled-result.txt').read_text()
            assert text == 'TCC compiled inside Aster: 3726872593\n', text
            report['tests'].append({'test': 'Same upstream TinyCC and headers compile the same C source on native Windows', 'status': 'PASS', 'stdout': stdout, 'computedFile': text})
        report['success'] = True
    except Exception as error:
        report['success'] = False
        report['error'] = str(error)
        raise
    finally:
        (output / 'native-apps.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=Path, required=True)
    main(parser.parse_args().evidence.resolve())
