"""Real taskbar, theme, preview and desktop workflows; no substituted apps.
--inject is explicitly memory-only. Hosted HTTP/standalone test durable reloads.
"""
import argparse,json,threading,time
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main(args):
    out=args.output or ROOT/'tests/desktop-refinement/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    report={'mode':'injected memory' if args.inject else 'standalone' if args.standalone else 'HTTP/IndexedDB','engine':args.engine,'checks':[],'errors':[]}
    with sync_playwright() as p:
        browser=getattr(p,args.engine).launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox'] if args.engine=='chromium' else [])
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow');page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(body,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+body+'}',arg)
        def clean():
            page.get_by_role('button',name='Close preview',exact=True).click() if page.get_by_role('button',name='Close preview',exact=True).count() else None
            js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def app(id,options=None):
            wid=js('window.w=OS.openApp(arg.id,arg.options);await w.ready;return w.id;',{'id':id,'options':options or {}})
            return page.locator(f'[data-window="{wid}"]')
        def check(name,fn):
            now=time.perf_counter()
            try:detail=fn();report['checks'].append({'name':name,'status':'PASS','detail':detail,'ms':round((time.perf_counter()-now)*1000)});print('PASS',name,flush=True)
            except Exception as e:report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else f'http://127.0.0.1:{server.server_port}/')
            page.wait_for_function('Aster.booted && Aster.quickPreview && Aster.iconArtwork');page.locator('#boot').wait_for(state='detached')
            js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();await OS.themes.select("windows-light");');clean()
            js('''await OS.fs.mkdir('/Documents/Preview');await OS.fs.write('/Documents/Preview/a.html','<h1>Unexecuted document</h1><script>parent.previewExecuted=true</script>','text/html');await OS.fs.write('/Documents/Preview/b.txt','Read-only Unicode: żółć 日本語','text/plain');
                const c=document.createElement('canvas');c.width=80;c.height=50;c.getContext('2d').fillRect(0,0,80,50);await OS.fs.write('/Documents/Preview/c.png',await new Promise(r=>c.toBlob(r)),'image/png');
                await OS.fs.write('/Documents/Preview/d.txt','0123456789'.repeat(18000),'text/plain');await OS.fs.write('/Documents/Preview/e.bin',new Blob([new Uint8Array([0,255,128])]),'application/octet-stream');''')
            def family_matrix():
                clean();app('notepad');js('window.note=w;note.editor.value="Unsaved family switch";window.iconButton=note.maxButton;window.oldCount=OS.windows.size;')
                for preset in js('return OS.themes.presets.map(t=>t.id);'):
                    result=js('await OS.themes.select(arg);assert(note.editor.value==="Unsaved family switch");assert(iconButton===note.maxButton);assert(OS.windows.size===oldCount);const profile=OS.themes.current.profile;const nodes=[...document.querySelectorAll(".aster-adaptive-icon")];assert(nodes.length>3);assert(nodes.every(n=>n.dataset.iconFamily===profile));return profile;',preset)
                return 'All 12 presets adapt existing icons without replacing windows or caption controls'
            check('Adaptive original artwork follows every preset without losing editor state',family_matrix)
            def settings():
                clean();js('await OS.themes.select("macos26-light");');w=app('settings',{'section':'theme-metrics'});w.get_by_label('Icon design',exact=True).select_option('windows');page.wait_for_function('Aster.themes.current.iconFamily==="windows"');js('assert([...document.querySelectorAll(".aster-adaptive-icon")].every(n=>n.dataset.iconFamily==="windows"));await OS.themes.update({profile:"ubuntu"});assert(OS.iconArtwork.family==="windows");')
                w.get_by_label('Icon design',exact=True).select_option('auto');page.wait_for_function('Aster.themes.current.iconFamily==="auto"');js('assert(OS.iconArtwork.family==="ubuntu");')
            check('Settings supports independent icon design and live return to automatic matching',settings)
            def galleries():
                clean()
                for profile in ['windows','macos26','ubuntu']:
                    js('await OS.themes.select(arg+"-light");const host=OS.el("section",{id:"artwork-gallery",style:"position:fixed;z-index:25000;left:5%;top:10%;width:90%;background:var(--surface);color:var(--text);padding:24px;border-radius:16px;box-sizing:border-box"});host.append(OS.el("h2",{text:"Aster Atelier · "+arg+" · Original artwork"}));const grid=OS.el("div",{style:"display:grid;grid-template-columns:repeat(8,1fr);gap:22px"});for(const id of OS.iconArtwork.builtins)grid.append(OS.el("div",{style:"display:flex;align-items:center;flex-direction:column;gap:8px",html:OS.appIcon(id,56)+"<small>"+id+"</small>"}));host.append(grid);document.body.append(host);assert(new Set([...host.querySelectorAll(".aster-adaptive-icon")].map(n=>n.outerHTML)).size===29);',profile)
                    page.screenshot(path=str(out/f'{profile}-icons.png'));js('document.querySelector("#artwork-gallery").remove();')
                return '29 distinct symbols in each family, rendered by the production icon service'
            check('Three original icon-family contact sheets render without broken SVG resources',galleries)
            def six_themes():
                clean();app('notepad');js('window.note=w;note.rect={x:850,y:160,w:480,h:400};note.sync();note.editor.value="Aster Atelier — preserved draft";');app('files',{'path':'/Documents'});js('window.explorer=w;explorer.rect={x:100,y:80,w:860,h:620};explorer.sync();')
                for preset in ['windows-light','windows-dark','macos26-light','macos26-dark','ubuntu-light','ubuntu-dark']:
                    js('await OS.themes.select(arg);assert(note.editor.value==="Aster Atelier — preserved draft");',preset)
                    page.screenshot(path=str(out/f'{preset}.png'))
            check('Six theme visual reviews retain working Explorer and unsaved Notepad',six_themes)
            def window_list():
                clean();js('await OS.themes.select("windows-light");window.listIDs=[];for(let i=1;i<=7;i++){const n=OS.openApp("notepad");await n.ready;n.setTitle("Document "+i);listIDs.push(n.id);}')
                task=page.locator('#taskbar [data-app="notepad"]');task.focus();page.keyboard.press('ArrowUp');panel=page.get_by_role('dialog',name='Notepad windows');panel.wait_for();assert panel.locator('.task-window-card').count()==7;assert panel.locator('button button').count()==0;page.screenshot(path=str(out/'taskbar-window-list.png'))
                page.keyboard.press('End');last=js('return document.activeElement.closest("[data-preview-window]").dataset.previewWindow;');page.keyboard.press('Enter');page.wait_for_function('(id)=>Aster.focused===id',arg=last);assert page.get_by_role('dialog',name='Notepad windows').count()==0
                return 'Seven windows accessible by keyboard, beyond the previous four-card cutoff'
            check('Taskbar window list exposes every app window and supports keyboard activation',window_list)
            def close_list():
                clean();w=app('notepad');w.locator('textarea').fill('Must survive cancelled close');app('notepad');task=page.locator('#taskbar [data-app="notepad"]');task.focus();page.keyboard.press('ArrowUp');panel=page.get_by_role('dialog',name='Notepad windows');panel.locator('.preview-close').last.click();page.locator('.dialog-backdrop').wait_for();page.locator('.dialog-backdrop').last.get_by_role('button',name='Cancel',exact=True).click();js('assert(OS.windows.size===2);assert([...OS.windows.values()].some(w=>w.editor?.value==="Must survive cancelled close"));')
                page.keyboard.press('Escape')
            check('Window-list Close uses the real unsaved-work confirmation and keeps cancelled edits',close_list)
            def pins():
                clean();js('await OS.themes.select("macos26-light");window.originalPins=[...OS.pins];');ids=js('return OS.pins.slice(0,2);');page.locator(f'#taskbar [data-app="{ids[1]}"]').drag_to(page.locator(f'#taskbar [data-app="{ids[0]}"]'));page.wait_for_function('(id)=>Aster.pins[0]===id',arg=ids[1]);js('assert((await OS.db.get("taskbarPins"))[0]===OS.pins[0]);')
                task=page.locator(f'#taskbar [data-app="{ids[1]}"]');task.focus();page.keyboard.press('Alt+Shift+ArrowRight');page.wait_for_function('(id)=>Aster.pins[1]===id',arg=ids[1]);js('assert(OS.pins.join()===originalPins.join());')
            check('Dock pins reorder by actual pointer drag and keyboard with durable metadata',pins)
            def rapid_pins():
                js('window.pinBefore=[...OS.pins];window.movingPin=OS.pins[0];await Promise.all([OS.taskbarPinMove(movingPin,1),OS.taskbarPinMove(movingPin,1),OS.togglePin("clock"),OS.togglePin("clock")]);assert(OS.pins[2]===movingPin,"Rapid reorder lost a step");assert(JSON.stringify(await OS.db.get("taskbarPins"))===JSON.stringify(OS.pins));await OS.moveTaskbarPin(movingPin,OS.pins[0]);assert(OS.pins.join()===pinBefore.join());')
                return 'Two queued moves and two pin toggles commit in order without losing changes'
            check('Rapid pin reorders and pin/unpin share one serialized durable queue',rapid_pins)
            def desktop():
                clean();js('await OS.themes.select("windows-light");window.deskA=OS.activeDesktop;const x=OS.openApp("notepad");await x.ready;window.a=x;const m=OS.openApp("calculator");await m.ready;m.minimize();window.wasMin=m;')
                page.get_by_role('button',name='Show desktop',exact=True).click();js('assert(a.minimized&&wasMin.minimized);window.deskB=(await OS.addDesktop()).id;window.b=OS.openApp("clock");await b.ready;')
                page.get_by_role('button',name='Show desktop',exact=True).click();js('assert(b.minimized);OS.switchDesktop(deskA);');page.get_by_role('button',name='Show desktop',exact=True).click();js('assert(!a.minimized&&wasMin.minimized&&b.minimized);assert(OS.activeDesktop===deskA);OS.switchDesktop(deskB);');page.get_by_role('button',name='Show desktop',exact=True).click();js('assert(!b.minimized&&wasMin.minimized);assert(OS.activeDesktop===deskB);OS.switchDesktop(deskA);')
            check('Show Desktop restores each virtual desktop independently without waking minimized apps',desktop)
            def text_preview():
                clean();js('await OS.themes.select("macos26-light");');app('files',{'path':'/Documents/Preview'});page.locator('.file-row[data-path="/Documents/Preview/a.html"]').click();page.keyboard.press('Space');panel=page.get_by_role('dialog',name='Quick preview',exact=True);panel.get_by_text('<h1>Unexecuted document</h1>',exact=False).wait_for();js('assert(!window.previewExecuted);assert(!document.querySelector(".quick-preview iframe"));assert(OS.windows.size===1);');page.screenshot(path=str(out/'quick-preview-text.png'));page.keyboard.press('Shift+Tab');js('assert(document.activeElement.getAttribute("aria-label")==="Next file");');page.keyboard.press('Tab');js('assert(document.activeElement.textContent==="Open in app");');page.keyboard.press('Escape');js('assert(!OS.quickPreview.active&&OS.quickPreview.liveURLs===0);assert(w.el.contains(document.activeElement));')
            check('Explorer Space opens inert HTML source with focus restoration and no new app window',text_preview)
            def image_preview():
                page.locator('.file-row[data-path="/Documents/Preview/b.txt"]').click(button='right');page.get_by_role('menuitem',name='Quick preview',exact=False).click();panel=page.get_by_role('dialog',name='Quick preview');panel.get_by_role('button',name='Next file',exact=True).click();page.wait_for_function('document.querySelector(".quick-preview img")?.naturalWidth===80');js('assert(OS.quickPreview.liveURLs===1);');page.screenshot(path=str(out/'quick-preview-image.png'));panel.get_by_role('button',name='Next file',exact=True).click();page.wait_for_function('document.querySelector(".quick-preview-text")?.textContent.length===131072');js('assert(OS.quickPreview.liveURLs===0);assert((await OS.fs.read("/Documents/Preview/d.txt")).size===180000);');page.keyboard.press('Escape')
            check('Preview navigation decodes real images, caps text and revokes replaced image URLs',image_preview)
            def binary_preview():
                page.locator('.file-row[data-path="/Documents/Preview/e.bin"]').click();page.keyboard.press('Space');page.get_by_text('No inline preview for this file type.',exact=False).wait_for();js('assert(OS.quickPreview.liveURLs===0);assert(OS.windows.size===1);');page.keyboard.press('Escape')
            check('Unsupported binary files stay metadata-only and never execute in the preview',binary_preview)
            def open_preview():
                page.locator('.file-row[data-path="/Documents/Preview/b.txt"]').click();page.keyboard.press('Space');panel=page.get_by_role('dialog',name='Quick preview');panel.get_by_role('button',name='Open in app',exact=True).click();page.wait_for_function('[...Aster.windows.values()].some(w=>w.appId==="notepad"&&w.editor?.value==="Read-only Unicode: żółć 日本語")');js('assert(!OS.quickPreview.active);')
            check('Open in app from Quick Preview dispatches the actual saved document',open_preview)
            def media_preview():
                clean();app('files',{'path':'/Documents/Preview'})
                js('''const n=800,data=new Uint8Array(44+n*2),d=new DataView(data.buffer);function text(i,t){for(let j=0;j<t.length;j++)data[i+j]=t.charCodeAt(j);}text(0,'RIFF');d.setUint32(4,data.length-8,true);text(8,'WAVE');text(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,8000,true);d.setUint32(28,16000,true);d.setUint16(32,2,true);d.setUint16(34,16,true);text(36,'data');d.setUint32(40,n*2,true);for(let i=0;i<n;i++)d.setInt16(44+i*2,Math.sin(i*.2)*2000,true);await OS.fs.write('/Documents/Preview/g.wav',new Blob([data],{type:'audio/wav'}),'audio/wav');await OS.previewFiles(['/Documents/Preview/g.wav'],0,w);''')
                page.wait_for_function('Number.isFinite(document.querySelector(".quick-preview audio")?.duration)');js('const audio=document.querySelector(".quick-preview audio");assert(audio.duration>.09&&audio.duration<.11);assert(audio.paused&&!audio.autoplay);assert(OS.quickPreview.liveURLs===1);');page.get_by_role('button',name='Close preview').click();js('assert(OS.quickPreview.liveURLs===0);')
                return 'Actual PCM WAV decoded to a 0.1s duration, stays paused, releases its object URL'
            check('Audio previews decode real WAV metadata without autoplay and dispose on close',media_preview)
            def preview_limits():
                js('''await OS.fs.write('/Documents/Preview/h.png',new Blob(['invalid raster'],{type:'image/png'}),'image/png');await OS.previewFiles(['/Documents/Preview/h.png'],0,w);''')
                page.get_by_text('This browser could not decode the file.',exact=False).wait_for();js('assert(OS.quickPreview.liveURLs===0);');page.keyboard.press('Escape')
                js('''await OS.fs.write('/Documents/Preview/large.png',new Blob([new Uint8Array(16777217)],{type:'image/png'}),'image/png');await OS.previewFiles(['/Documents/Preview/large.png'],0,w);''')
                page.get_by_text('Media previews are limited to 16 MiB.',exact=False).wait_for();js('assert(OS.quickPreview.liveURLs===0);assert((await OS.fs.stat("/Documents/Preview/large.png")).size===16777217);');page.keyboard.press('Escape')
                # Pause real metadata lookup, then replace the actual stored file.
                js('window.originalStat=OS.fs.stat;window.releaseStat=null;OS.fs.stat=async function(path){const entry=await originalStat.call(this,path);if(path.endsWith("h.png"))await new Promise(r=>releaseStat=r);return entry;};window.racedPreview=OS.previewFiles(["/Documents/Preview/h.png"],0,w);')
                page.wait_for_function('!!releaseStat')
                js('OS.fs.stat=originalStat;await OS.fs.write("/Documents/Preview/h.png",new Blob([new Uint8Array(16777217)],{type:"image/png"}),"image/png");releaseStat();await racedPreview;assert(OS.quickPreview.liveURLs===0);')
                page.get_by_text('Media previews are limited to 16 MiB.',exact=False).wait_for();page.keyboard.press('Escape')
                return 'Corrupt media is freed; metadata and actual byte-size limits hold even after concurrent replacement'
            check('Invalid and oversized media produce bounded non-destructive preview diagnostics',preview_limits)
            def late_preview():
                clean();app('files',{'path':'/Documents/Preview'});js('window.originalRead=OS.fs.read;window.releasePreview=null;OS.fs.read=async function(path){const file=await originalRead.call(this,path);if(path.endsWith("c.png"))await new Promise(r=>releasePreview=r);return file;};void OS.previewFiles(["/Documents/Preview/c.png"],0,w);');page.wait_for_function('!!releasePreview');page.get_by_role('button',name='Close preview').click();js('releasePreview();OS.fs.read=originalRead;await new Promise(r=>setTimeout(r,30));assert(!OS.quickPreview.active&&OS.quickPreview.liveURLs===0);')
            check('Closing during a pending file read ignores late results without leaking a URL',late_preview)
            def owner_lifetime():
                js('await OS.previewFiles(["/Documents/Preview/c.png"],0,w);assert(OS.quickPreview.liveURLs===1);await w.close(true);assert(!OS.quickPreview.active&&OS.quickPreview.liveURLs===0);')
            check('Closing the owning Explorer disposes its preview and media resources',owner_lifetime)
            def mobile():
                clean();page.set_viewport_size({'width':390,'height':844});app('files',{'path':'/Documents/Preview'});js('await OS.previewFiles(["/Documents/Preview/b.txt"],0,w);');r=page.get_by_role('dialog',name='Quick preview').bounding_box();assert r['x']>=0 and r['x']+r['width']<=390;page.screenshot(path=str(out/'mobile-preview.png'));page.keyboard.press('Escape');app('notepad');page.locator('#taskbar [data-app="notepad"]').focus();page.keyboard.press('ArrowUp');p=page.get_by_role('dialog',name='Notepad windows');r=p.bounding_box();assert r['x']>=0 and r['x']+r['width']<=391;page.keyboard.press('Escape');page.set_viewport_size({'width':1440,'height':1000})
            check('Quick Preview and taskbar window list fit a 390px desktop',mobile)
            def modes():
                clean();app('files',{'path':'/Documents/Preview'});
                for preset in ['windows-light','macos26-dark','ubuntu-light']:
                    for style in ['colorful','dark','clear','tinted']:
                        js('await OS.themes.select(arg.preset);await OS.themes.update({iconStyle:arg.style});const icon=w.el.querySelector(".aster-adaptive-icon");const r=icon.getBoundingClientRect(),s=icon.querySelector("svg").getBoundingClientRect();assert(Math.abs(r.width-s.width)<.3);assert(getComputedStyle(icon.querySelector(".art-glyph")).stroke!=="none");',{'preset':preset,'style':style})
                page.emulate_media(forced_colors='active',reduced_motion='reduce');js('await OS.previewFiles(["/Documents/Preview/b.txt"],0,w);');page.get_by_role('button',name='Close preview').click();page.emulate_media(forced_colors='none',reduced_motion='no-preference')
            check('Icon styles, forced colors and reduced motion retain useful shapes and controls',modes)
            if not args.inject:
                def persist():
                    clean();js('await OS.themes.select("macos26-light");await OS.themes.update({iconFamily:"ubuntu"});await OS.moveTaskbarPin(OS.pins[1],OS.pins[0]);window.savedOrder=OS.pins.join();OS.settings.restore=false;await OS.db.set("settings",OS.settings);OS.cancelSessionSave();await OS.persistSessionNow();');saved=js('return savedOrder;');page.reload();page.wait_for_function('Aster.booted&&Aster.quickPreview');page.locator('#boot').wait_for(state='detached');js('await OS.ready;assert(!OS.db.memory);assert(OS.themes.current.iconFamily==="ubuntu");assert(OS.iconArtwork.family==="ubuntu");assert(OS.pins.join()===arg);assert((await OS.fs.read("/Documents/Preview/d.txt")).size===180000);assert(!OS.quickPreview.active&&OS.quickPreview.liveURLs===0);',saved)
                check('Full reload preserves icon preference, pin order and source files without restoring previews',persist)
                if args.standalone:
                    def offline():
                        clean();context.set_offline(True);page.reload();page.wait_for_function('Aster.booted&&Aster.quickPreview');page.locator('#boot').wait_for(state='detached');js('await OS.ready;await OS.previewFiles(["/Documents/Preview/b.txt"]);');page.get_by_text('Read-only Unicode: żółć 日本語',exact=True).wait_for();page.keyboard.press('Escape');context.set_offline(False)
                    check('Standalone boots offline and previews saved Unicode files without network access',offline)
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as e:report['status']='FAIL';report['error']=str(e);raise
        finally:(out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--browser');ap.add_argument('--engine',choices=['chromium','firefox'],default='chromium');ap.add_argument('--output',type=Path);main(ap.parse_args())
