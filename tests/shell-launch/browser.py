"""Real Aster Open with, Settings, Run and Jump List workflows. No app mocks.
--inject is memory-only fallback; CI additionally verifies HTTP reload/startup.
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
    out=args.output or ROOT/'tests/shell-launch/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}';report={'mode':'injected memory' if args.inject else 'standalone' if args.standalone else 'HTTP/IndexedDB','checks':[],'errors':[]}
    # Keep the browser's native policy. Playwright's 'block' option injects an
    # unguarded navigator.serviceWorker read into opaque-origin sandbox frames.
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow');page=context.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(body,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+body+'}',arg)
        def clean():js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def launch(app,options={}):
            id=js('const w=OS.openApp(arg.app,arg.options);await w.ready;return w.id;',{'app':app,'options':options});return page.locator(f'[data-window="{id}"]')
        def run(text):
            page.keyboard.press('Control+Alt+o');d=page.get_by_role('dialog',name='Run',exact=True);d.get_by_role('combobox',name='Run',exact=True).fill(text);d.get_by_role('button',name='OK',exact=True).click();page.wait_for_function('(text)=>Aster.shellLaunch.state.runHistory.includes(text)',arg=text)
        def check(name,fn):
            t=time.perf_counter()
            try:result=fn();report['checks'].append({'name':name,'status':'PASS','detail':result,'ms':round((time.perf_counter()-t)*1000)});print('PASS',name,flush=True)
            except Exception as e:report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
            page.wait_for_function('Aster.booted && Aster.shellLaunch');js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();');clean()
            js("await OS.fs.mkdir('/Documents/Launch');await OS.fs.write('/Documents/Launch/hello.html','<!doctype html><html><body><h1>Real document</h1></body></html>','text/html');await OS.fs.write('/Documents/Launch/note with spaces.txt','Opened the actual saved document');const c=document.createElement('canvas');c.width=c.height=20;c.getContext('2d').fillRect(0,0,20,20);await OS.fs.write('/Pictures/association.png',await new Promise(r=>c.toBlob(r)),'image/png');")
            def openwith():
                clean();launch('files',{'path':'/Documents/Launch'});page.locator('.file-row[data-path="/Documents/Launch/hello.html"]').click(button='right');page.get_by_role('menuitem',name='Open with…',exact=True).click();d=page.get_by_role('dialog',name='Open with',exact=True);d.locator('[data-handler="notepad"]').click();d.get_by_label('Always use this app',exact=True).check();page.screenshot(path=str(out/'open-with.png'));d.get_by_role('button',name='Open',exact=True).click();page.wait_for_function('[...Aster.windows.values()].some(w=>w.appId==="notepad"&&w.state.path==="/Documents/Launch/hello.html")');js("assert(OS.appForFile('/Documents/Launch/hello.html','text/html')==='notepad');assert(OS.windows.size===2);const w=[...OS.windows.values()].find(w=>w.appId==='notepad');await w.ready;assert(w.body.querySelector('textarea').value.includes('<h1>Real document</h1>')); ")
                return 'Chooser opens actual HTML bytes in Notepad and stores the extension association'
            check('Explorer Open with performs a real launch and remembers an explicit default',openwith)
            def once():
                clean();js("void OS.showOpenWith('/Documents/Launch/hello.html');");d=page.get_by_role('dialog',name='Open with',exact=True);d.locator('[data-handler="browser"]').click();assert not d.get_by_label('Always use this app',exact=True).is_checked();d.get_by_role('button',name='Open',exact=True).click();page.wait_for_function('[...Aster.windows.values()].some(w=>w.appId==="browser")');js("assert(OS.appForFile('/Documents/Launch/hello.html','text/html')==='notepad');const w=[...OS.windows.values()].find(w=>w.appId==='browser');await w.ready;assert(w.body.querySelector('iframe'));assert(!w.body.querySelector('iframe').sandbox.contains('allow-same-origin'));")
                page.frame_locator('.window[data-app="browser"] iframe').get_by_role('heading',name='Real document',exact=True).wait_for()
                child=page.locator('.window[data-app="browser"] iframe').element_handle().content_frame()
                assert child.evaluate("() => { try { return !parent.Aster; } catch(e) { return e.name === 'SecurityError'; } }")
            check('Open once leaves the stored default unchanged',once)
            def settings():
                clean();w=launch('settings',{'section':'apps'});w.get_by_text('Default apps',exact=True).locator('..').locator('..').get_by_role('button',name='Manage').click();w.get_by_label('Find a file type',exact=True).fill('.png');w.get_by_label('Default for .png',exact=True).select_option('paint');page.wait_for_function('Aster.shellLaunch.state.defaults.png==="paint"');page.screenshot(path=str(out/'default-apps.png'));js("assert(OS.windows.size===1);assert(OS.appForFile('/Pictures/association.png','image/png')==='paint');assert(OS.fileTypeApp('/Pictures/association.png','image/png')==='photos');const w=await OS.openPath('/Pictures/association.png');assert(w.appId==='paint');await w.ready;assert(w.body.querySelector('canvas')); ")
            check('Default apps stays in Settings and changes file dispatch without breaking gallery typing',settings)
            def props():
                clean();launch('files',{'path':'/Documents/Launch'});page.locator('.file-row[data-path="/Documents/Launch/hello.html"]').click(button='right');page.get_by_role('menuitem',name='Properties',exact=True).click();d=page.get_by_role('dialog',name='hello.html Properties',exact=True);assert 'Opens with: Notepad' in d.inner_text();d.get_by_role('button',name='Change…',exact=True).click();inner=page.get_by_role('dialog',name='Choose a default app');inner.locator('[data-handler="browser"]').click();inner.get_by_role('button',name='Set default',exact=True).click();page.wait_for_function('Aster.shellLaunch.state.defaults.html==="browser"');assert 'Opens with: Orbit Browser' in d.inner_text();d.get_by_role('button',name='OK',exact=True).click();js("assert(OS.windows.size===1);await OS.shellLaunch.setDefault('html','notepad');")
            check('File Properties changes the association without opening a separate utility app',props)
            def rundialog():
                clean();page.locator('#start-button').click(button='right');page.get_by_role('menuitem',name='Run',exact=False).click();d=page.get_by_role('dialog',name='Run',exact=True);d.get_by_role('combobox',name='Run',exact=True).fill('javascript:alert(1)');d.get_by_role('button',name='OK',exact=True).click();assert d.is_visible() and 'cannot find' in d.inner_text();js('assert(OS.windows.size===0)');d.get_by_role('combobox',name='Run',exact=True).fill('calc');page.screenshot(path=str(out/'run-dialog.png'));d.get_by_role('button',name='OK',exact=True).click();page.wait_for_function('Aster.shellLaunch.state.runHistory.includes("calc")');js("assert(OS.windows.size===1);assert([...OS.windows.values()][0].appId==='calculator');")
            check('Start context Run rejects script schemes and launches Calculator without a Run window',rundialog)
            def runpaths():
                clean();run('notepad "C:\\Documents\\Launch\\note with spaces.txt"');w=page.locator('.window[data-app="notepad"]');page.wait_for_function('[...Aster.windows.values()].some(w=>w.appId==="notepad"&&w.body.querySelector("textarea")?.value==="Opened the actual saved document")');run('ms-settings:defaultapps');js("assert([...OS.windows.values()].find(w=>w.appId==='settings').state.section==='defaultapps');");run('shell:downloads');js("assert([...OS.windows.values()].some(w=>w.appId==='files'&&w.state.path==='/Downloads'));")
                return 'Keyboard Run resolves quoted C: virtual paths, settings and shell folders'
            check('Run routes actual document paths, shell folders and supported settings URIs',runpaths)
            def jumplist():
                clean();w=launch('notepad',{'path':'/Documents/Launch/note with spaces.txt'});page.wait_for_function('Aster.shellLaunch.state.recent.some(e=>e.path==="/Documents/Launch/note with spaces.txt")');page.locator('#taskbar [data-app="notepad"]').click(button='right');j=page.get_by_role('dialog',name='Notepad Jump List');j.locator('[data-path="/Documents/Launch/note with spaces.txt"]').get_by_label('Pin note with spaces.txt',exact=True).click();page.wait_for_function('Aster.shellLaunch.state.pins.some(e=>e.app==="notepad")');page.screenshot(path=str(out/'jump-list.png'));j.locator('[data-path="/Documents/Launch/note with spaces.txt"]').get_by_role('button',name='note with spaces.txt',exact=True).click();page.wait_for_function('[...Aster.windows.values()].filter(w=>w.appId==="notepad").length===2');js('assert(!OS.shellPanelType);assert(OS.windows.size===2);')
                return 'Taskbar right-click pins and opens the actual saved file in another Notepad window'
            check('Taskbar Jump Lists contain real recent and pinned files with correct app routing',jumplist)
            def privacy():
                clean();w=launch('settings',{'section':'recentitems'});w.get_by_label('Remember recent documents',exact=True).uncheck();page.wait_for_function('!Aster.shellLaunch.state.trackRecent');js("assert(OS.recent.length===0);assert(OS.shellLaunch.state.recent.length===0);assert(OS.shellLaunch.state.pins.length>0);const f=await OS.openPath('/Documents/Launch/note with spaces.txt');await f.ready;await OS.shellLaunch.save();assert(OS.shellLaunch.state.recent.length===0);");page.locator('#taskbar [data-app="notepad"]').click(button='right');j=page.get_by_role('dialog',name='Notepad Jump List');j.get_by_role('heading',name='Pinned',exact=True).wait_for(state='visible');assert j.get_by_role('heading',name='Pinned',exact=True).is_visible();assert j.get_by_role('heading',name='Recent',exact=True).count()==0;page.keyboard.press('Escape')
            check('Disabling recent tracking clears history, retains pins, and prevents fresh collection',privacy)
            page.locator('#start-button').click();page.get_by_role('button',name='Recent documents are turned off. Manage recent items.',exact=True).wait_for();page.keyboard.press('Escape')
            def stale():
                clean();js("await OS.shellLaunch.setTracking(true);await OS.shellLaunch.remember('notepad','/Documents/Launch/hello.html');await OS.fs.remove('/Documents/Launch/hello.html',true);");page.locator('#taskbar [data-app="notepad"]').click(button='right');j=page.get_by_role('dialog',name='Notepad Jump List');entry=j.locator('[data-path="/Documents/Launch/hello.html"]');entry.wait_for(state='visible');assert entry.get_by_role('button',name='hello.html',exact=True).is_disabled();entry.get_by_label('Remove hello.html',exact=True).click();page.wait_for_function('!Aster.shellLaunch.state.recent.some(e=>e.path==="/Documents/Launch/hello.html")');js("assert(!await OS.fs.stat('/Documents/Launch/hello.html'));await OS.shellLaunch.setTracking(false);");page.keyboard.press('Escape')
            check('Missing Jump List entries are disabled and can be removed without touching files',stale)
            def startup():
                clean();w=launch('settings',{'section':'startupapps'});w.get_by_label('Start Calculator',exact=True).check();w.get_by_label('Start minimized Calculator',exact=True).check();w.get_by_label('Start Clock',exact=True).check();w.get_by_label('Start minimized Clock',exact=True).check();page.wait_for_function('Aster.shellLaunch.state.startup.filter(e=>e.minimized).length===2');js("assert(OS.windows.size===1);try{await OS.shellLaunch.setStartup('win32',true);throw Error('unsafe');}catch(e){assert(e.message.includes('not eligible'));}assert(!OS.shellLaunch.state.startup.some(e=>e.app==='win32'));")
            check('Startup Settings persist explicit choices without starting apps immediately',startup)
            def mobile():
                clean();page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390');page.keyboard.press('Control+Alt+o');d=page.get_by_role('dialog',name='Run',exact=True);r=d.bounding_box();assert r['x']>=0 and r['x']+r['width']<=391;page.keyboard.press('Escape');page.locator('#taskbar [data-app="notepad"]').click(button='right');j=page.get_by_role('dialog',name='Notepad Jump List');j.wait_for();r=j.bounding_box();assert r['x']>=0 and r['x']+r['width']<=391;page.screenshot(path=str(out/'jump-list-mobile.png'));page.keyboard.press('Escape');page.set_viewport_size({'width':1440,'height':1000})
            check('Run and Jump Lists fit narrow screens and Escape closes their shell surfaces',mobile)
            def associationsafety():
                clean();js("await OS.fs.write('/Documents/Launch/README','extensionless');try{await OS.showOpenWith('/Documents/Launch/README',{launch:false});throw Error('unsafe');}catch(e){assert(e.message.includes('without an extension'));}const old=JSON.stringify(OS.shellLaunch.state.defaults);try{await OS.shellLaunch.setDefault('png','terminal');throw Error('unsafe');}catch(e){assert(e.message.includes('Unsupported'));}assert(JSON.stringify(OS.shellLaunch.state.defaults)===old);void OS.showOpenWith('/Documents/Launch/note with spaces.txt');")
                d=page.get_by_role('dialog',name='Open with',exact=True);d.get_by_role('button',name='Cancel',exact=True).click();js('assert(OS.windows.size===0)')
                return 'Invalid persistent associations and extensionless defaults reject; cancelling launches nothing'
            check('Association validation and cancelling the chooser have no launch or preference side effects',associationsafety)
            def settingssearch():
                clean();page.locator('#start-button').click();page.locator('.start-menu input').fill('default apps');page.get_by_role('button',name='Default apps',exact=False).first.click();page.wait_for_function('[...Aster.windows.values()].some(w=>w.appId==="settings"&&w.body.querySelector(".default-app-list"))');js('assert(OS.windows.size===1)')
                return 'Normal Start search resolves the new in-place Settings destination'
            check('Default apps is searchable from Start as an actual Settings page',settingssearch)
            if not args.inject:
                def persistence():
                    clean();launch('calculator');js("OS.settings.restore=true;await OS.db.set('settings',OS.settings);OS.cancelSessionSave();await OS.persistSessionNow();await OS.shellLaunch.save();");page.reload();page.wait_for_function('Aster.booted && Aster.shellLaunch');js("await OS.ready;assert(!OS.db.memory);assert(OS.shellLaunch.state.defaults.html==='notepad');assert(OS.shellLaunch.state.defaults.png==='paint');assert(OS.shellLaunch.state.pins.some(e=>e.path==='/Documents/Launch/note with spaces.txt'));assert(OS.shellLaunch.state.runHistory.includes('calc'));assert(!OS.shellLaunch.state.trackRecent);assert([...OS.windows.values()].filter(w=>w.appId==='calculator').length===1);assert(OS.startupReport.some(e=>e.app==='calculator'&&e.status==='reused'));const c=[...OS.windows.values()].find(w=>w.appId==='clock');await c.ready;assert(c.minimized);assert(OS.startupReport.some(e=>e.app==='clock'&&e.status==='launched'));")
                    return 'Full reload retained associations, pins, privacy and commands; startup reused Calculator and opened Clock minimized'
                check('Durable preferences and actual startup launch/reuse survive full page reload',persistence)
                def startupskip():
                    clean();js("OS.settings.restore=false;await OS.db.set('settings',OS.settings);OS.cancelSessionSave();await OS.persistSessionNow();await OS.shellLaunch.save();")
                    page.goto(((ROOT/'Aster.html').as_uri() if args.standalone else origin)+'?startup=off');page.wait_for_function('Aster.booted && Aster.shellLaunch');js("await OS.ready;assert(OS.shellLaunch.state.startup.length===2);assert(OS.startupReport.some(e=>e.status==='skipped'));assert(![...OS.windows.values()].some(w=>w.appId==='calculator'||w.appId==='clock'));")
                    return 'A real reload with startup=off skips configured apps without deleting preferences'
                check('Startup recovery switch skips launch while retaining saved startup configuration',startupskip)
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as e:report['status']='FAIL';report['error']=str(e);raise
        finally:(out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
