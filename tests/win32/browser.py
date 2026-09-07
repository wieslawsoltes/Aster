"""End-to-end PE32 execution in Chromium. No Wine or executable hosting.
Normal: python tests/win32/browser.py --gpu
Restricted test environment: --inject --browser /usr/bin/chromium (no GPU/durable claims).
"""
import argparse, hashlib, io, json, sys, threading, time
from PIL import Image
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tests/win32/artifacts';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main(args):
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/'
    report={'tests':[],'errors':[],'requests':[],'mode':'injected opaque-origin' if args.inject else 'HTTP + file standalone','gpuRequired':args.gpu}
    with sync_playwright() as p:
        flags=['--no-sandbox']
        if args.gpu: flags+=['--enable-unsafe-webgpu']
        if args.gpu and sys.platform.startswith('linux'): flags+=['--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']
        options={'headless':not args.headed,'args':flags}
        if args.browser:options['executable_path']=args.browser
        browser=p.chromium.launch(**options);context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block',accept_downloads=True)
        page=context.new_page();page.set_default_timeout(45000 if args.gpu else 15000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m: print('BROWSER',m.text,flush=True) if m.type=='error' else None)
        page.on('request',lambda r:report['requests'].append({'url':r.url,'method':r.method}))
        page.add_init_script('window.ASTER_WIN32_REQUIRE_GPU='+str(args.gpu).lower())
        def boot():
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto(url,wait_until='networkidle')
            page.wait_for_function('window.Aster?.booted');page.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);Aster.settings.motion=false;Aster.applySettings();document.querySelectorAll(".toast").forEach(t=>t.remove());window.w=Aster.launch("win32");await w.ready;}')
        def check(name,fn):
            start=time.perf_counter()
            try:detail=fn();report['tests'].append({'name':name,'status':'PASS','ms':(time.perf_counter()-start)*1000,'detail':detail});print('PASS',name,flush=True)
            except Exception as e:
                report['tests'].append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True)
                try:
                    report['failureState']=page.evaluate('({phase:document.querySelector(".win32-status")?.innerText,log:document.querySelector(".win32-diagnostics pre")?.textContent,session:window.w?.win32Session?{failed:w.win32Session.failed,closed:w.win32Session.closed,key:w.win32Session.key,worker:!!w.win32Session.worker,renderer:w.win32Session.renderer?.stats(),stats:w.win32Session.stats}:null})');page.screenshot(path=str(OUT/'failure.png'))
                except Exception:pass
                raise
        def sample(name):
            page.get_by_label('Win32 sample').select_option(name);page.get_by_role('button',name='Run sample',exact=True).click()
        def upload(name,data=None):
            with page.expect_file_chooser() as chosen:page.get_by_role('button',name='Open .exe',exact=True).click()
            chosen.value.set_files({'name':name,'mimeType':'application/octet-stream','buffer':data} if data is not None else str(ROOT/'src/win32/examples'/name))
            page.get_by_role('button',name='Run selected',exact=True).click()
        def stopped():page.wait_for_function('!w.win32Session.worker')
        def stop():
            if page.get_by_role('button',name='Stop',exact=True).is_enabled():page.get_by_role('button',name='Stop',exact=True).click()
            stopped()
        phrase='An actual Windows program saved this.\nZażółć gęślą jaźń — 123'
        try:
            boot();report['environment']=page.evaluate('({ua:navigator.userAgent,secure:isSecureContext,storage:Aster.db.mode,gpuAPI:!!navigator.gpu})')
            check('SHA-256 application-drive identity',lambda:assert_digest(page))
            if args.gpu:
                def pipeline_probe():
                    return page.evaluate("""async()=>{const el=document.createElement('div');document.body.append(el);const g=new AsterGDI(el,64,64,{requireGPU:true});try{await g.init();g.enqueue([{op:'rect',x:0,y:0,w:64,h:64,color:[12,34,56,255]}]);const pixel=await g.pixel(10,10);if(pixel.join(',')!=='12,34,56,255')throw Error('WebGPU pixel mismatch: '+pixel);return g.stats();}finally{g.destroy();el.remove();}}""")
                check('WebGPU pipeline initializes and renders a verified pixel',pipeline_probe)
            def no_animation_frames():
                return page.evaluate("""async()=>{const el=document.createElement('div');document.body.append(el);const saved=window.requestAnimationFrame;const g=new AsterGDI(el,64,64,{requireGPU:!!window.ASTER_WIN32_REQUIRE_GPU});try{await g.init();window.requestAnimationFrame=()=>0;for(let n=0;n<40;n++)await g.submit([{op:'rect',x:0,y:0,w:64,h:64,color:[n,34,56,255]}]);const pixel=await g.pixel(10,10);if(pixel.join(',')!=='39,34,56,255')throw Error('Render did not progress without rAF');if(g.pending.length||g.stats().peakQueuedCommands!==1)throw Error('Drawing backlog grew');return g.stats();}finally{window.requestAnimationFrame=saved;g.destroy();el.remove();}}""")
            check('Rendering progresses with animation callbacks suspended and stays bounded',no_animation_frames)
            def hello():
                sample('hello');page.wait_for_selector('.win32-messagebox');assert 'Zażółć' in page.locator('.win32-messagebox').inner_text();page.get_by_role('button',name='Cancel',exact=True).click();page.wait_for_function('w.win32Session.exitCode===2');stopped();return page.evaluate('w.win32Session.stats')
            check('PE32 MessageBoxW executes and resumes with Cancel result',hello)
            def pad():
                upload('pad.exe');page.wait_for_selector('.win32-edit');page.locator('.win32-edit').fill(phrase);page.get_by_role('button',name='Save note',exact=True).click();page.wait_for_function('w.win32Session.files.has("note.txt")');page.evaluate('w.win32Session.persist')
                data=page.evaluate('Array.from(w.win32Session.files.get("note.txt"))');assert bytes(data).decode('utf-16-le')==phrase.replace('\n','\r\n');assert page.evaluate('w.win32Session.image.missing.length')==0
                mode=page.evaluate('w.win32Session.renderer.mode');assert not args.gpu or mode=='WebGPU';return {'renderer':mode,'bytes':len(data),'apiCalls':page.evaluate('w.win32Session.stats.apiCounts')}
            check('User-selected EXE creates controls and saves Unicode with Win32 WriteFile',pad)
            def readback():
                page.get_by_role('button',name='Clear',exact=True).click();page.wait_for_function('document.querySelector(".win32-edit").value===""');page.get_by_role('button',name='Load note',exact=True).click();page.wait_for_function('document.querySelector(".win32-edit").value=== '+json.dumps(phrase));page.screenshot(path=str(OUT/'win32-pad.png'));return page.evaluate('w.win32Session.stats.apiCounts')
            check('Win32 ReadFile restores the exact text into EDIT',readback)
            def restart():
                stop();page.get_by_role('button',name='Run selected',exact=True).click();page.wait_for_selector('.win32-edit');page.get_by_role('button',name='Load note',exact=True).click();page.wait_for_function('document.querySelector(".win32-edit").value=== '+json.dumps(phrase));stop();return 'Same executable SHA-256 restored its private drive'
            check('Process restart reloads saved C: data',restart)
            if not args.inject:
                def reload():
                    boot();assert page.evaluate('Aster.db.mode')=='IndexedDB';upload('pad.exe');page.wait_for_selector('.win32-edit');page.get_by_role('button',name='Load note',exact=True).click();page.wait_for_function('document.querySelector(".win32-edit").value=== '+json.dumps(phrase));stop();return 'IndexedDB survived full page navigation'
                check('Full page reload preserves the private C: drive',reload)
            def graphics():
                sample('gdi');page.wait_for_function('w.win32Session.renderer?.frames>=3');assert not args.gpu or page.evaluate('w.win32Session.renderer.mode')=='WebGPU'
                assert page.evaluate('w.win32Session.renderer.pixel(5,5)')==[16,23,42,255]
                canvas=page.locator('.win32-canvas');box=canvas.bounding_box();canvas.click(position={'x':400*box['width']/680,'y':340*box['height']/460});canvas.press('Space')
                page.wait_for_function('w.win32Session.stats.apiCounts?.["user32.dll!KillTimer"]>=1');page.wait_for_timeout(150)
                pixel=page.evaluate('w.win32Session.renderer.pixel(400,340)');assert pixel==[69,203,166,255],pixel
                g=page.evaluate('w.win32Session.renderer.stats()');assert g['errors']==[];assert g['peakQueuedCommands']<=4096;assert g['acknowledgedBatches']>0
                if args.gpu:assert g['glyphs']>10 and g['drawCalls']==g['frames']*2
                png=page.screenshot(path=str(OUT/'win32-gdi.png'));image=Image.open(io.BytesIO(png)).convert('RGB');screen=image.getpixel((round(box['x']+400*box['width']/680),round(box['y']+340*box['height']/460)));assert list(screen)==pixel[:3],('Presented canvas differs from GPU readback',screen,pixel);detail={'renderer':g,'cpu':page.evaluate('w.win32Session.stats'),'readyMs':page.evaluate('w.win32Session.readyMs'),'clickedPixel':pixel,'screenshotPixel':list(screen)};stop();return detail
            check('GDI primitives, text, mouse and WM_TIMER use the actual render target',graphics)
            def compute():
                sample('compute');page.wait_for_function('w.win32Session.files.has("checksum.txt")');stopped();assert bytes(page.evaluate('Array.from(w.win32Session.files.get("checksum.txt"))')).decode()=='4248471154\n';return page.evaluate('w.win32Session.stats')
            check('Integer EXE calculates and writes the expected checksum',compute)
            def incompatible():
                data=(ROOT/'src/win32/examples/hello.exe').read_bytes().replace(b'MessageBoxW',b'MissingCall');upload('unsupported.exe',data);page.wait_for_function('w.win32Session.failed');assert 'MissingCall' in page.locator('.win32-status').inner_text();assert page.evaluate('w.win32Session.stats.instructions')==0;return 'Missing import reported; no guest code executed'
            check('Unsupported imports produce a clear failure, not a mock app',incompatible)
            def busy():
                data=bytearray((ROOT/'src/win32/examples/compute.exe').read_bytes());pe=int.from_bytes(data[60:64],'little');opt=pe+24;entry=int.from_bytes(data[opt+16:opt+20],'little');sections=opt+int.from_bytes(data[pe+20:pe+22],'little')
                for i in range(int.from_bytes(data[pe+6:pe+8],'little')):
                    s=sections+i*40;rva=int.from_bytes(data[s+12:s+16],'little');size=int.from_bytes(data[s+16:s+20],'little');raw=int.from_bytes(data[s+20:s+24],'little')
                    if rva<=entry<rva+size:data[raw+entry-rva:raw+entry-rva+2]=b'\xeb\xfe';break
                upload('busy-loop.exe',bytes(data));page.wait_for_function('w.win32Session.stats.instructions>10000');page.evaluate('async()=>{const c=Aster.launch("calculator");await c.ready;await c.close(true)}');stop();assert page.get_by_role('button',name='Run sample',exact=True).is_enabled();return 'Main desktop responded while the Worker executed an infinite x86 loop; Stop terminated it'
            check('Busy EXE cannot monopolize the desktop main thread',busy)
            def standalone():
                other=context.new_page();other.set_default_timeout(15000)
                if args.inject:other.set_content((ROOT/'Aster.html').read_text())
                else:other.goto((ROOT/'Aster.html').as_uri(),wait_until='load')
                other.wait_for_function('window.Aster?.booted');other.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);window.w=Aster.launch("win32");await w.ready;}')
                context.set_offline(True);other.get_by_label('Win32 sample').select_option('compute');other.get_by_role('button',name='Run sample',exact=True).click();other.wait_for_function('w.win32Session.files.has("checksum.txt")');assert bytes(other.evaluate('Array.from(w.win32Session.files.get("checksum.txt"))')).decode()=='4248471154\n';other.close();context.set_offline(False);return 'Standalone HTML executed PE32 with network disabled'
            check('Offline standalone HTML includes the complete executable runtime',standalone)
            check('No uncaught JavaScript errors',lambda:assert_empty(report['errors']))
            check('No executable upload or remote execution requests',lambda:assert_requests(report['requests'],url))
        finally:
            report['limitations']=['No physical-GPU speed benchmark. --gpu uses Chromium SwiftShader to execute real WebGPU commands.','Four original compiled samples, not general Windows compatibility.']+(['Injected mode does not verify durable IndexedDB, HTTPS or WebGPU.'] if args.inject else [])
            (OUT/'browser-results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
    print(json.dumps({'passed':len(report['tests']),'report':str(OUT/'browser-results.json')},indent=2))
def assert_digest(page):
    value=page.evaluate('Aster.win32.digest(new TextEncoder().encode("abc"))');assert value==hashlib.sha256(b'abc').hexdigest();return value
def assert_empty(errors):assert not errors,errors;return 'No errors'
def assert_requests(requests,url):
    assert all(r['method']=='GET' and (r['url'].startswith(url) or r['url'].startswith('blob:') or r['url'].startswith('data:')) for r in requests),requests
    return str(len(requests))+' local/static GET requests; no POST, WebSocket or remote host'
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--gpu',action='store_true');parser.add_argument('--headed',action='store_true');parser.add_argument('--inject',action='store_true');parser.add_argument('--browser');main(parser.parse_args())
