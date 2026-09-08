"""Theme integration through real controls and local assets; no theme/app mocks.
Injected mode is explicitly memory-only. HTTP/standalone verify full reloads.
GPU mode requires the actual WebGPU API, software Vulkan in Linux CI.
"""
import argparse, json, sys, threading, time, subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main(args):
    out=(args.output or ROOT/'tests/themes/artifacts').resolve();out.mkdir(parents=True,exist_ok=True)
    fixtures=out/'fixtures';subprocess.run(['node','tests/themes/fixtures.cjs',str(fixtures)],cwd=ROOT,check=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    url=(ROOT/'Aster.html').as_uri() if args.standalone else f'http://127.0.0.1:{server.server_port}/'
    report={'mode':'injected-memory' if args.inject else 'standalone-file' if args.standalone else 'HTTP','gpuRequired':args.gpu,'tests':[],'errors':[]}
    with sync_playwright() as pw:
        flags=['--no-sandbox']
        if args.gpu:
            flags+=['--enable-unsafe-webgpu']
            if sys.platform.startswith('linux'):flags+=['--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']
        browser=pw.chromium.launch(headless=not args.headed,args=flags,**({'executable_path':args.browser} if args.browser else {}))
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow')
        page=context.new_page();page.set_default_timeout(30000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(source,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+source+'}',arg)
        def clear():js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(t=>t.remove());')
        def settings(section):
            ident=js('let w=[...OS.windows.values()].find(w=>w.appId==="settings");if(w)await w.navigate(arg);else{w=OS.openApp("settings",{section:arg});await w.ready;}w.restore();return w.id;',section)
            return page.locator(f'[data-window="{ident}"]')
        def preset(name):
            w=settings('themes');w.locator('[data-theme-id="'+name+'"]').click();page.wait_for_function('(id)=>Aster.themes.current.id===id',arg=name)
            w.locator('.theme-current h2').filter(has_text=js('return OS.themes.current.title;')).wait_for()
            return w
        def save(name):
            w=settings('themes');w.get_by_role('button',name='Save as new theme',exact=True).click();d=page.get_by_role('dialog',name='Save theme',exact=True);d.get_by_role('textbox').fill(name);d.get_by_role('button',name='Save',exact=True).click();page.wait_for_function('(name)=>Aster.themes.saved.some(t=>t.title===name)',arg=name)
        def check(name,fn):
            at=time.perf_counter()
            try:detail=fn();report['tests'].append({'name':name,'status':'PASS','ms':round(1000*(time.perf_counter()-at)),'detail':detail});print('PASS',name,flush=True)
            except Exception as e:report['tests'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto(url)
            page.wait_for_function('window.Aster?.booted&&Aster.themes?.ready');js('await OS.ready;OS.settings.restore=false;OS.settings.dnd=true;');clear()
            report['environment']=js('return{ua:navigator.userAgent,storage:OS.db.mode,renderer:OS.renderer.mode};')
            def gallery():
                w=settings('themes');assert w.locator('[data-theme-id]').count()==12
                for mini in w.locator('.theme-card .theme-miniature').all():assert mini.bounding_box()['width']>100
                js('assert([...OS.apps.values()].filter(a=>a.webApp).length===74);assert(OS.themes.saved.length===0);')
                page.screenshot(path=str(out/'windows-light.png'))
            check('Twelve theme presets are integrated in Settings with full-width previews',gallery)
            def legacy_flyout():
                js('window.colorRevision=OS.themes.revision;await OS.setSetting("theme","dark");OS.showWidgets();window.colorFlyout=document.querySelector(".widgets-flyout");window.colorWindows=OS.windows.size;')
                page.wait_for_function('Aster.themes.revision>colorRevision')
                js('await OS.themes.pending;assert(colorFlyout?.isConnected);assert(document.querySelector(".widgets-flyout")===colorFlyout);assert(OS.windows.size===colorWindows);assert(document.body.dataset.theme==="dark");')
                page.locator('.widgets-flyout textarea').wait_for()
                js('OS.closePanels();await OS.themes.select("windows-light");')
                return 'The actual deferred legacy color save preserves the same open Widget flyout'
            check('Color-only theme persistence does not dismiss a newly opened shell flyout',legacy_flyout)
            def profiles():
                ident=js('window.editor=OS.openApp("notepad");await editor.ready;return editor.id;');page.locator(f'[data-window="{ident}"] textarea').fill('Unsaved editor preserved across profiles')
                for name in ['windows-dark','macos26-light','macos26-dark','ubuntu-light','ubuntu-dark']:
                    preset(name);js('assert(OS.windows.get(editor.id)===editor);assert(editor.body.querySelector("textarea").value.includes("Unsaved editor"));assert(document.querySelectorAll("#start-button").length===1);assert(document.querySelectorAll("#tray-clock").length===1);')
                    js('const a=OS.viewport();editor.toggleMaximize();const r=editor.el.getBoundingClientRect();assert(Math.abs(r.x-a.x)<2);assert(Math.abs(r.y-a.y)<2);assert(Math.abs(r.width-a.w)<2);assert(Math.abs(r.height-a.h)<2);editor.toggleMaximize();')
                    page.screenshot(path=str(out/(name+'.png')))
                return 'Real preset buttons preserve editor identity, unsaved text, unique taskbar/tray and maximize work areas'
            check('Windows, macOS and Ubuntu profiles retain live windows and correct maximize geometry',profiles)
            def dock():
                w=settings('taskbar-theme');w.get_by_label('Dock position',exact=True).select_option('right');page.wait_for_function('Aster.themes.current.taskbar.position==="right"');js('assert(OS.viewport().right>0);const r=document.querySelector("#taskbar").getBoundingClientRect();assert(Math.abs(r.right-innerWidth)<2);editor.snap("right");assert(editor.el.getBoundingClientRect().right<=innerWidth-OS.viewport().right+1);')
                js('OS.closePanels();');w=settings('taskbar-theme');w.get_by_label('Automatically hide taskbar',exact=True).check();page.wait_for_function('Aster.themes.current.taskbar.autoHide');js('assert(OS.viewport().right===4);');w.get_by_label('Automatically hide taskbar',exact=True).uncheck();page.wait_for_function('!Aster.themes.current.taskbar.autoHide')
                page.locator('#taskbar [data-app="notepad"]').click(button='right');j=page.get_by_role('dialog',name='Notepad Jump List');j.wait_for();r=j.bounding_box();assert r['x']>=0 and r['x']+r['width']<=1441;page.keyboard.press('Escape')
            check('Right dock, auto-hide work area, snapping and taskbar Jump Lists use the theme layout',dock)
            def menu():
                preset('macos26-light');js('editor.restore();');page.get_by_role('button',name='Window',exact=True).click();page.get_by_role('menuitem',name='Minimize',exact=False).click();page.wait_for_function('editor.minimized');page.locator('#taskbar [data-app="notepad"]').click();page.wait_for_function('!editor.minimized');js('assert(editor.body.querySelector("textarea").value.includes("Unsaved editor"));')
            check('macOS-style top Window menu and Dock operate actual Aster windows',menu)
            def modes():
                w=settings('colors');w.get_by_label('Color mode',exact=True).select_option('custom');page.wait_for_function('Aster.themes.current.shellMode==="dark"&&Aster.themes.current.appMode==="light"');js('assert(document.body.dataset.theme==="light");assert(document.body.dataset.shellMode==="dark");')
                w.get_by_label('Accent color',exact=True).fill('#126b47');w.get_by_label('Accent color',exact=True).dispatch_event('change');page.wait_for_function('Aster.themes.current.accent==="#126b47"');w.get_by_label('Transparency effects',exact=True).uncheck();page.wait_for_function('!Aster.themes.current.transparency');js('assert(document.body.classList.contains("no-transparency"));assert(getComputedStyle(document.querySelector("#taskbar")).backdropFilter==="none");');w.get_by_label('Accent on title bars',exact=True).check();page.wait_for_function('Aster.themes.current.accentOnTitle')
            check('Custom app/shell modes, accent, title bars and solid materials update live',modes)
            def contrast():
                preset('contrast-night');js('assert(document.body.classList.contains("theme-contrast"));assert(OS.themes.tokens.app.surface==="#000000");assert(OS.themes.tokens.app.text==="#ffffff");');preset('contrast-day');js('assert(OS.themes.tokens.app.surface==="#ffffff");');preset('windows-light')
            check('Contrast presets replace app and shell tokens and disable translucent effects',contrast)
            def custom():
                save('Saved custom work');js('window.savedTheme=OS.themes.current.id;assert(savedTheme.startsWith("user-"));');preset('ubuntu-dark');settings('themes').locator('[data-theme-id="'+js('return savedTheme;')+'"]').click();page.wait_for_function('Aster.themes.current.id===savedTheme');js('assert(OS.themes.current.title==="Saved custom work");')
            check('Custom theme library saves and reapplies from Settings',custom)
            def pack():
                w=settings('themes')
                with page.expect_file_chooser() as pick:w.get_by_role('button',name='Import theme',exact=True).click()
                pick.value.set_files(str(fixtures/'test.themepack'));d=page.get_by_role('dialog',name='Apply imported theme?',exact=True);d.wait_for();assert 'Independent test theme' in d.inner_text();d.get_by_role('button',name='Apply theme',exact=True).click();page.wait_for_function('Aster.themes.current.title==="Independent test theme"');js('assert(Object.keys(OS.themes.current.assets).length===4);assert(OS.themes.current.cursor.custom.Wait==="wait.ani");assert(OS.themes.diagnostics.cursorTimer);')
                with page.expect_download() as download:settings('themes').get_by_role('button',name='Export Windows .themepack',exact=True).click()
                target=out/'browser-export.themepack';download.value.save_as(str(target))
                subprocess.run(['node','-e',"const f=require('fs'),p=require('./src/theme-packs.js');const a=p.unpack(f.readFileSync(process.argv[1]));if(a.length!==5||!a.some(x=>x.name==='Aster.theme'))throw Error('Bad browser CAB');",str(target)],cwd=ROOT,check=True)
                return 'Actual file chooser preview/apply and CAB Worker export, parsed independently by Node'
            check('Windows theme packs import assets and export actual CAB files through Settings',pack)
            def sounds():
                js('OS.settings.dnd=false;OS.settings.volume=60;OS.settings.muted=false;OS.unlockAudio();await OS.audioContext?.resume();');page.mouse.click(1300,700)
                assert js('return await OS.themes.playSound("SystemAsterisk",true);')
                page.wait_for_function('Aster.themes.diagnostics.playing===0&&Aster.themes.diagnostics.audioEnded>0');js('OS.settings.muted=true;assert(!await OS.themes.playSound("SystemAsterisk",true));OS.settings.muted=false;OS.settings.dnd=true;')
            check('Imported WAV decodes and ends cleanly with master mute respected',sounds)
            def assets():
                return js('const canvas=document.createElement("canvas");canvas.width=12;canvas.height=8;const c=canvas.getContext("2d");const files=[];for(const color of ["#ee0000","#00ee00"]){c.fillStyle=color;c.fillRect(0,0,12,8);files.push(new File([await new Promise(r=>canvas.toBlob(r))],color.slice(1)+".png",{type:"image/png"}));}await OS.themes.addAssets(files,"background");assert(OS.themes.current.background.type==="slideshow");assert(OS.themes.diagnostics.slideTimer);const a=OS.themes.diagnostics.urls;OS.themes.nextBackground();assert(OS.themes.diagnostics.urls<=a+1);await OS.themes.update({background:{fit:"tile"}});assert(OS.themes.effectiveBackground().fit==="tile");return OS.themes.diagnostics;')
            check('Local wallpaper slideshow, switching and fit settings use bounded live resources',assets)
            def malformed():
                js('const before=JSON.stringify(OS.themes.current);for(const file of [new File(["MSCFbad"],"bad.themepack"),new File(["{\\"format\\":\\"aster-theme\\",\\"version\\":1,\\"theme\\":{\\"version\\":99}}"],"bad.astertheme")]){let rejected=false;try{await OS.themes.importFiles([file]);}catch{rejected=true;}assert(rejected);}assert(JSON.stringify(OS.themes.current)===before);')
            check('Invalid theme packages reject without changing the active theme',malformed)
            def resources():
                preset('windows-dark');js('assert(OS.themes.diagnostics.urls===0);assert(!OS.themes.diagnostics.slideTimer);assert(!OS.themes.diagnostics.cursorTimer);assert(OS.themes.diagnostics.playing===0);')
                for name in ['ubuntu-dark','windows-dark','macos26-light','windows-light']:preset(name)
                js('assert(document.querySelectorAll("#theme-topbar").length===1);assert(document.querySelectorAll("#tray-clock").length===1);assert(!OS.themes.diagnostics.urls);')
            check('Theme changes dispose old cursor, wallpaper and sound resources without duplicate bars',resources)
            def mobile():
                for name in ['macos26-light','ubuntu-dark','windows-light']:
                    js('await OS.themes.select(arg);',name);page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390&&!Aster.viewport().side');js('OS.themes.reflow();');page.locator('#start-button').click();page.locator('.start-menu').wait_for();r=page.locator('.start-menu').bounding_box();assert r['x']>=-1 and r['x']+r['width']<=391;page.screenshot(path=str(out/(name+'-mobile.png')));page.keyboard.press('Escape');page.set_viewport_size({'width':1440,'height':1000});page.wait_for_function('innerWidth===1440');js('OS.themes.reflow();')
            check('All three shell profiles keep Start and their work areas within mobile bounds',mobile)
            def win32():
                clear();ident=js('window.lab=OS.openApp("win32");await lab.ready;return lab.id;');w=page.locator(f'[data-window="{ident}"]');w.get_by_label('Win32 sample').select_option('pad');w.get_by_role('button',name='Run sample',exact=True).click();page.locator('.win32-edit').wait_for();page.locator('.win32-edit').fill('Guest edit remains alive')
                for name in ['windows-dark','ubuntu-light','macos26-dark']:
                    js('await OS.themes.select(arg);',name);page.wait_for_function('lab.win32Session.themeSnapshot?.colors[5]===Aster.themes.win32Colors()[5]');assert page.locator('.win32-edit').input_value()=='Guest edit remains alive'
                if args.gpu:assert js('return lab.win32Session.renderer.mode;')=='WebGPU'
                page.screenshot(path=str(out/'win32-theme-live.png'));w.get_by_role('button',name='Stop',exact=True).click();page.wait_for_function('!lab.win32Session.worker');clear()
            check('A real Windows EXE receives live Worker theme colors without losing its edit controls',win32)
            if args.gpu:
                def gpu():
                    js('assert(OS.renderer.mode==="WebGPU","Desktop renderer fell back");');return js('const el=document.createElement("div");document.body.append(el);const g=new AsterGDI(el,64,64,{requireGPU:true});try{await g.init();await g.submit([{op:"rect",x:0,y:0,w:64,h:64,color:[19,55,101,255]}]);assert((await g.pixel(10,10)).join(",")==="19,55,101,255");return{desktop:OS.renderer.mode,gdi:g.stats()};}finally{g.destroy();el.remove();}')
                check('WebGPU desktop and guest surfaces remain real GPU pipelines with pixel readback',gpu)
            if not args.inject:
                def persistence():
                    preset('ubuntu-dark');save('Durable theme library');js('await OS.fs.write("/Documents/theme-kept.txt","Existing document retained");OS.settings.restore=false;await OS.db.set("settings",OS.settings);await OS.themes.pending;OS.cancelSessionSave();await OS.persistSessionNow();');page.reload();page.wait_for_function('Aster.booted&&Aster.themes.ready');js('await OS.ready;assert(!OS.db.memory);assert(OS.themes.current.title==="Durable theme library");assert(OS.themes.current.profile==="ubuntu");assert(OS.themes.saved.some(t=>t.title==="Durable theme library"));assert(await OS.fs.text(await OS.fs.read("/Documents/theme-kept.txt"))==="Existing document retained");');clear()
                check('Actual IndexedDB reload preserves selected themes, custom library and existing files',persistence)
                def recovery():
                    page.goto(url+'?theme=reset');page.wait_for_function('Aster.booted&&Aster.themes.ready');js('await OS.ready;assert(OS.themes.current.id==="windows-light");assert(OS.themes.saved.some(t=>t.title==="Durable theme library"));');clear()
                check('Recovery URL restores usable Windows appearance without discarding saved custom themes',recovery)
            if args.standalone and not args.inject:
                def offline():
                    context.set_offline(True);page.reload();page.wait_for_function('Aster.booted&&Aster.themes.ready');clear();preset('macos26-dark');js('assert(OS.themes.current.profile==="macos26");');context.set_offline(False)
                check('Standalone theme changes work after a full offline reload',offline)
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as error:report['status']='FAIL';report['error']=str(error);raise
        finally:
            (out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--inject',action='store_true');p.add_argument('--standalone',action='store_true');p.add_argument('--gpu',action='store_true');p.add_argument('--headed',action='store_true');p.add_argument('--browser');p.add_argument('--output',type=Path);main(p.parse_args())
