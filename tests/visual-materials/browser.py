"""Actual shell rendering, bounded optical fields, DOM-backdrop pixel comparison.

The checkerboard is an explicitly labeled test backdrop, not a substitute app.
Screenshots compare Aster against its own non-refractive control; they do NOT
measure similarity to a native OS. --inject is memory-only local evidence.
"""
import argparse, io, json, sys, threading, time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def main(args):
    out=(args.output or ROOT/'tests/visual-materials/artifacts').resolve();out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=(ROOT/'Aster.html').as_uri() if args.standalone else f'http://127.0.0.1:{server.server_port}/'
    report={'mode':'injected-memory' if args.inject else 'standalone' if args.standalone else 'HTTP','gpuRequired':args.gpu,'tests':[],'errors':[]}
    with sync_playwright() as p:
        flags=['--no-sandbox']
        if args.gpu:
            flags+=['--enable-unsafe-webgpu']
            if sys.platform.startswith('linux'): flags+=['--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']
        browser=p.chromium.launch(headless=not args.headed,args=flags,**({'executable_path':args.browser} if args.browser else {}))
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow')
        page=context.new_page();page.set_default_timeout(60000 if args.gpu else 20000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(source,arg=None): return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+source+'}',arg)
        def settle():
            # Flush queued style/ResizeObserver reconciliation BEFORE checking
            # field completion. Waiting before rAF can observe an empty queue
            # just before that frame starts new asynchronous GPU maps.
            js('OS.materials.refresh();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));')
            page.wait_for_function('Aster.materials.diagnostics.settled',polling=100)
        def clear(): js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def preset(id):
            report['currentProfile']=id;js('await OS.themes.select(arg);',id);settle()
        def check(name,fn):
            start=time.perf_counter()
            try:
                detail=fn();report['tests'].append({'name':name,'status':'PASS','ms':round((time.perf_counter()-start)*1000),'detail':detail});print('PASS',name,flush=True)
            except Exception as e:
                report['tests'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        try:
            if args.inject: page.set_content((ROOT/'Aster.html').read_text())
            else: page.goto(url)
            page.wait_for_function('window.Aster?.booted && Aster.materials && Aster.themes.ready')
            js('await OS.ready;OS.settings.restore=false;OS.settings.dnd=true;');clear()
            report['environment']=js('return {ua:navigator.userAgent,renderer:OS.renderer.mode,memory:OS.db.memory};')
            def profiles():
                js('window.editor=OS.openApp("notepad");await editor.ready;window.originalEditor=editor.body.querySelector("textarea");originalEditor.value="Unsaved profile regression";originalEditor.dispatchEvent(new Event("input",{bubbles:true}));editor.rect={x:720,y:180,w:600,h:510};editor.sync();window.files=OS.openApp("files",{path:"/Documents"});await files.ready;files.rect={x:170,y:105,w:930,h:630};files.sync();')
                measurements=[]
                for id in ['windows-light','windows-dark','macos26-light','macos26-dark','ubuntu-light','ubuntu-dark']:
                    preset(id)
                    m=js('assert(OS.windows.size===2);assert(editor.body.querySelector("textarea")===originalEditor);assert(originalEditor.value==="Unsaved profile regression");const a=OS.viewport();files.toggleMaximize();assert(files.rect.x===0&&files.rect.y===0&&files.rect.w===a.w&&files.rect.h===a.h);const full=files.el.getBoundingClientRect();assert(Math.abs(full.x-a.x)<=1&&Math.abs(full.y-a.y)<=1);files.toggleMaximize();const r=files.el.querySelector(".titlebar").getBoundingClientRect();const t=document.querySelector("#taskbar").getBoundingClientRect();assert([...files.el.querySelectorAll(".window-controls button")].every(b=>{const x=b.getBoundingClientRect();return x.x>=r.x&&x.right<=r.right+1}));return{profile:OS.themes.visual.profile,titleHeight:r.height,taskbar:{x:t.x,y:t.y,w:t.width,h:t.height}};')
                    measurements.append(m);page.screenshot(path=str(out/(id+'.png')))
                return measurements
            check('Six light/dark profiles retain unsaved documents and their correct maximize work areas',profiles)
            def bars():
                clear();preset('windows-light');js('assert(document.querySelector("#taskbar .task-center").firstElementChild.id==="start-button");assert(document.querySelector("#theme-topbar").hidden);assert(!document.querySelector("#taskbar").classList.contains("liquid-surface"));')
                preset('ubuntu-light');js('assert(!document.querySelector("#theme-topbar").hidden);assert(document.querySelector("#start-button svg").querySelectorAll("circle").length===9);assert(document.querySelector("#theme-topbar #tray-clock"));assert(getComputedStyle(document.querySelector("#theme-topbar")).backdropFilter==="none");')
                preset('macos26-light');page.wait_for_function('document.querySelector("#taskbar")?.dataset.optical==="refractive"');js('assert(document.querySelector("#taskbar .task-center").lastElementChild.id==="start-button");assert(document.querySelector("#theme-topbar #tray-clock"));assert(document.querySelector("#tray-clock").children.length===1);')
                return 'Platform bars reuse the real task buttons and tray, with correct ordering after live switches'
            check('Windows taskbar, GNOME panel and macOS Dock are structurally distinct',bars)
            def menus():
                js('window.files=OS.openApp("files",{path:"/Documents"});await files.ready;');page.locator('#theme-topbar').get_by_role('button',name='File',exact=True).click();page.get_by_role('menuitem',name='New tab',exact=False).click();page.wait_for_function('files.body.querySelectorAll(".explorer-tab-slot").length===2')
                page.locator('#theme-topbar').get_by_role('button',name='Go',exact=True).click();page.get_by_role('menuitem',name='Downloads',exact=True).click();page.wait_for_function('files.state.path==="/Downloads"')
                page.locator('#theme-topbar').get_by_role('button',name='Window',exact=True).click();page.get_by_role('menuitem',name='Tile left',exact=True).click();js('assert(files.rect.x===8);');settle();page.screenshot(path=str(out/'macos-files.png'))
                return 'Global File/Go/Window menus invoke real Explorer tab, navigation and snap handlers'
            check('macOS menu bar operates the focused Explorer instead of decorative menu labels',menus)
            def controls():
                clear();js('window.settings=OS.openApp("settings",{section:"colors"});await settings.ready;')
                page.get_by_label('Glass rendering',exact=True).select_option('high');page.wait_for_function('Aster.themes.visual.optics.quality==="high"')
                page.get_by_label('Refraction strength',exact=True).fill('83');page.get_by_label('Refraction strength',exact=True).dispatch_event('change');page.wait_for_function('Aster.themes.visual.optics.bend===83')
                page.get_by_label('Color dispersion',exact=True).fill('19');page.get_by_label('Color dispersion',exact=True).dispatch_event('change');page.wait_for_function('Aster.themes.visual.optics.dispersion===19');settle()
                js('const d=document.querySelector("#taskbar");assert(d.dataset.optical==="refractive");assert(document.querySelectorAll("#aster-optical-defs feBlend").length>0);assert(document.querySelectorAll("#aster-optical-defs feDisplacementMap").length>=3);for(const el of document.querySelectorAll("[data-optical=refractive]"))assert(getComputedStyle(el).backdropFilter.includes("aster-lens-"),"CSS suppressed the live optical filter");')
                page.screenshot(path=str(out/'material-settings.png'));return js('return OS.materials.diagnostics;')
            check('Settings controls select real detailed optics, refraction and RGB dispersion',controls)
            def pixels():
                clear();js('await OS.themes.update({glass:"clear",optics:{quality:"high",bend:100,dispersion:20,magnify:false},motion:false});const backdrop=document.createElement("div");backdrop.id="optical-test-backdrop";backdrop.style.cssText="position:fixed;inset:0;z-index:9000;pointer-events:none;background:repeating-conic-gradient(#00bacc 0% 25%,#ec3170 0% 50%) 0/22px 22px";document.body.append(backdrop);')
                page.wait_for_function('document.querySelector("#taskbar")?.dataset.optical==="refractive"');settle();page.wait_for_timeout(100)
                clip=page.locator('#taskbar').bounding_box();a=page.screenshot(path=str(out/'controlled-backdrop-lens.png'),clip=clip)
                js('const n=document.querySelector("#taskbar"),id=n.style.getPropertyValue("--optical-filter").match(/#[a-z0-9-]+/i)[0];window.opticalOriginal=n.style.getPropertyValue("--optical-filter");window.opticalControl=document.querySelector(id).cloneNode(true);opticalControl.id="zero-displacement-control";assert(opticalControl.querySelectorAll("feDisplacementMap").length===3);for(const m of opticalControl.querySelectorAll("feDisplacementMap"))m.setAttribute("scale","0");document.querySelector("#aster-optical-defs defs").append(opticalControl);n.style.setProperty("--optical-filter","url(#zero-displacement-control)");');b=page.screenshot(path=str(out/'controlled-backdrop-zero-bend.png'),clip=clip)
                ia,ib=Image.open(io.BytesIO(a)).convert('RGB'),Image.open(io.BytesIO(b)).convert('RGB')
                diff=ImageChops.difference(ia,ib);changed=sum(max(v)>5 for v in (diff.get_flattened_data() if hasattr(diff,"get_flattened_data") else diff.getdata()));assert changed>80,f'No actual lens pixels: {changed}'
                js('document.querySelector("#taskbar").style.setProperty("--optical-filter",opticalOriginal);opticalControl.remove();document.querySelector("#optical-test-backdrop").style.backgroundPosition="11px 7px";');c=page.screenshot(path=str(out/'controlled-backdrop-moved.png'),clip=clip)
                moving=ImageChops.difference(ia,Image.open(io.BytesIO(c)).convert('RGB'));assert moving.getbbox(),'Glass did not follow actual backdrop changes'
                js('document.querySelector("#optical-test-backdrop").remove();');return {'changedPixelsVersusZeroDisplacement':changed,'totalPixels':ia.width*ia.height,'comparison':'Real browser-composited checkerboard, not a native OS reference or app replacement'}
            check('Real captured output contains edge refraction beyond blur and follows changing backdrop pixels',pixels)
            def magnify():
                js('await OS.themes.update({motion:true,optics:{magnify:true}});');settle();button=page.locator('#taskbar .task-button[data-app="files"]');button.hover();page.wait_for_function('parseFloat(document.querySelector("#taskbar [data-app=files] .app-icon").style.getPropertyValue("--dock-scale"))>1.15')
                page.mouse.move(500,400);page.wait_for_function('!document.querySelector("#taskbar [data-app=files] .app-icon").style.getPropertyValue("--dock-scale")')
                page.emulate_media(reduced_motion='reduce');button.hover();settle();js('assert(document.body.classList.contains("material-reduced-motion"));assert(!document.querySelector("#taskbar [data-app=files] .app-icon").style.getPropertyValue("--dock-scale"));');page.emulate_media(reduced_motion='no-preference')
                return 'Actual pointer magnifies app icons; reduced motion disables magnification'
            check('Dock magnification and moving highlights obey actual reduced-motion media preferences',magnify)
            def accessibility():
                js('await OS.themes.update({transparency:false});');page.wait_for_function('Aster.materials.diagnostics.backend==="opaque"');settle();js('assert(!OS.materials.diagnostics.surfaces);assert(!OS.materials.diagnostics.cache);assert(!document.querySelector("#aster-optical-defs"));assert(getComputedStyle(document.querySelector("#taskbar")).backdropFilter==="none");')
                js('await OS.themes.update({transparency:true});');page.wait_for_function('document.querySelector("#taskbar")?.dataset.optical==="refractive"')
                page.emulate_media(forced_colors='active');page.wait_for_function('Aster.materials.diagnostics.backend==="opaque"');settle();js('assert(!OS.materials.diagnostics.cache);');page.emulate_media(forced_colors='none');preset('macos26-light');settle();page.emulate_media(contrast='more');page.wait_for_function('Aster.materials.diagnostics.backend==="opaque"');settle();js('assert(!OS.materials.diagnostics.cache);assert(getComputedStyle(document.querySelector("#taskbar")).backdropFilter==="none");');page.emulate_media(contrast='no-preference');preset('macos26-light');settle()
                return 'Transparency off and forced colors dispose active lens resources and render solid controls'
            check('Accessibility uses opaque surfaces and frees material resources',accessibility)
            def blur():
                js('await OS.themes.update({optics:{quality:"blur"}});');page.wait_for_function('Aster.materials.diagnostics.backend==="css-blur"');settle();js('assert(!OS.materials.diagnostics.cache);assert(!OS.materials.diagnostics.bytes);assert(document.querySelector("#taskbar").dataset.optical==="blur");assert(!getComputedStyle(document.querySelector("#taskbar")).backdropFilter.includes("url("));')
                preset('macos26-light');return 'Explicit blur-only tier retains controls without pretending refraction is active'
            check('Blur-only material is labeled and does not retain unused normal maps',blur)
            def lifetime():
                clear();js('window.resizeWindow=OS.openApp("notepad");await resizeWindow.ready;')
                for i in range(30):
                    js('resizeWindow.rect.w=450+arg*7;resizeWindow.rect.h=280+arg;resizeWindow.sync();OS.materials.refresh();',i);settle()
                stats=js('const d=OS.materials.diagnostics;assert(d.cache<=d.limits.cache);assert(d.surfaces<=d.limits.surfaces);assert(d.bytes<=d.limits.cache*d.limits.gpuBytes);assert(!d.pending&&!d.gpuLive);return d;')
                builds=stats['builds'];page.wait_for_timeout(350);js('assert(OS.materials.diagnostics.builds===arg);',builds)
                preset('windows-light');js('assert(OS.materials.diagnostics.cache===0);assert(OS.materials.diagnostics.surfaces===0);');return stats
            check('Resize cache stays bounded, avoids idle rebuilds and is released when leaving glass',lifetime)
            def compact():
                clear();js('window.web=OS.openApp("web-forma");await web.ready;')
                for id in ['windows-light','macos26-light','ubuntu-light']:
                    preset(id);js('assert(web.el.classList.contains("web-app-compact"));assert(getComputedStyle(web.el.querySelector(".titlebar")).display==="none");assert(!web.el.querySelector(".titlebar").classList.contains("liquid-surface"));')
                clear();return 'Actual compact catalog host retains titlebar-hidden setting across all profiles; site feature execution is checked separately'
            check('Visual refinements preserve the requested titlebar-free web-app host',compact)
            def mobile():
                clear();page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390')
                for id in ['windows-light','macos26-light','ubuntu-light']:
                    preset(id);page.locator('#start-button').click();panel=page.locator('.start-menu');panel.wait_for();r=panel.bounding_box();assert r['x']>=-1 and r['x']+r['width']<=391,(id,r);page.screenshot(path=str(out/('mobile-'+id+'.png')));page.keyboard.press('Escape');js('assert(!document.querySelector(".start-menu"));')
                page.set_viewport_size({'width':1440,'height':1000});return 'All three actual Start surfaces fit narrow viewports and close with Escape'
            check('Responsive geometry and keyboard dismissal work in all three shell profiles',mobile)
            if args.gpu:
                def compute():
                    preset('macos26-light');page.wait_for_function('Aster.renderer.mode==="WebGPU"&&Aster.materials.diagnostics.gpuBuilds>0');settle()
                    return js('''assert(OS.renderer.gpuPeak<=2,'Unbounded desktop GPU submissions');const device=OS.renderer.device,M=AsterMaterialOptics,g=M.geometry(127,73,17,'high'),expected=M.field(g),size=expected.length;
                        device.pushErrorScope('validation');const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:M.WGSL}),entryPoint:'field'}});
                        const u=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),o=device.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),r=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
                        try{const params=new ArrayBuffer(32);new Float32Array(params).set([g.width,g.height,g.radius,g.rim]);new Uint32Array(params,16).set([g.cols,g.rows]);device.queue.writeBuffer(u,0,params);const enc=device.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:{buffer:o}}]}));pass.dispatchWorkgroups(Math.ceil(g.cols/8),Math.ceil(g.rows/8));pass.end();enc.copyBufferToBuffer(o,0,r,0,size);device.queue.submit([enc.finish()]);await r.mapAsync(GPUMapMode.READ);const actual=new Uint8Array(r.getMappedRange());let max=0;for(let i=0;i<size;i++)max=Math.max(max,Math.abs(actual[i]-expected[i]));assert(max<=1,'GPU/CPU field discrepancy '+max);r.unmap();return{bytes:size,maxChannelDifference:max,actualEngine:OS.materials.diagnostics};}finally{u.destroy();o.destroy();r.destroy();const error=await device.popErrorScope();assert(!error,error?.message);}''')
                check('Real WebGPU compute normals agree with the independent CPU field within one channel unit',compute)
            if not args.inject:
                def durable():
                    clear();preset('macos26-dark');js('await OS.themes.update({optics:{quality:"high",bend:78,dispersion:11,magnify:false}});await OS.themes.pending;OS.cancelSessionSave();await OS.persistSessionNow();');page.reload();page.wait_for_function('Aster.booted&&Aster.themes.ready&&Aster.materials');js('await OS.ready;assert(!OS.db.memory);assert(OS.themes.visual.profile==="macos26");assert(OS.themes.visual.optics.quality==="high");assert(OS.themes.visual.optics.bend===78);assert(OS.themes.visual.optics.dispersion===11);assert(!OS.themes.visual.optics.magnify);');page.wait_for_function('document.querySelector("#taskbar")?.dataset.optical==="refractive"');settle();return 'Actual full-page reload preserved and reapplied optical settings with IndexedDB'
                check('New material preferences and shell profile persist through complete reload',durable)
                if args.standalone:
                    def offline():
                        context.set_offline(True);page.reload();page.wait_for_function('Aster.booted&&Aster.materials');preset('macos26-light');page.wait_for_function('document.querySelector("#taskbar")?.dataset.optical==="refractive"');preset('ubuntu-dark');preset('windows-light');return 'Complete standalone boot and three profile changes with browser networking disabled'
                    check('Standalone optics and profile assets work with networking disabled',offline)
            assert not report['errors'],report['errors'];report['status']='PASS';report['finalDiagnostics']=js('return OS.materials.diagnostics;')
        except Exception as e:
            report['status']='FAIL';report['error']=str(e)
            try: report['failureDiagnostics']=js('return {materials:OS.materials?.diagnostics,renderer:OS.renderer?.mode,gpuPending:OS.renderer?.gpuPending,gpuPeak:OS.renderer?.gpuPeak,visibility:document.visibilityState,profile:OS.themes?.visual};')
            except Exception as diagnostic_error: report['diagnosticError']=str(diagnostic_error)
            raise
        finally:
            (out/'results.json').write_text(json.dumps(report,indent=2)+'\n');browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--gpu',action='store_true');ap.add_argument('--headed',action='store_true');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
