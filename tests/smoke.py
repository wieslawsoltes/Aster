"""Aster integration tests. Install test-only dependency: pip install playwright.
Normal: python tests/smoke.py --browser /path/to/chromium
Restricted navigation environments: add --inject (memory storage; no SW/GPU claims).
No npm packages or testing dependencies are needed to run Aster itself.
"""
import argparse, asyncio, json, re, threading, time
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'tests'/'results.json'

async def load(page, inject=False, port=8766, url=None):
    if inject:
        html=(ROOT/'index.html').read_text()
        html=re.sub(r'<script\b[^>]*src="[^"]+"[^>]*>\s*</script>','',html)
        html=re.sub(r'<link\b[^>]*>','',html)
        await page.set_content(html)
        await page.add_style_tag(content=(ROOT/'src/styles.css').read_text())
        await page.evaluate('window.ASTER_STANDALONE=true')
        for name in ['core','renderer','windows','apps-files','apps-creative','apps-tools','apps-system','win32/gdi','apps-win32','shell']:
            await page.add_script_tag(content=(ROOT/f'src/{name}.js').read_text())
    else:
        await page.goto(url or f'http://localhost:{port}',wait_until='networkidle')
    await page.wait_for_function('window.Aster?.booted',timeout=30000)
    await page.evaluate('Promise.all([...Aster.windows.values()].map(w=>w.ready))')

