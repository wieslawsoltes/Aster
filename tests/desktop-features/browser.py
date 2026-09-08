"""Desktop essentials end-to-end tests. --inject is the restricted local fallback.
Recording uses a labeled canvas MediaStream fixture, but real MediaRecorder/video decode.
Ordinary CI additionally verifies IndexedDB reload and upgrade from the previous schema.
"""
import argparse, base64, io, json, threading, time, zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Server(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path=='/upgrade-fixture':
            body=b'<!doctype html><title>Database migration fixture</title>'
            self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(body)
        else:super().do_GET()
def main(args):
    out=ROOT/'tests/desktop-features/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Server,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
    report={'tests':[],'errors':[],'mode':'injected, memory only' if args.inject else 'HTTP + IndexedDB', 'limits':['Capture chooser is permission-gated; codec tests use a canvas stream, not a real screen chooser.','Read-aloud voice availability is capability-tested; audible speech is not asserted.','These features operate inside Aster, not the host operating system.']}
    with sync_playwright() as p:
        options={'headless':True,'args':['--no-sandbox']}
        if args.browser:options['executable_path']=args.browser
        browser=p.chromium.launch(**options);context=browser.new_context(viewport={'width':1440,'height':1000},timezone_id='Europe/Warsaw',service_workers='block',accept_downloads=True)
        page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def boot(standalone=False):
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if standalone else origin,wait_until='load')
            page.wait_for_function('Aster.booted');page.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);Aster.settings.restore=false;Aster.settings.motion=false;Aster.settings.dnd=false;Aster.applySettings();document.querySelectorAll(".toast").forEach(e=>e.remove());}')
        def js(body,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="assertion failed")=>{if(!v)throw Error(m);};'+body+'}',arg)
        def clean():js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def launch(app,opts=None):return js('const w=OS.launch(arg[0],arg[1]);await w.ready;window.w=w;assert(!w.body.querySelector(".app-error"),w.body.innerText);return w.id;', [app,opts or {}])
        def check(name,fn):
            start=time.perf_counter()
            try:
                value=fn();report['tests'].append({'name':name,'status':'PASS','seconds':round(time.perf_counter()-start,3),'detail':value});print('PASS',name,flush=True)
            except Exception as e:
                report['tests'].append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True);page.screenshot(path=str(out/'failure.png'));raise
        try:
            boot()
            check('Boot registers all ten workflows and preserves 67 web apps',lambda:js("assert([...OS.apps.values()].filter(a=>!a.webApp).length===28);assert(OS.webCatalog.apps.length===67);for(const id of ['files','archives','clipboard','focus','widgets','workspaces','history','storage','accessibility','recorder'])assert(OS.apps.has(id));assert(!document.querySelector('.web-app-frame'));return {apps:OS.apps.size,storage:OS.db.mode};"))
            def explorer():
                clean();js("await OS.fs.write('/Documents/Feature note.txt','Preview text Ω','text/plain');")
                launch('files',{'path':'/Documents'})
                page.get_by_role('button',name='New folder tab',exact=True).click()
                page.locator('.explorer-sidebar').get_by_role('button',name='Pictures',exact=True).click()
                page.wait_for_function('w.state.path==="/Pictures"')
                assert page.get_by_role('tab').count()==2
                page.get_by_role('tab',name='Documents',exact=True).click()
                page.wait_for_function('w.state.path==="/Documents"')
                page.get_by_role('textbox',name='Search this folder').fill('ext:txt feature')
                page.locator('.file-row[data-path="/Documents/Feature note.txt"]').click()
                page.wait_for_function('document.querySelector(".explorer-text-preview")?.textContent.includes("Preview text Ω")')
                page.get_by_role('button',name='Pin to favorites',exact=True).click()
                page.wait_for_function('Aster.fileFavorites.includes("/Documents/Feature note.txt")')
                state=js('return structuredClone(w.state);')
                clean();launch('files',{'state':state})
                assert page.get_by_role('tab').count()==2
                assert page.get_by_role('textbox',name='Search this folder').input_value()=='ext:txt feature'
                page.get_by_role('button',name='Close tab Pictures',exact=True).click()
                assert page.get_by_role('tab').count()==1
                page.screenshot(path=str(out/'explorer-tabs.png'))
                return 'Independent folder tabs, saved query, preview, favorite and close-tab operation'
            check('Explorer real tabs, per-tab search, preview and favorites',explorer)
            def history():
                clean()
                result=js("""await OS.fs.write('/Documents/Versions.txt','one','text/plain');await OS.fs.write('/Documents/Versions.txt','two','text/plain');await OS.fs.write('/Documents/Versions.txt','three','text/plain');const rows=await OS.history.list('/Documents/Versions.txt');assert(rows.length===2);const one=(await Promise.all(rows.map(x=>OS.history.get(x.id)))).find(e=>e.content==='one');assert(one);const copy=await OS.history.restore(one.id,true);assert(await OS.fs.text(await OS.fs.read(copy))==='one');assert(await OS.fs.text(await OS.fs.read('/Documents/Versions.txt'))==='three');await OS.history.restore(one.id);assert(await OS.fs.text(await OS.fs.read('/Documents/Versions.txt'))==='one');const all=await OS.history.list('/Documents/Versions.txt');assert(all.length===3);return {copy,versions:all.length};""")
                launch('history',{'path':'/Documents/Versions.txt'})
                assert page.get_by_role('button',name='Restore copy',exact=True).count()==3
                page.get_by_role('button',name='Preview',exact=True).first.click()
                page.get_by_role('dialog').get_by_role('button',name='Done',exact=True).click()
                page.screenshot(path=str(out/'file-history.png'))
                return result
            check('Atomic versioned save, non-destructive restore copy and preview',history)
            def archives():
                clean();buffer=io.BytesIO()
                with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('independent/Zażółć.txt','Python-created ZIP Ω');z.writestr('raw.bin',bytes(range(256)))
                result=js("""const bytes=Uint8Array.from(atob(arg),c=>c.charCodeAt(0));await OS.fs.write('/Downloads/Independent.zip',new Blob([bytes]),'application/zip');const root=await OS.archives.extract('/Downloads/Independent.zip','/Documents');assert(await OS.fs.text(await OS.fs.read(root+'/independent/Zażółć.txt'))==='Python-created ZIP Ω');await OS.archives.create([root],'/Downloads/Browser.zip');const second=await OS.archives.extract('/Downloads/Browser.zip','/Downloads');assert(await OS.fs.text(await OS.fs.read(second+'/'+OS.fs.name(root)+'/independent/Zażółć.txt'))==='Python-created ZIP Ω');const blob=await OS.fs.blob(await OS.fs.read('/Downloads/Browser.zip'));return {root,size:blob.size,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};""",base64.b64encode(buffer.getvalue()).decode())
                raw=bytes(result.pop('bytes'))
                with zipfile.ZipFile(io.BytesIO(raw)) as z:
                    assert z.testzip() is None
                    assert z.read('Independent extracted/independent/Zażółć.txt').decode()=='Python-created ZIP Ω'
                    assert z.read('Independent extracted/raw.bin')==bytes(range(256))
                (out/'browser-created.zip').write_bytes(raw)
                launch('archives',{'path':'/Downloads/Browser.zip'})
                assert page.get_by_role('button',name='Extract to Downloads',exact=True).is_enabled()
                return result
            check('ZIP interoperability with independent Python ZIP/DEFLATE and Unicode',archives)
            check('ZIP failure is bounded and never commits a partial extraction',lambda:js("""const before=(await OS.db.all()).length;await OS.fs.write('/Downloads/Broken.zip',new Blob([new Uint8Array(50)]),'application/zip');let error='';try{await OS.archives.extract('/Downloads/Broken.zip','/Documents');}catch(e){error=e.message;}assert(error);assert((await OS.db.all()).length===before+1);return error;"""))
            check('Archive work stays off the UI thread and conflicting commits are atomic',lambda:js("""let pulses=0;const timer=setInterval(()=>pulses++,1);const b=await AsterZIP.run('pack',[{name:'large.txt',bytes:new Uint8Array(4*1024*1024)}]);clearInterval(timer);assert(pulses>0);let rejected=false;try{await OS.db.mutateFiles(()=>({puts:[{path:'/Documents/NoPartial.txt',kind:'file',content:'temporary',size:9},{path:'/Documents/Versions.txt',kind:'file',content:'must not overwrite',size:18}]}));}catch{rejected=true;}assert(rejected);assert(!await OS.fs.stat('/Documents/NoPartial.txt'));assert(await OS.fs.text(await OS.fs.read('/Documents/Versions.txt'))==='one');return {uiPulses:pulses,archiveBytes:b.size,atomicCollision:true};"""))
            def clipboard():
                clean();launch('notepad');page.locator('.notepad-editor').fill('Hello world')
                js("await OS.setSetting('clipboardHistory',true);const input=document.querySelector('.notepad-editor');input.focus();input.setSelectionRange(0,5);")
                page.keyboard.press('Control+c')
                page.wait_for_function('Aster.clipboardText.model.entries.some(e=>e.text==="Hello")')
                js('OS.clipboardText.model.clear(true);await OS.clipboardText.save();')
                js("await OS.setSetting('clipboardHistory',true);const input=document.querySelector('.notepad-editor');input.focus();input.setSelectionRange(6,11);OS.clipboardText.remember(input);await OS.clipboardText.add('Aster Ω');")
                launch('clipboard')
                page.get_by_role('button',name='Pin',exact=True).click();page.get_by_role('button',name='Paste',exact=True).click()
                assert page.locator('.notepad-editor').input_value()=='Hello Aster Ω'
                check_result=js("const n=OS.clipboardText.model.entries.length;const password=document.createElement('input');password.type='password';password.value='DO NOT SAVE';document.body.append(password);password.dispatchEvent(new Event('copy',{bubbles:true}));password.remove();assert(OS.clipboardText.model.entries.length===n);assert(OS.clipboardText.model.saved().length===1);return 'Explicit opt-in, actual editor replacement, pinned persistence payload and password exclusion';")
                return check_result
            check('Clipboard history pastes into original editor and excludes passwords',clipboard)
            def focus():
                clean();launch('focus')
                page.get_by_role('spinbutton',name='Session minutes').fill('1');page.get_by_role('button',name='Start focus',exact=True).click()
                page.wait_for_function('Aster.focusSession.state.status==="running"')
                js("document.querySelectorAll('.toast').forEach(e=>e.remove());OS.notify('Quiet test','ordinary');assert(!document.querySelector('.toast'));assert(OS.notifications[0].title==='Quiet test');assert(OS.settings.dnd===false);")
                page.get_by_role('button',name='Pause',exact=True).click();page.wait_for_function('Aster.focusSession.state.status==="paused"');js('assert(!OS.quiet.active());')
                page.get_by_role('button',name='Resume',exact=True).click()
                js('OS.focusSession.state.endAt=Date.now()-1;')
                page.wait_for_function('Aster.focusSession.state.status==="complete"')
                result=js("assert(OS.focusSession.today()===1);assert(OS.settings.dnd===false);assert(OS.notifications.some(n=>n.title==='Focus session complete'));return {minutes:OS.focusSession.today(),manualDND:OS.settings.dnd};")
                page.screenshot(path=str(out/'focus.png'));return result
            check('Focus timer, pause/resume, notification suppression and daily goal',focus)
            def widgets():
                clean();js("await OS.db.set('tasks',[{id:'widget-task',title:'Complete through widget',done:false}]);")
                launch('tasks');launch('widgets');page.get_by_role('textbox',name='Widget quick note').fill('Pinned thought Ω')
                page.wait_for_timeout(350)
                page.get_by_role('checkbox',name='Complete through widget',exact=True).click()
                page.wait_for_function("!document.querySelector('[data-widget=tasks]').textContent.includes('Complete through widget')")
                page.get_by_role('button',name='Move Quick note up',exact=True).click()
                page.wait_for_function('Aster.widgetBoard.order.indexOf("notes")===2')
                page.locator('summary').click();page.get_by_role('checkbox',name='Storage',exact=True).uncheck()
                page.wait_for_function('Aster.widgetBoard.hidden.includes("storage")')
                page.screenshot(path=str(out/'widget-board.png'))
                return js("await OS.featureFlush();assert((await OS.db.get('tasks'))[0].done);assert(document.querySelector('.tasks-main').textContent.includes('1 completed'));assert(!document.querySelector('.tasks-main .todo-row'));assert((await OS.db.get('widget-board')).note==='Pinned thought Ω');return OS.widgetBoard;")
            check('Widgets update real Tasks, autosave notes and persist customization',widgets)
            def groups():
                clean();launch('notepad',{'path':'/Documents/Ideas.txt'});launch('terminal');launch('workspaces')
                result=js("""const wins=[...OS.windows.values()].filter(w=>w.appId!=='workspaces');OS.workspaces.arrange('columns',wins.map(w=>w.id));const group=await OS.workspaces.save('Review desk');const positions=wins.map(w=>({...w.rect}));wins.forEach(w=>w.minimize());const restored=await OS.workspaces.restore(group.id);assert(restored.length===2);assert(restored.every(w=>!w.minimized));assert(OS.windows.size===3);const again=await OS.workspaces.restore(group.id);assert(again.length===2 && OS.windows.size===3);const desktop=await OS.addDesktop();desktop.name='Research';desktop.wallpaper='sage';await OS.db.set('desktops',OS.desktops);assert(OS.effectiveWallpaper()==='sage');OS.switchDesktop(group.desktop);return {entries:group.entries.length,reused:true,desktops:OS.desktops.length};""")
                page.evaluate('w.restore()');page.get_by_role('button',name='Restore group',exact=True).click()
                return result
            check('Named window groups arrange, persist and reuse windows; per-desktop wallpaper',groups)
            def storage():
                clean()
                result=js("""const old=Date.now()-40*86400000;await OS.db.batch([{path:'/.Trash/old',kind:'directory',originalPath:'/Documents/old',deletedAt:old,modified:old},{path:'/.Trash/old/a.txt',kind:'file',size:3,content:'old',modified:old},{path:'/.Trash/new.txt',kind:'file',originalPath:'/Downloads/new.txt',deletedAt:Date.now(),modified:Date.now(),size:3,content:'new'},{path:'/Downloads/Keep.txt',kind:'file',size:4,content:'keep',modified:old}]);assert(OS.storageSense.policy.enabled===false);const scan=await OS.storageSense.scan(),approved=OS.storageSense.eligible(scan.entries,30);assert(approved.some(e=>e.path==='/.Trash/old'));const result=await OS.storageSense.clean(30,approved);assert(!await OS.fs.stat('/.Trash/old/a.txt'));assert(await OS.fs.stat('/.Trash/new.txt'));assert(await OS.fs.stat('/Downloads/Keep.txt'));return result;""")
                launch('storage');page.get_by_role('button',name='Review cleanup',exact=True).click()
                page.screenshot(path=str(out/'storage-manager.png'));return result
            check('Storage Sense deletes only aged approved trash, retaining Downloads and recent trash',storage)
            def accessibility():
                clean();launch('accessibility');page.get_by_label('Color filter',exact=True).select_option('grayscale')
                page.get_by_role('checkbox',name='Reading guide follows pointer',exact=True).check();page.mouse.move(400,350)
                page.wait_for_function('document.querySelector("#reading-guide").style.top==="332px"')
                result=js("assert(getComputedStyle(document.querySelector('#window-layer')).filter==='grayscale(1)');assert(document.body.classList.contains('reading-guide-on'));return {filter:OS.settings.colorFilter,localVoices:!!document.querySelector('select[aria-label=\"Local read aloud voice\"] option')};")
                page.get_by_role('button',name='Load virtual text file',exact=True).click();page.get_by_role('dialog').get_by_role('button',name='Save',exact=True).click()
                page.wait_for_function('document.querySelector(".accessible-reader").value.length>0')
                js("await OS.setSetting('colorFilter','none');await OS.setSetting('readingGuide',false);")
                return result
            check('Accessibility filters, pointer reading guide and safe text reader',accessibility)
            def theme_and_hub():
                clean();launch('settings',{'section':'system'})
                page.locator('.settings-breadcrumb h1').filter(has_text='System').wait_for()
                for name in ['Storage','Clipboard','Focus','Multitasking','Recovery']:
                    assert page.locator('.settings-main').get_by_role('button',name=name,exact=False).count()>=1
                assert not page.locator('.settings-main').get_by_role('button',name='Open',exact=True).count()
                js("await OS.setSetting('theme','dark');await OS.setSetting('highContrast',true);")
                launch('widgets');page.screenshot(path=str(out/'widgets-dark.png'))
                js("await OS.setSetting('theme','light');await OS.setSetting('highContrast',false);")
                clean();page.keyboard.press('Control+Alt+f');page.wait_for_selector('[data-app=clock] .focus-countdown');js("assert(OS.windows.size===1);")
                return 'Natural System destinations, dark/high-contrast styling and Focus shortcut in a single Clock window'
            check('Integrated Settings, themes and Clock shortcut expose existing services',theme_and_hub)
            def recorder():
                clean();launch('recorder')
                js("""window.captureFixture=document.createElement('canvas');captureFixture.width=160;captureFixture.height=96;const c=captureFixture.getContext('2d');let i=0;window.fixtureTimer=setInterval(()=>{c.fillStyle=i++%2?'#00aa88':'#2266dd';c.fillRect(0,0,160,96);},50);const getDisplayMedia=async()=>{window.fixtureStream=captureFixture.captureStream(15);return fixtureStream;};if(!navigator.mediaDevices)Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getDisplayMedia}});else Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:getDisplayMedia});""")
                page.get_by_role('button',name='Choose screen & record',exact=True).click();page.wait_for_function('w.recorder.state==="recording"');page.wait_for_timeout(1200)
                page.get_by_role('button',name='Pause',exact=True).click();page.wait_for_function('w.recorder.state==="paused"');page.get_by_role('button',name='Resume',exact=True).click();page.wait_for_timeout(500)
                page.get_by_role('button',name='Stop',exact=True).click();page.wait_for_function('w.recorder.state==="complete" && w.recorder.blob?.size>0')
                page.wait_for_function('document.querySelector(".recorder-preview").readyState>=2')
                result=js("assert(document.querySelector('.recorder-preview').videoWidth===160);assert(fixtureStream.getTracks().every(t=>t.readyState==='ended'));return {bytes:w.recorder.blob.size,type:w.recorder.blob.type,width:document.querySelector('.recorder-preview').videoWidth,fixture:'Canvas MediaStream; real recorder and decoder'};")
                page.get_by_role('button',name='Save to Videos',exact=True).click();page.wait_for_function('!w.dirty')
                js("assert((await OS.fs.list('/Videos')).some(e=>/^Recording /.test(OS.fs.name(e.path))));clearInterval(fixtureTimer);")
                page.screenshot(path=str(out/'screen-recorder.png'));return result
            check('Screen Recorder produces a decodable video, pauses/resumes, stops tracks and saves',recorder)
            check('Recorder permission denial and close-during-permission release every track',lambda:js("""Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{throw new DOMException('denied','NotAllowedError')}});const r=new OS.ScreenRecorder();try{await r.start();}catch{}assert(r.state==='error'&&r.error.includes('denied'));let resolve;Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:()=>new Promise(r=>resolve=r)});const pending=new OS.ScreenRecorder(),job=pending.start().catch(e=>e.name);pending.dispose();const stream=captureFixture.captureStream(10);resolve(stream);assert(await job==='AbortError');assert(stream.getTracks().every(t=>t.readyState==='ended'));return 'Denied permission and cancelled pending capture cleanly handled';"""))
            if not args.inject:
                def persistence():
                    js("await OS.featureFlush();await OS.db.set('settings',{...OS.settings,restore:false});")
                    page.reload(wait_until='load');page.wait_for_function('Aster.booted')
                    return js("assert(OS.db.mode==='IndexedDB');assert(OS.clipboardText.model.entries.some(e=>e.pinned&&e.text==='Aster Ω'));assert(OS.widgetBoard.note==='Pinned thought Ω');assert(OS.workspaces.groups.some(g=>g.name==='Review desk'));assert((await OS.history.list('/Documents/Versions.txt')).length>=3);return {database:OS.db.db.version,history:(await OS.history.list()).length};")
                check('Full reload retains history, clipboard pins, widget notes and saved layouts',persistence)
                def migration():
                    upgrade=browser.new_context(service_workers='block');tab=upgrade.new_page();tab.goto(origin+'/upgrade-fixture')
                    tab.evaluate("""()=>new Promise((resolve,reject)=>{const r=indexedDB.open('aster-desktop',1);r.onupgradeneeded=()=>{r.result.createObjectStore('files',{keyPath:'path'});r.result.createObjectStore('meta');};r.onsuccess=()=>{const db=r.result,tx=db.transaction(['files','meta'],'readwrite');tx.objectStore('files').put({path:'/Documents',kind:'directory'});tx.objectStore('files').put({path:'/Documents/Legacy.txt',kind:'file',content:'legacy',mime:'text/plain',size:6});tx.objectStore('meta').put('keep','legacy-marker');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};})""")
                    tab.goto(origin);tab.wait_for_function('Aster.booted');value=tab.evaluate("async()=>({version:Aster.db.db.version,old:await Aster.fs.text(await Aster.fs.read('/Documents/Legacy.txt')),marker:await Aster.db.get('legacy-marker')})")
                    assert value=={'version':2,'old':'legacy','marker':'keep'};upgrade.close();return value
                check('Existing version-1 database migrates without losing files or metadata',migration)
            else:report['limits'].append('Injected local browser has no durable origin; reload and schema-migration tests run in hosted HTTP CI only.')
            def mobile():
                clean();page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
                for id in ['clipboard','focus','widgets','workspaces','history','storage','accessibility','recorder','archives']:
                    clean();launch(id)
                    overflow=js("return [...document.querySelectorAll('.suite-app')].some(el=>el.scrollWidth>el.clientWidth+2);")
                    assert not overflow,id
                clean();launch('widgets');page.screenshot(path=str(out/'widgets-mobile.png'));return 'All nine new apps fit a 390-pixel viewport without horizontal overflow'
            check('All new workflows are usable in narrow mobile windows',mobile)
            def standalone():
                clean();page.set_viewport_size({'width':1440,'height':1000});boot(True);context.set_offline(True)
                for id in ['archives','clipboard','focus','widgets','workspaces','history','storage','accessibility','recorder']:
                    clean();launch(id)
                clean();context.set_offline(False);return 'Standalone embeds all ten workflows; no remote app code required'
            check('Standalone edition mounts every workflow offline and cleans up',standalone)
            assert not report['errors'],report['errors']
        finally:
            report['passed']=sum(t['status']=='PASS' for t in report['tests']);report['failed']=sum(t['status']=='FAIL' for t in report['tests']);(out/'browser-results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inject',action='store_true');parser.add_argument('--browser');main(parser.parse_args())
