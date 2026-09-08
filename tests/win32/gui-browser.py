"""Actual WineMine PE32 GUI interaction, WebGPU readback and virtual registry persistence.
No Wine runtime, remote executable host, or per-application JavaScript is used.
"""
import argparse, hashlib, io, json, sys, threading, time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main(args):
    out=ROOT/'tests/win32/artifacts/gui';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/'
    report={'tests':[],'errors':[],'requests':[],'gpuRequired':args.gpu,'injected':args.inject,'executableSha256':hashlib.sha256((ROOT/'src/win32/third-party/winemine.exe').read_bytes()).hexdigest()}
    with sync_playwright() as p:
        flags=['--no-sandbox']
        if args.gpu:flags+=['--enable-unsafe-webgpu']
        if args.gpu and sys.platform.startswith('linux'):flags+=['--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']
        options={'headless':not args.headed,'args':flags}
        if args.browser:options['executable_path']=args.browser
        browser=p.chromium.launch(**options);context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
        page=context.new_page();page.set_default_timeout(30000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('console',lambda m:print('BROWSER',m.type,m.text,flush=True) if m.type=='error' else None)
        page.on('request',lambda r:report['requests'].append({'url':r.url,'method':r.method}))
        page.add_init_script('window.ASTER_WIN32_REQUIRE_GPU='+str(args.gpu).lower())
        def check(name,fn):
            start=time.perf_counter()
            try:detail=fn();report['tests'].append({'name':name,'status':'PASS','ms':(time.perf_counter()-start)*1000,'detail':detail});print('PASS',name,flush=True)
            except Exception as e:
                report['tests'].append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True)
                try:report['failureState']=page.evaluate('({status:document.querySelector(".win32-status")?.textContent,log:document.querySelector(".win32-diagnostics pre")?.textContent,stats:window.w?.win32Session?.stats,views:[...(window.w?.win32Session?.guiHost?.views||[])].map(([h,v])=>({h,w:v.width,hgt:v.height,dialog:v.dialog,visible:v.visible})),controls:[...document.querySelectorAll("[data-control-id]")].map(e=>({id:e.dataset.controlId,text:e.textContent,value:e.value,hidden:e.hidden}))})');page.screenshot(path=str(out/'failure.png'))
                except Exception:pass
                raise
        def boot(standalone=False):
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if standalone else url,wait_until='load')
            page.wait_for_function('window.Aster?.booted');page.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);Aster.settings.motion=false;Aster.applySettings();window.w=Aster.launch("win32");await w.ready;}')
        def launch():
            page.get_by_label('Win32 sample').select_option('winemine');page.get_by_role('button',name='Run sample',exact=True).click();page.wait_for_function('w.win32Session?.renderer?.frames>=2 || w.win32Session?.failed')
            assert not page.evaluate('w.win32Session.failed'),page.locator('.win32-status').inner_text()
        def shape():return page.evaluate('({width:w.win32Session.width,height:w.win32Session.height})')
        def canvas():return page.locator('.win32-guest-frame:not(.win32-guest-dialog) .win32-canvas')
        def menu(id):
            page.locator('.win32-guest-frame:not(.win32-guest-dialog) .win32-menu-root').first.click();page.locator(f'.win32-menu-entry[data-command="{id}"]').click()
        def pixel(x,y):return page.evaluate('([x,y])=>w.win32Session.renderer.pixel(x,y)',[x,y])
        def click_at(x,y,button='left'):
            box=canvas().bounding_box();s=shape();canvas().click(position={'x':x*box['width']/s['width'],'y':y*box['height']/s['height']},button=button)
        def normal_exit():
            menu(1002);page.wait_for_function('!w.win32Session.worker');page.evaluate('w.win32Session.persist');assert page.evaluate('w.win32Session.exitCode')==0
        try:
            boot();report['environment']=page.evaluate('({ua:navigator.userAgent,storage:Aster.db.mode,secure:isSecureContext})')
            def bitmap_pipeline():
                return page.evaluate("""async()=>{const el=document.createElement('div');document.body.append(el);const g=new AsterGDI(el,32,16,{requireGPU:!!window.ASTER_WIN32_REQUIRE_GPU});try{await g.init();const image=(revision,pixel)=>({op:'bitmap',id:77,revision,width:1,height:1,pixels:new Uint8Array(pixel)}),blit=x=>({op:'blit',id:77,x,y:0,w:8,h:8,sx:0,sy:0,sw:1,sh:1});await g.submit([image(1,[255,0,0,255]),blit(0),image(2,[0,0,255,255]),blit(8),{op:'deletebitmap',id:77}]);const red=await g.pixel(4,4),blue=await g.pixel(12,4);if(red.join()!=[255,0,0,255].join()||blue.join()!=[0,0,255,255].join())throw Error('Bitmap update ordering failed: '+red+';'+blue);if(g.stats().bitmapUploads!==2||g.stats().bitmaps!==0||g.stats().errors.length)throw Error('Bitmap resource cleanup failed');return {red,blue,stats:g.stats()};}finally{g.destroy();el.remove();}}""")
            check('Bitmap upload/draw/update/draw/delete ordering preserves both visible colors',bitmap_pipeline)
            def startup():
                launch();page.wait_for_function('w.win32Session.width===154 && w.win32Session.height===182');assert not args.gpu or page.evaluate('w.win32Session.renderer.mode')=='WebGPU';assert page.get_by_role('menubar').count()==1
                assert page.get_by_role('menuitem',name='Game',exact=True).count()==1
                page.screenshot(path=str(out/'winemine-start.png'));return {'shape':shape(),'cpu':page.evaluate('w.win32Session.stats'),'renderer':page.evaluate('w.win32Session.renderer.stats()')}
            check('Source-built WineMine starts from PE resources and draws bitmap board',startup)
            def mark():
                before=pixel(13,45);click_at(13,45,'right');page.wait_for_timeout(100);after=pixel(13,45)
                # Flag sprite differs somewhere in the first 16x16 tile.
                page.wait_for_function("async()=>{const p=await w.win32Session.renderer.pixel(9,37);return p[0]===255&&p[1]===0&&p[2]===0;}")
                flag=pixel(9,37);assert flag==[255,0,0,255],flag
                box=canvas().bounding_box();dims=shape();png=page.screenshot(path=str(out/'winemine-flag.png'));presented=Image.open(io.BytesIO(png)).convert('RGB').getpixel((int(box['x']+9*box['width']/dims['width']),int(box['y']+37*box['height']/dims['height'])))
                assert list(presented)==flag[:3],(presented,flag)
                stats=page.evaluate('w.win32Session.renderer.stats()');assert stats['bitmapUploads']==3,stats
                click_at(13,45,'right');click_at(13,45,'right');click_at(13,45)
                page.wait_for_timeout(150);page.screenshot(path=str(out/'winemine-play.png'));assert not page.evaluate('w.win32Session.failed')
                return {'before':before,'after':after,'flagPixel':flag,'presentedPixel':list(presented),'renderer':stats}
            check('Actual guest right-click flags and safe first-click gameplay change sprites',mark)
            def difficulty():
                menu(1006);page.wait_for_function('w.win32Session.width===266 && w.win32Session.height===294');return shape()
            check('Game menu dispatch changes difficulty and resizes its WebGPU surface',difficulty)
            def keys_and_menus():
                for _ in range(32):
                    root=page.locator('.win32-menu-root').first;root.click();page.locator('.win32-menu-popup').wait_for();page.locator('.win32-menu-entry').first.press('Escape')
                before=page.evaluate('w.win32Session.renderer.frames');canvas().press('F2');page.wait_for_function('(n)=>w.win32Session.renderer.frames>n',arg=before)
                assert not page.evaluate('w.win32Session.failed');return {'popupCycles':32,'accelerator':'F2 dispatched through original PE accelerator resource'}
            check('Repeated popup menus do not leak state; F2 executes the guest accelerator',keys_and_menus)
            def custom():
                menu(1008);dialog=page.get_by_role('dialog',name='Custom Game',exact=True);dialog.wait_for();page.wait_for_function("document.querySelector('[data-control-id=\"1032\"]')?.value==='16'")
                assert page.locator('.win32-guest-frame:not(.win32-guest-dialog)').evaluate('(e)=>e.inert')
                page.locator('[data-control-id="1032"]').fill('12');page.locator('[data-control-id="1031"]').fill('13');page.locator('[data-control-id="1033"]').fill('20');page.screenshot(path=str(out/'winemine-custom.png'));dialog.get_by_role('button',name='OK',exact=True).click();dialog.wait_for(state='detached')
                page.wait_for_function('w.win32Session.width===218 && w.win32Session.height===230');assert not page.locator('.win32-guest-frame:not(.win32-guest-dialog)').evaluate('(e)=>e.inert')
                menu(1008);dialog.wait_for();page.locator('[data-control-id="1032"]').fill('20');page.locator('[data-control-id="1032"]').press('Escape');dialog.wait_for(state='detached');assert shape()=={'width':218,'height':230}
                return {'shape':shape(),'apiCalls':page.evaluate('w.win32Session.stats.apiCounts')}
            check('Modal dialog edits, owner disabling, OK and Cancel execute real DLGPROC code',custom)
            def times():
                menu(1003);dialog=page.get_by_role('dialog',name='Fastest Times',exact=True);dialog.wait_for();page.wait_for_function("document.querySelector('[data-control-id=\"1014\"]')?.textContent==='Nobody'")
                dialog.get_by_role('button',name='Reset Results',exact=True).click();message=page.get_by_role('alertdialog',name='Reset Results');message.wait_for();message.get_by_role('button',name='Cancel',exact=True).click();message.wait_for(state='detached');dialog.get_by_role('button',name='OK',exact=True).click();dialog.wait_for(state='detached');return 'Nested modal MessageBox cancel and dialog close return to the original guest procedure'
            check('Fastest Times resource dialog and nested confirmation keep callback state',times)
            def persistence():
                normal_exit();assert page.evaluate('w.win32Session.registryPersisted');snapshot=page.evaluate('w.win32Session.registrySnapshot');assert any(k['path']=='hkcu\\software\\microsoft\\winmine' for k in snapshot['keys'])
                if not args.inject:boot();assert page.evaluate('Aster.db.mode')=='IndexedDB'
                launch();page.wait_for_function('w.win32Session.width===218 && w.win32Session.height===230');normal_exit();return {'fullReload':not args.inject,'registryKeys':len(snapshot['keys'])}
            check('Guest registry settings survive process restart'+(' and page reload' if not args.inject else ''),persistence)
            def offline():
                boot(True);context.set_offline(True);launch();page.wait_for_function('w.win32Session.width>0');assert not args.gpu or page.evaluate('w.win32Session.renderer.mode')=='WebGPU';page.screenshot(path=str(out/'winemine-offline.png'));normal_exit();context.set_offline(False);return 'Embedded WineMine PE32 and bitmap resources executed with networking disabled'
            check('Standalone WineMine is fully local and executes offline',offline)
            assert not report['errors'],report['errors']
            external=[item for item in report['requests'] if item['method']!='GET' or not item['url'].startswith((url, 'blob:', 'data:', (ROOT/'Aster.html').as_uri()))]
            assert not external,external
            report['noExecutionBackendRequests']=True
        finally:
            (out/'browser-results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
    print(json.dumps({'passed':sum(t['status']=='PASS' for t in report['tests']),'report':str(out/'browser-results.json')},indent=2))
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--gpu',action='store_true');parser.add_argument('--headed',action='store_true');parser.add_argument('--inject',action='store_true');parser.add_argument('--browser');main(parser.parse_args())