async def main(args):
    results=[];errors=[];console=[]
    async with async_playwright() as p:
        options={'headless':True,'args':['--no-sandbox']}
        if args.browser: options['executable_path']=args.browser
        if args.webgpu: options['args']+=['--enable-unsafe-webgpu','--use-angle=swiftshader','--enable-unsafe-swiftshader']
        browser=await p.chromium.launch(**options)
        context=await browser.new_context(viewport={'width':1440,'height':960},timezone_id='Europe/Warsaw',accept_downloads=True)
        page=await context.new_page();page.set_default_timeout(7000)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:console.append({'level':m.type,'text':m.text}))
        await load(page,args.inject,url=args.url)
        async def check(name, action):
            t=time.perf_counter()
            try:
                detail=await action()
                results.append({'test':name,'status':'PASS','seconds':round(time.perf_counter()-t,3),'detail':detail})
                print('PASS',name,flush=True)
            except Exception as e:
                results.append({'test':name,'status':'FAIL','seconds':round(time.perf_counter()-t,3),'error':str(e)})
                print('FAIL',name,str(e)[:200],flush=True)
                try:
                    await page.screenshot(path=str(ROOT/'tests'/('failure-'+re.sub(r'[^a-z0-9]+','-',name.lower())+'.png')))
                    await page.evaluate("document.querySelectorAll('.dialog-backdrop').forEach(x=>x.remove());Aster.closePanels()")
                except Exception: pass
        async def js(code):return await page.evaluate('async()=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+code+'}')
        async def clean():
            await page.evaluate('async()=>{Aster.closePanels();for(const w of [...Aster.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(x=>x.remove())}')
        async def launch(app,options=None):
            await clean()
            return await page.evaluate('async ([app,o])=>{const w=Aster.launch(app,o);await w.ready;window.testWindow=w;if(w.body.querySelector(".app-error"))throw Error(w.body.innerText);return w.id}',[app,options or {}])
        await check('Boot and 19 registered built-in apps',lambda:js("assert(OS.apps.size===19);assert(OS.windows.size===1);assert(document.querySelector('#taskbar button'));return OS.metrics.mode;"))
        await check('Virtual file CRUD, subtree copy, move, recycle, restore',lambda:js("""
            assert(OS.fs.normalize('/Documents/../Projects/./a')==='/Projects/a');
            await OS.fs.mkdir('/Documents/Test Suite');await OS.fs.mkdir('/Documents/Test Suite/nested');
            await OS.fs.write('/Documents/Test Suite/nested/α.txt','Hello, Aster!');
            await OS.fs.copy('/Documents/Test Suite','/Documents/Test Copy');
            assert(await OS.fs.text(await OS.fs.read('/Documents/Test Copy/nested/α.txt'))==='Hello, Aster!');
            await OS.fs.copy('/Documents/Test Copy','/Documents/Moved',true);assert(!await OS.fs.stat('/Documents/Test Copy'));
            await OS.fs.remove('/Documents/Moved');assert(!await OS.fs.stat('/Documents/Moved'));
            const trash=(await OS.fs.list('/.Trash')).find(x=>x.originalPath==='/Documents/Moved');assert(trash);
            const restored=await OS.fs.restore(trash.path);assert(restored==='/Documents/Moved');assert(await OS.fs.stat(restored+'/nested/α.txt'));
            return 'Unicode content and nested folder structure preserved';
        """))
        await check('Protected folders and invalid destinations reject safely',lambda:js("""
            const operations=[()=>OS.fs.remove('/Documents'),()=>OS.fs.copy('/Documents','/Projects/Docs',true),()=>OS.fs.copy('/Documents/Test Suite','/Documents/Test Suite/inside'),()=>OS.fs.write('/Local/absent/test.txt','x'),()=>OS.fs.mkdir('/Local/absent')];
            let rejected=0;for(const op of operations){try{await op();}catch{rejected++;}}assert(rejected===operations.length);return rejected+' rejected operations';
        """))
        await check('Calculator parser arithmetic, scientific functions and errors',lambda:js("""
            const cases=[['2+3*4',14],['(2+3)*4',20],['2^3^2',512],['-2^2',-4],['5!',120],['sqrt(81)',9],['sin(30)',.5],['2pi',Math.PI*2],['10%',.1]];
            for(const [expr,v]of cases)assert(Math.abs(OS.calculate(expr)-v)<1e-9,expr+' = '+OS.calculate(expr));
            let failures=0;for(const expr of ['1/0','sqrt(-1)','alert(1)','2+','171!'])try{OS.calculate(expr);}catch{failures++;}assert(failures===5);return cases.length+' arithmetic and 5 rejection cases';
        """))
        # Every app must mount real controls without an error placeholder.
        appids=await page.evaluate('[...Aster.apps.keys()]')
        for app in appids:
            async def appmount(app=app):
                await launch(app)
                await page.wait_for_timeout(90)
                return await js("assert(testWindow.body.childElementCount>0);assert(!testWindow.body.querySelector('.app-error'));return testWindow.body.querySelectorAll('button,input,textarea,canvas,iframe').length+' controls';")
            await check('App mount: '+app,appmount)
        async def notepad():
            await launch('notepad')
            editor=page.locator('[data-app="notepad"] textarea').first
            await editor.fill('Aster integration test\nUTF-8: zażółć gęślą jaźń.\n2 + 2 = 4')
            await editor.press('Control+s')
            dialog=page.get_by_role('dialog')
            await dialog.locator('input').fill('/Documents/Test note.txt')
            await dialog.get_by_role('button',name='Save',exact=True).click()
            await page.wait_for_timeout(160)
            return await js("assert((await OS.fs.text(await OS.fs.read('/Documents/Test note.txt'))).includes('zażółć'));assert(!testWindow.dirty);return 'Ctrl+S saved Unicode text';")
        await check('Notepad actual typing and Ctrl+S save',notepad)
        async def dirtyguard():
            await page.locator('[data-app="notepad"] textarea').first.fill('Unsaved replacement')
            await page.locator('[data-app="notepad"] .window-controls button[aria-label="Close"]').click()
            await page.get_by_role('dialog').get_by_role('button',name='Cancel',exact=True).click()
            return await js('assert(OS.windows.has(testWindow.id)&&testWindow.dirty);')
        await check('Unsaved document close can be cancelled',dirtyguard)
        async def terminal():
            await launch('terminal',{'cwd':'/Documents'})
            return await js("""
                for(const command of ['mkdir "Terminal Test"','cd "Terminal Test"','echo hello world > "a file.txt"','cp "a file.txt" b.txt','mv b.txt c.txt','cat c.txt'])await testWindow.runCommand(command);
                const text=await OS.fs.text(await OS.fs.read('/Documents/Terminal Test/c.txt'));assert(text.trim()==='hello world',text);assert(testWindow.body.innerText.includes('hello world'));return 'Quoted names, redirection, cp, mv and cat';
            """)
        await check('Terminal commands manipulate real virtual files',terminal)
        async def wm():
            await launch('notepad',{'path':'/Documents/Ideas.txt'})
            box=await page.locator('[data-app="notepad"] .titlebar').bounding_box()
            original=await page.evaluate('({...testWindow.rect})')
            await page.mouse.move(box['x']+180,box['y']+18);await page.mouse.down();await page.mouse.move(box['x']+255,box['y']+58,steps=12);await page.mouse.up()
            await page.wait_for_timeout(50)
            moved=await page.evaluate('({...testWindow.rect})')
            assert moved['x']>original['x']+50 and moved['y']>original['y']+20,(original,moved)
            handle=await page.locator('[data-app="notepad"] .resize-handle.se').bounding_box()
            await page.mouse.move(handle['x']+handle['width']/2,handle['y']+handle['height']/2);await page.mouse.down();await page.mouse.move(handle['x']+55,handle['y']+35,steps=12);await page.mouse.up()
            return await js("assert(testWindow.rect.w>"+str(moved['w'])+");testWindow.snap('left');assert(testWindow.rect.x===8,'Snap margin');assert(Math.abs(testWindow.rect.w-(innerWidth-24)/2)<3,'Snap width');testWindow.minimize();assert(testWindow.minimized);testWindow.restore();assert(!testWindow.minimized);testWindow.toggleMaximize();assert(testWindow.maximized);testWindow.toggleMaximize();assert(!testWindow.maximized);return 'Pointer drag/resize and snap/minimize/maximize/restore';")
        await check('Window manager pointer drag, resize and state transitions',wm)
        async def desktops():
            return await js("const d=await OS.addDesktop();const id=typeof d==='string'?d:d?.id||OS.desktops.at(-1).id;OS.switchDesktop(id);assert(OS.activeDesktop===id);assert(testWindow.el.classList.contains('other-desktop'));testWindow.desktop=id;testWindow.sync();OS.emit('windows');assert(!testWindow.el.classList.contains('other-desktop'));OS.switchDesktop('desk-1');return OS.desktops.length+' desktops';")
        await check('Virtual desktop switching and window transfer',desktops)
        async def startsearch():
            await clean();await page.locator('#start-button').click()
            field=page.locator('.start-menu input')
            await field.fill('calculator');await page.wait_for_timeout(100)
            await field.press('Enter');await page.wait_for_timeout(150)
            return await js("assert([...OS.windows.values()].some(w=>w.appId==='calculator'));return 'Start search launches app';")
        await check('Start menu app search and keyboard launch',startsearch)
        async def filessearch():
            await launch('files',{'path':'/Documents'})
            await page.locator('[data-app="files"] input[placeholder^="Search"]').fill('Test note')
            await page.wait_for_timeout(200)
            return await js("assert(testWindow.body.innerText.includes('Test note.txt'));assert(!testWindow.body.querySelector('.file-list')?.innerText.includes('Ideas.txt'));return 'File search finds saved document';")
        await check('File Explorer searches actual saved file',filessearch)
        async def paint():
            await launch('paint')
            canvas=page.locator('[data-app="paint"] .paint-canvas')
            if not await canvas.count():canvas=page.locator('[data-app="paint"] canvas').first
            b=await canvas.bounding_box()
            await page.mouse.move(b['x']+50,b['y']+55);await page.mouse.down();await page.mouse.move(b['x']+180,b['y']+140,steps=20);await page.mouse.up()
            # Start Save, answer its dialog, then await the actual file operation.
            await page.evaluate("()=>{window.paintSaveOperation=testWindow.save();}")
            d=page.get_by_role('dialog');await d.locator('input').fill('/Pictures/Test drawing.png');await d.get_by_role('button',name='Save',exact=True).click()
            await page.evaluate('window.paintSaveOperation')
            return await js("const f=await OS.fs.read('/Pictures/Test drawing.png');assert(f.content instanceof Blob&&f.size>1000);const sig=new Uint8Array(await f.content.slice(0,8).arrayBuffer());assert(sig[0]===137&&sig[1]===80);return 'Pointer drawing saved as a real PNG ('+f.size+' bytes)';")
        await check('Paint pointer drawing and real PNG save',paint)
        async def photos():
            await launch('photos',{'path':'/Pictures/Test drawing.png'})
            await page.wait_for_function("[...testWindow.body.querySelectorAll('img')].some(i=>i.complete&&i.naturalWidth===960)")
            return await js("return [...testWindow.body.querySelectorAll('img')].filter(i=>i.naturalWidth).map(i=>i.naturalWidth+'×'+i.naturalHeight);")
        await check('Photos decodes the newly created PNG',photos)
        async def code():
            await launch('code')
            iframe=page.locator('[data-app="code"] iframe').first
            frame=await iframe.element_handle();frame=await frame.content_frame()
            await frame.wait_for_selector('button')
            before=await frame.locator('button').first.inner_text();await frame.locator('button').first.click()
            after=await frame.locator('button').first.inner_text();assert before!=after,(before,after)
            denied=await frame.evaluate("(()=>{try{return !!parent.Aster}catch(e){return e.name}})()")
            assert denied=='SecurityError',denied
            await page.evaluate("void testWindow.save()")
            d=page.get_by_role('dialog');await d.locator('input').fill('/Projects/Test Code');await d.get_by_role('button',name='Save',exact=True).click();await page.wait_for_timeout(200)
            return await js("assert(await OS.fs.stat('/Projects/Test Code/app.html'));assert(await OS.fs.stat('/Projects/Test Code/script.js'));return 'Real sandbox JS ran; parent access denied; project saved';")
        await check('Code Studio executes sandbox app and saves project',code)
        async def browserlocal():
            await launch('browser',{'path':'/Projects/Hello Aster.html'})
            iframe=await page.locator('[data-app="browser"] iframe').first.element_handle();frame=await iframe.content_frame()
            await frame.wait_for_selector('#count');await frame.locator('#count').click()
            assert '1' in await frame.locator('#count').inner_text()
            return 'Local HTML button executed'
        await check('Orbit Browser runs local HTML application',browserlocal)
        async def media():
            await launch('media')
            await page.wait_for_function('testWindow.mediaElement?.()?.duration>0')
            await page.evaluate('testWindow.mediaElement().play()')
            await page.wait_for_timeout(200)
            return await js("assert(testWindow.mediaElement().currentTime>0);await OS.setSetting('volume',40);assert(Math.abs(testWindow.mediaElement().volume-.4)<.001);return 'WAV duration '+testWindow.mediaElement().duration+' seconds; playback clock advances';")
        await check('Media Player actual audio decode and playback',media)
        async def taskcalendar():
            await launch('tasks');await page.evaluate("testWindow.addTask('Integration task')")
            await js("assert((await OS.db.get('tasks')).some(t=>t.title==='Integration task'));")
            await launch('calendar');return await js("await testWindow.addEvent({title:'Integration event',date:'2026-09-08',time:'10:30',notes:'Local only',reminder:true});assert((await OS.db.get('calendarEvents')).some(e=>e.title==='Integration event'));return 'Tasks and calendar written to workspace store';")
        await check('Tasks and Calendar store editable records',taskcalendar)
        async def mines():
            await launch('mines')
            return await js("const g=testWindow.game;g.reveal(0);assert(!g.over,'First click must be safe');assert(g.cells.filter(c=>c.mine).length===g.mines);for(let i=0;i<g.cells.length;i++)if(!g.cells[i].mine)g.reveal(i);assert(g.won&&g.over);return 'Safe first click, correct mine count and win detection';")
        await check('Mines game logic and completion',mines)
        async def settings():
            await launch('settings')
            for section in ['personalization','apps','storage','accessibility','about','system']:
                await page.evaluate('testWindow.navigate("'+section+'")');await page.wait_for_timeout(60)
                assert not await page.locator('[data-app="settings"] .app-error').count()
            return await js("await OS.setSetting('theme','dark');assert(document.body.dataset.theme==='dark');await OS.setSetting('theme','light');assert(document.body.dataset.theme==='light');const sel=testWindow.body.querySelector('select[aria-label=clock24]');assert(sel);sel.value='false';sel.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,40));assert(OS.settings.clock24===false);return 'All 6 settings views and boolean clock preference';")
        await check('Settings views, themes and 12-hour preference',settings)
        async def backup():
            # Capture application export payload rather than OS save picker, then restore it.
            return await js("""
                const download=OS.download,read=OS.readFile,confirm=OS.confirm;let blob;
                try{OS.download=b=>blob=b;await OS.exportBackup();assert(blob);const packed=JSON.parse(await blob.text());assert(packed.format==='aster-desktop-backup');
                  await OS.fs.write('/Documents/Test note.txt','modified after backup');OS.readFile=async()=>[new File([blob],'backup.json',{type:'application/json'})];OS.confirm=async()=>true;await OS.importBackup();
                  assert((await OS.fs.text(await OS.fs.read('/Documents/Test note.txt'))).includes('zażółć'));assert((await OS.fs.read('/Pictures/Test drawing.png')).content instanceof Blob);
                  return packed.files.length+' file/folder records; text and binary round-trip';
                }finally{OS.download=download;OS.readFile=read;OS.confirm=confirm;}
            """)
        await check('Backup JSON text and binary round-trip',backup)
        async def install():
            return await js("""
                const read=OS.readFile,prompt=OS.prompt;
                try{OS.readFile=async()=>[new File(['<!doctype html><button onclick="this.textContent=42">Run</button>'],'Test App.html',{type:'text/html'})];OS.prompt=async()=> 'Test App';await OS.installHTML();const app=OS.customApps.find(a=>a.title==='Test App');assert(app);const w=OS.launch(app.id);await w.ready;window.testWindow=w;assert(w.body.querySelector('iframe').sandbox.contains('allow-scripts'));assert(!w.body.querySelector('iframe').sandbox.contains('allow-same-origin'));return app.id;}finally{OS.readFile=read;OS.prompt=prompt;}
            """)
        await check('HTML app installation and sandbox registration',install)
        async def notificationtimer():
            return await js("OS.timer.endAt=Date.now()-1;OS.timer.notified=false;await new Promise(r=>setTimeout(r,1400));assert(OS.timer.endAt===null&&OS.timer.notified);assert(OS.notifications.some(n=>n.message.includes('timer has finished')));return 'Expired timer triggers a real desktop notification';")
        await check('Timer expiry notification',notificationtimer)
        async def lock():
            await page.evaluate('Aster.lock()')
            await page.get_by_role('button',name='Resume your session').click()
            return await js("assert(!document.querySelector('.lock-screen'));return 'Visual lock and resume';")
        await check('Visual lock resumes without losing windows',lock)
        async def responsive():
            await clean()
            # A resize dismisses panels. Observe that real event before clicking Start.
            await page.evaluate("()=>{window.testResizeObserved=false;window.addEventListener('resize',()=>{window.testResizeObserved=true;},{once:true});}")
            await page.set_viewport_size({'width':390,'height':844})
            await page.wait_for_function('window.testResizeObserved && innerWidth===390')
            await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
            await page.locator('#start-button').click()
            await page.locator('.start-menu').wait_for(state='visible')
            r=await page.locator('.start-menu').bounding_box();assert r['x']>=0 and r['x']+r['width']<=391,r
            await page.screenshot(path=str(ROOT/'tests'/'mobile.png'))
            await page.set_viewport_size({'width':1440,'height':960});await clean()
            return '390×844 Start menu stays within viewport'
        await check('Narrow-screen layout',responsive)
        await check('No uncaught JavaScript exceptions',lambda:js('assert('+json.dumps(errors)+'.length===0,'+json.dumps('\n'.join(errors))+');'))
        # Authentic generated preview, not a static UI substitute.
        await clean();await page.set_viewport_size({'width':1600,'height':1000})
        await page.evaluate("async()=>{await Aster.setSetting('theme','light');await Aster.setSetting('clock24',true);Aster.switchDesktop('desk-1');const w=Aster.launch('files',{rect:{x:138,y:92,w:1020,h:700}});await w.ready;}")
        await page.wait_for_timeout(160)
        await page.screenshot(path=str(ROOT/'tests'/'desktop-light.png'))
        await page.evaluate('Aster.toggleStart()');await page.wait_for_timeout(100)
        await page.screenshot(path=str(ROOT/'tests'/'start-menu.png'))
        await page.evaluate("async()=>{Aster.closePanels();await Aster.setSetting('theme','dark');const w=Aster.launch('code',{rect:{x:442,y:190,w:1070,h:690}});await w.ready;}")
        await page.wait_for_timeout(160)
        await page.screenshot(path=str(ROOT/'tests'/'desktop-dark.png'))
        env=await page.evaluate('({storage:Aster.db.mode,renderer:Aster.metrics.mode,secureContext:isSecureContext,gpuAPI:!!navigator.gpu,userAgent:navigator.userAgent})')
        report={'environment':env,'mode':'injected local source' if args.inject else 'localhost','tests':results,'uncaughtErrors':errors,'console':console,'limitations':['Native folder and screen capture permission dialogs are not automated.','No physical-GPU performance benchmark was performed.']+(['Injected about:blank has an opaque origin: IndexedDB persistence, WebGPU initialization, and service-worker offline mode were not exercised.'] if args.inject else [])}
        REPORT.write_text(json.dumps(report,indent=2));print(json.dumps({'passed':sum(x['status']=='PASS'for x in results),'failed':sum(x['status']=='FAIL'for x in results),'report':str(REPORT)},indent=2),flush=True)
        await browser.close()
    return 1 if any(r['status']=='FAIL' for r in results) else 0

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inject',action='store_true');parser.add_argument('--browser');parser.add_argument('--webgpu',action='store_true');parser.add_argument('--url');args=parser.parse_args()
    server=None
    if not args.inject and not args.url:
        server=ThreadingHTTPServer(('127.0.0.1',8766),partial(SimpleHTTPRequestHandler,directory=str(ROOT)))
        threading.Thread(target=server.serve_forever,daemon=True).start()
    try: raise SystemExit(asyncio.run(main(args)))
    finally:
        if server:server.shutdown()
