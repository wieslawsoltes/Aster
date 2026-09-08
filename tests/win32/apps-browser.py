"""Unmodified 7-Zip and TinyCC EXEs in actual browser Workers, offline after asset loading.
These tests use the user-facing controls; no Windows process/remote execution service.
"""
import argparse
import base64
import hashlib
import json
import sys
import threading
import time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

def main(args):
    output = ROOT / args.output
    output.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    report = {'tests': [], 'errors': [], 'requests': [], 'execution': 'browser Worker + WebAssembly',
              'mode': 'injected' if args.inject else 'standalone file' if args.standalone else 'static HTTP',
              'limitations': ['No physical-GPU performance claim.', 'The original upstream binaries are not recompiled for these tests.']}
    try:
        with sync_playwright() as p:
            flags = ['--no-sandbox']
            if args.gpu:
                flags += ['--enable-unsafe-webgpu']
                if sys.platform.startswith('linux'):
                    flags += ['--enable-features=Vulkan', '--use-angle=vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--disable-vulkan-surface']
            options = {'headless': not args.headed, 'args': flags}
            if args.browser:
                options['executable_path'] = args.browser
            browser = p.chromium.launch(**options)
            context = browser.new_context(viewport={'width': 1440, 'height': 1000}, service_workers='block', accept_downloads=True)
            page = context.new_page()
            page.set_default_timeout(45000)
            page.on('pageerror', lambda e: report['errors'].append(str(e)))
            page.on('request', lambda r: report['requests'].append({'method': r.method, 'url': r.url}))
            if args.inject:
                page.set_content((ROOT / 'Aster.html').read_text())
            else:
                page.goto((ROOT / 'Aster.html').as_uri() if args.standalone else f'http://127.0.0.1:{server.server_port}/', wait_until='networkidle')
            page.wait_for_function('window.Aster?.booted')
            page.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);Aster.settings.motion=false;Aster.applySettings();document.querySelectorAll(".toast").forEach(t=>t.remove());window.w=Aster.launch("win32");await w.ready;}')
            report['environment'] = page.evaluate('({userAgent:navigator.userAgent,storage:Aster.db.mode,secure:isSecureContext,gpuAPI:!!navigator.gpu})')
            # Ordinary static resources only. All execution below happens with networking disabled.
            page.evaluate("Promise.all(['pe.js','runtime.js','compat.js','resources.js','registry.js','gui.js','bitmaps.js','worker.js','x86.wasm','third-party/7zr.exe','third-party/tcc.exe','third-party/tcc-files.json'].map(p=>Aster.win32.asset('src/win32/'+p)))")
            report['requestsBeforeOffline'] = len(report['requests'])
            context.set_offline(True)

            def check(name, function):
                start = time.perf_counter()
                try:
                    detail = function()
                    report['tests'].append({'name': name, 'status': 'PASS', 'ms': round((time.perf_counter()-start)*1000, 2), 'detail': detail})
                    print('PASS', name, flush=True)
                except Exception as error:
                    report['tests'].append({'name': name, 'status': 'FAIL', 'error': str(error)})
                    report['failureState'] = page.evaluate('({status:document.querySelector(".win32-status")?.innerText,console:document.querySelector(".win32-console")?.innerText,diagnostics:document.querySelector(".win32-diagnostics pre")?.innerText})')
                    page.screenshot(path=str(output / 'failure.png'))
                    raise

            def completed():
                page.wait_for_function('window.w?.win32Session && !w.win32Session.worker && (w.win32Session.exitCode!==null || w.win32Session.failed)')
                detail = page.evaluate('({failed:!!w.win32Session.failed,exitCode:w.win32Session.exitCode,stats:w.win32Session.stats,output:w.win32Session.output})')
                assert not detail['failed'], detail
                assert detail['exitCode'] == 0, detail
                page.evaluate('w.win32Session.persist')
                return detail

            def sample(name):
                page.get_by_label('Win32 sample').select_option(name)
                page.get_by_role('button', name='Run sample', exact=True).click()
                return completed()

            def run(arguments):
                old = page.evaluate('w.win32Session.started')
                page.get_by_label('Windows command line arguments').fill(arguments)
                page.get_by_role('button', name='Run selected', exact=True).click()
                page.wait_for_function('w.win32Session.started !== ' + str(old))
                return completed()

            def file_bytes(name):
                return bytes(page.evaluate('(name)=>Array.from(w.win32Session.files.get(name)||[])', name))

            def seven_create():
                detail = sample('7zr')
                data = file_bytes('sample.7z')
                assert data[:6] == b'7z\xbc\xaf\x27\x1c'
                assert 'Everything is Ok' in page.get_by_label('Windows console output').inner_text()
                assert detail['stats']['instructions'] > 1000
                (output / 'browser-created.7z').write_bytes(data)
                (output / 'welcome.txt').write_bytes(file_bytes('welcome.txt'))
                page.screenshot(path=str(output / '7zip-create.png'))
                return {**detail, 'archiveBytes': len(data), 'archiveSHA256': hashlib.sha256(data).hexdigest()}
            check('Original 7-Zip creates a real archive offline using its Windows machine code', seven_create)
            check('Fresh browser Worker tests the persisted archive', lambda: run('t sample.7z -mmt=off'))

            def independent():
                with page.expect_file_chooser() as chosen:
                    page.get_by_role('button', name='Import files', exact=True).click()
                chosen.value.set_files(str(ROOT / 'tests/win32/fixtures/independent.7z'))
                page.wait_for_function('w.win32Session.files.has("independent.7z")')
                assert not file_bytes('independent.txt')
                detail = run('x independent.7z -mmt=off -aoa')
                assert file_bytes('independent.txt') == b'Independent archive created by py7zr\n'
                page.screenshot(path=str(output / '7zip-extract.png'))
                return detail
            check('File picker imports an independent archive; 7-Zip extracts its exact contents', independent)

            def tcc_compile():
                detail = sample('tcc')
                data = file_bytes('hello-aster.exe')
                assert data[:2] == b'MZ'
                assert detail['stats']['instructions'] > 1000
                assert detail['stats']['apiCounts']['msvcrt.dll!fwrite'] > 0
                (output / 'browser-compiled.exe').write_bytes(data)
                page.get_by_role('button', name='Files', exact=True).click() if page.locator('.win32-files').is_hidden() else None
                page.screenshot(path=str(output / 'tinycc-compiled.png'))
                return {**detail, 'exeBytes': len(data), 'exeSHA256': hashlib.sha256(data).hexdigest()}
            check('Original TinyCC with its original DLL compiles normal C into a Windows EXE offline', tcc_compile)

            def generated():
                row = page.locator('.win32-file-row').filter(has=page.locator('span', has_text='hello-aster.exe ·'))
                row.get_by_role('button', name='Run EXE', exact=True).click()
                page.wait_for_function('[...Aster.windows.values()].some(q=>q.id!==w.id && q.win32Session?.name==="hello-aster.exe")')
                page.evaluate('window.w=[...Aster.windows.values()].find(q=>q.id!==w.id && q.win32Session?.name==="hello-aster.exe")')
                detail = completed()
                assert file_bytes('compiled-result.txt') == b'TCC compiled inside Aster: 3726872593\n'
                assert 'Hello from a real Windows EXE compiled inside Aster!' in detail['output']
                page.screenshot(path=str(output / 'tinycc-generated-exe.png'))
                return detail
            check('Run EXE executes the compiler output in a new Worker and verifies its computed file', generated)

            def network():
                extra = [r for r in report['requests'][report['requestsBeforeOffline']:] if r['url'].startswith(('http:', 'https:', 'ws:', 'wss:'))]
                assert not extra, extra
                assert not report['errors'], report['errors']
                return 'No network requests during execution; no uncaught browser exceptions'
            check('All application operations completed with networking disabled and no backend', network)
            browser.close()
    except Exception as error:
        report['failure'] = str(error)
        print('FAIL', error, flush=True)
    finally:
        server.shutdown()
        report['passed'] = sum(t['status'] == 'PASS' for t in report['tests'])
        report['failed'] = sum(t['status'] == 'FAIL' for t in report['tests']) + int('failure' in report and not any(t['status'] == 'FAIL' for t in report['tests']))
        (output / 'results.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({'passed': report['passed'], 'failed': report['failed'], 'report': str(output / 'results.json')}), flush=True)
    return bool(report['failed'])

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--inject', action='store_true')
    parser.add_argument('--standalone', action='store_true')
    parser.add_argument('--gpu', action='store_true')
    parser.add_argument('--headed', action='store_true')
    parser.add_argument('--browser')
    parser.add_argument('--output', default='tests/win32/artifacts/real-apps')
    raise SystemExit(main(parser.parse_args()))
