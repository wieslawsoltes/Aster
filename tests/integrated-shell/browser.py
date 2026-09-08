"""Integrated shell tests. Inert chooser result; real production MediaRecorder.
--inject supports restricted local browsers; CI uses ordinary HTTP and IndexedDB.
"""
import argparse, base64, io, json, threading, time, zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[2]
class QuietServer(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def main(args):
    out = (args.output or (ROOT / 'tests/integrated-shell/artifacts'));  out.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietServer, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    report = {'mode': 'injected/memory' if args.inject else 'offline standalone' if args.standalone else 'HTTP/IndexedDB', 'tests': [], 'errors': [],
              'limits': ['Physical capture permission chooser and native OS-reserved shortcuts are not automated.',
                         'Media recorder uses a labeled canvas stream; encoding/decoding and cleanup are real.',
                         'No claim of host OS control or physical GPU benchmark.']}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=args.browser or None, args=['--no-sandbox'])
        context = browser.new_context(viewport={'width':1440, 'height':1000}, timezone_id='Europe/Warsaw', service_workers='block')
        page = context.new_page(); page.set_default_timeout(12000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        def js(body, arg=None):
            return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+body+'}', arg)
        def clean():
            js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def launch(id, opts=None):
            return js('const w=OS.openApp(arg[0],arg[1]);await w.ready;window.w=w;assert(!w.body.querySelector(".app-error"),w.body.innerText);return w.id;', [id, opts or {}])
        def boot():
            if args.inject: page.set_content((ROOT/'Aster.html').read_text())
            else: page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin, wait_until='load')
            if args.standalone: context.set_offline(True)
            page.wait_for_function('Aster.booted && Aster.startPins')
            js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=false;OS.applySettings();')
            clean()
        def shot(name): page.screenshot(path=str(out / (name+'.png')))
        def check(name, fn):
            start = time.perf_counter()
            try:
                detail=fn();report['tests'].append({'name':name,'status':'PASS','seconds':round(time.perf_counter()-start,3),'detail':detail});print('PASS',name,flush=True)
            except Exception as e:
                report['tests'].append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True);shot('failure');raise
        try:
            boot()
            check('Features are integrated destinations, not entries in All apps', lambda: js('assert(OS.webCatalog.apps.length===67);for(const id of Object.keys(OS.integratedFeatures))assert(OS.apps.get(id).hidden&&OS.apps.get(id).systemFeature);assert(OS.activeIntegratedViews.size===0);return {version:OS.version,legacyEndpoints:Object.keys(OS.integratedFeatures).length};'))
            def start_menu():
                page.locator('#start-button').click()
                page.locator('.start-menu').wait_for()
                assert page.locator('.pinned-grid').is_visible()
                assert page.locator('.web-start-entry').is_visible()
                shot('start-pinned')
                page.locator('.start-menu input').fill('clipboard')
                page.get_by_role('button',name='Clipboard history',exact=False).first.click()
                page.get_by_role('dialog',name='Clipboard history').wait_for()
                js('assert(OS.windows.size===0);')
                page.keyboard.press('Escape')
                return 'Search launches a shell Clipboard flyout, not an app window; catalog categories retained'
            check('Start pins, system search destinations and categorized web apps',start_menu)
            def pins():
                clean();page.locator('#start-button').click();page.locator('.pinned-grid').wait_for()
                first=js('return OS.startPins[0];');second=js('return OS.startPins[1];')
                page.locator('[data-start-app="'+second+'"]').drag_to(page.locator('[data-start-app="'+first+'"]'))
                page.wait_for_function('arg=>Aster.startPins[0]===arg',arg=second)
                page.locator('[data-start-app="'+second+'"]').click(button='right')
                page.get_by_role('menuitem',name='Unpin from Start',exact=True).click()
                page.wait_for_function('arg=>!Aster.startPins.includes(arg)',arg=second)
                assert page.locator('.start-menu').is_visible()
                page.locator('.start-menu').get_by_role('button',name='All apps',exact=True).click()
                name=js('return OS.apps.get(arg).title;',second)
                page.locator('.start-menu .search-results').get_by_role('button',name=name,exact=False).first.click(button='right')
                page.get_by_role('menuitem',name='Pin to Start',exact=True).click()
                page.wait_for_function('arg=>Aster.startPins.includes(arg)',arg=second)
                page.keyboard.press('Escape');return 'Pointer drag reorder, unpin and repin from All apps; context menu retains Start'
            check('Start pins can be reordered and changed from the actual menu',pins)
            def clipboard():
                clean();launch('notepad');js("await OS.setSetting('clipboardHistory',true);")
                editor=page.locator('[data-app="notepad"] textarea').first
                editor.fill('Integrated clipboard Ω');editor.press('Control+A');editor.press('Control+C')
                page.wait_for_function('Aster.clipboardText.model.entries.some(e=>e.text==="Integrated clipboard Ω")')
                editor.fill('Before: ');editor.press('End');page.keyboard.press('Control+Alt+v')
                clip=page.get_by_role('dialog',name='Clipboard history');clip.wait_for()
                clip.get_by_role('button',name='Pin item',exact=True).first.click()
                clip.get_by_role('searchbox',name='Search clipboard history').fill('Ω')
                clip.get_by_role('button',name='Paste Integrated clipboard Ω',exact=True).click()
                assert editor.input_value()=='Before: Integrated clipboard Ω',editor.input_value()
                js('assert(OS.windows.size===1);assert(document.activeElement.tagName==="TEXTAREA");')
                editor.press('Control+Alt+v');page.get_by_role('dialog',name='Clipboard history').wait_for();shot('clipboard-flyout');page.keyboard.press('Escape')
                assert editor.evaluate('el=>document.activeElement===el')
                js('assert(OS.activeIntegratedViews.size===0);')
                return 'Real copy, pin, filtered paste into original field and Escape focus restoration with one Notepad window'
            check('Clipboard flyout preserves editor selection and creates no taskbar window',clipboard)
            def quick():
                clean();page.keyboard.press('Control+Alt+a');q=page.get_by_role('dialog',name='Quick settings');q.wait_for()
                q.get_by_role('button',name='Night light',exact=True).click();page.wait_for_function('document.body.classList.contains("night-light")')
                q.get_by_role('button',name='Accessibility',exact=True).click()
                q.get_by_role('checkbox',name='Reading guide',exact=True).check();page.wait_for_function('Aster.settings.readingGuide')
                q.get_by_role('button',name='Back to Quick settings',exact=True).click()
                shot('quick-settings')
                js('assert(OS.windows.size===0);await OS.setSetting("readingGuide",false);await OS.setSetting("nightLight",false);')
                page.keyboard.press('Escape')
                return 'Night light and accessibility settings apply in place; no fake network/OS switch'
            check('Quick settings contains working scoped toggles and nested accessibility',quick)
            def calendar_focus():
                clean();js("await OS.db.set('calendarEvents',[{id:'shell-agenda',title:'Shell integration review',date:OS.isoDate(new Date()),time:'14:00',notes:''}]);OS.showNotifications();")
                panel=page.get_by_role('dialog',name='Notifications and calendar');panel.wait_for()
                page.wait_for_function('document.querySelector(".calendar-inline-agenda")?.textContent.includes("Shell integration review")')
                panel.get_by_role('button',name='Increase focus duration',exact=True).click()
                panel.get_by_role('button',name='Start focus session',exact=True).click()
                page.wait_for_function('Aster.focusSession.state.status==="running" && Aster.quiet.active()')
                js('assert(OS.windows.size===0);assert(OS.settings.dnd===false);assert(OS.focusSession.state.duration===30*60000);')
                shot('notification-calendar-focus')
                panel.get_by_role('button',name='End focus session',exact=True).click()
                page.wait_for_function('Aster.focusSession.state.status!=="running"')
                page.keyboard.press('Escape');return 'Agenda and 30-minute Focus run directly in the calendar; manual DND stays false'
            check('Notification Center calendar and Focus controls require no utility windows',calendar_focus)
            def widgets():
                clean();js("await OS.db.set('tasks',[{id:'shell-task',title:'Integrated widgets task',done:false}]);OS.showWidgets();")
                panel=page.get_by_role('dialog',name='Widgets');panel.wait_for()
                page.wait_for_function('document.querySelector(".widgets-flyout")?.textContent.includes("Integrated widgets task")')
                panel.get_by_role('checkbox',name='Integrated widgets task',exact=True).click()
                panel.get_by_role('checkbox',name='Integrated widgets task',exact=True).wait_for(state='hidden')
                page.wait_for_function('Aster.widgetBoard!==undefined')
                panel.get_by_role('textbox',name='Widget quick note').fill('Flyout note persists Ω')
                shot('widgets-board')
                page.keyboard.press('Escape');js('await OS.featureFlush();assert((await OS.db.get("tasks"))[0].done);assert(OS.activeIntegratedViews.size===0);assert(OS.windows.size===0);OS.showWidgets();')
                panel.get_by_role('textbox',name='Widget quick note').wait_for();assert panel.get_by_role('textbox',name='Widget quick note').input_value()=='Flyout note persists Ω'
                page.keyboard.press('Escape');return 'Real task update, note persistence, and mount disposal on close'
            check('Widgets is a live left-side board with scoped lifecycle',widgets)
            def settings():
                clean();first=launch('settings',{'section':'system'})
                page.locator('.settings-main').get_by_role('button',name='Storage',exact=True).click()
                page.get_by_role('button',name='Review cleanup',exact=True).wait_for()
                js('assert(OS.windows.size===1);assert(OS.activeIntegratedViews.size===1);assert(w.state.section==="storage");')
                shot('settings-storage')
                page.locator('.settings-sidebar').get_by_role('button',name='Accessibility',exact=True).click()
                page.wait_for_function('w.state.section==="accessibility" && document.querySelector("[data-view=accessibility]")')
                js('assert(OS.activeIntegratedViews.size===1);')
                page.locator('.settings-sidebar').get_by_role('searchbox').count() # input type text in baseline
                page.get_by_role('textbox',name='Find a setting').fill('clipboard')
                page.locator('.settings-main').get_by_role('button',name='Clipboard',exact=True).first.click()
                page.get_by_role('switch',name='Clipboard history',exact=True).wait_for()
                js('assert(OS.activeIntegratedViews.size===0);assert(OS.windows.size===1);assert(w.id===arg);',first)
                # Competing navigation requests may finish out of order; only the current view survives.
                js('await Promise.all([w.navigate("focus"),w.navigate("storage"),w.navigate("time")]);assert(w.state.section==="time");assert(OS.activeIntegratedViews.size===0);')
                page.get_by_role('combobox',name='clock24').select_option('false');page.wait_for_function('Aster.settings.clock24===false')
                return 'Natural System pages, search, cleanup and rapid navigation keep one Settings window'
            check('Settings owns Storage, Clipboard, Accessibility, Focus and recovery pages',settings)
            def clock():
                clean();launch('clock',{'mode':'focus'});page.get_by_role('button',name='Start focus',exact=True).wait_for()
                first=js('return w.id;');launch('clock',{'mode':'tools'});page.get_by_role('tab',name='Timers & clocks',exact=True).wait_for()
                js('assert(OS.windows.size===1);assert(w.id===arg);assert(OS.activeIntegratedViews.size===1);',first)
                page.get_by_role('tab',name='Focus sessions',exact=True).click();page.get_by_role('button',name='Start focus',exact=True).wait_for()
                clean();js('assert(OS.activeIntegratedViews.size===0);');return 'Focus session mode shares Clock singleton; changing modes disposes old view'
            check('Focus is part of Clock, not an independent desktop task',clock)
            def file_versions():
                clean();js("await OS.fs.write('/Documents/Integrated.txt','previous Ω','text/plain');await OS.fs.write('/Documents/Integrated.txt','current Ω','text/plain');")
                launch('files',{'path':'/Documents'});row=page.locator('.file-row[data-path="/Documents/Integrated.txt"]');row.wait_for();row.click(button='right')
                page.get_by_role('menuitem',name='Previous versions',exact=False).click()
                prop=page.get_by_role('dialog',name='Integrated.txt Properties',exact=True);prop.wait_for();prop.get_by_role('button',name='Restore copy',exact=True).wait_for()
                js('assert(OS.windows.size===1);')
                prop.get_by_role('button',name='Preview',exact=True).first.click();page.get_by_role('dialog',name='Previous version',exact=True).get_by_role('button',name='Done',exact=True).click()
                prop.get_by_role('button',name='Restore copy',exact=True).first.click()
                page.wait_for_function('document.querySelector(".toast")?.textContent.includes("Version restored")')
                shot('explorer-previous-versions')
                prop.get_by_role('button',name='OK',exact=True).click()
                return js('assert(await OS.fs.text(await OS.fs.read("/Documents/Integrated.txt"))==="current Ω");const files=await OS.db.all();assert(files.some(f=>f.path!=="/Documents/Integrated.txt"&&f.content==="previous Ω"&&!f.path.startsWith("/.")));return "Explorer Properties retains current file while restoring a separate copy";')
            check('Previous versions is an Explorer Properties tab with actual recovery',file_versions)
            def compressed():
                clean();memory=io.BytesIO()
                with zipfile.ZipFile(memory,'w',zipfile.ZIP_DEFLATED) as z:
                    z.writestr('Readme.txt','Extracted from Explorer Ω');z.writestr('folder/Nested.txt','Nested compressed entry')
                js("await OS.fs.write('/Downloads/Integrated.zip',new Blob([Uint8Array.from(atob(arg),c=>c.charCodeAt(0))]),'application/zip');",base64.b64encode(memory.getvalue()).decode())
                launch('files',{'path':'/Downloads'});page.locator('.file-row[data-path="/Downloads/Integrated.zip"]').dblclick()
                page.locator('.compressed-folder-banner').wait_for();assert page.get_by_role('dialog').count()==0
                page.locator('.file-row[data-path="/Downloads/Integrated.zip/folder"]').dblclick()
                page.locator('.file-row[data-path="/Downloads/Integrated.zip/folder/Nested.txt"]').wait_for()
                page.locator('.explorer-nav').get_by_role('button',name='Up',exact=True).click()
                page.locator('.file-row[data-path="/Downloads/Integrated.zip/Readme.txt"]').wait_for()
                assert page.locator('.explorer-commandbar').get_by_role('button',name='New',exact=True).is_disabled()
                page.locator('.explorer-commandbar').get_by_role('button',name='Extract all',exact=True).click()
                page.get_by_role('dialog',name='Extract compressed folder?',exact=True).get_by_role('button',name='Extract all',exact=True).click()
                page.wait_for_function('w.state.path.includes("Integrated extracted")')
                return js('assert(OS.windows.size===1);assert(await OS.fs.text(await OS.fs.read(w.state.path+"/Readme.txt"))==="Extracted from Explorer Ω");return "ZIP inspected and atomically extracted in original Explorer window";')
            check('Compressed folders open and extract inside the originating Explorer',compressed)
            def task_view():
                clean();launch('notepad',{'path':'/Documents/Integrated.txt'});launch('calculator');js('OS.showTaskView();')
                panel=page.get_by_role('dialog',name='Task View',exact=True);panel.wait_for()
                panel.get_by_role('button',name='New desktop',exact=True).click();page.wait_for_function('Aster.desktops.length>=2')
                desk=page.locator('.taskview-desktop').last;desk.get_by_role('button',name='Options for',exact=False).click()
                page.get_by_role('menuitem',name='Rename',exact=False).click()
                dialog=page.get_by_role('dialog',name='Rename desktop',exact=True);dialog.locator('input').fill('Design workspace');dialog.get_by_role('button',name='Save',exact=True).click()
                page.wait_for_function('Aster.desktops.some(d=>d.name==="Design workspace")')
                assert panel.is_visible()
                panel.locator('.desktop-card').first.click()
                panel.get_by_role('button',name='Save this layout',exact=True).click()
                dialog=page.get_by_role('dialog',name='Save window group',exact=True);dialog.locator('input').fill('Integrated layout');dialog.get_by_role('button',name='Save',exact=True).click()
                page.wait_for_function('Aster.workspaces.groups.some(g=>g.name==="Integrated layout")')
                shot('task-view-desktops')
                js('assert(OS.windows.size===2);assert(OS.activeIntegratedViews.size===0);')
                page.keyboard.press('Escape');return 'Desktop rename and named group save happen within Task View without a workspace app'
            check('Task View contains desktop management, layouts and saved groups',task_view)
            def snap():
                clean();launch('notepad');launch('calculator');js('window.right=w;window.left=[...OS.windows.values()].find(x=>x.appId==="notepad");left.snap("left");')
                panel=page.get_by_role('dialog',name='Snap Assist',exact=True);panel.wait_for()
                panel.get_by_role('button',name='Snap Calculator right',exact=True).click()
                return js('assert(left.rect.x<right.rect.x);assert(left.rect.x+left.rect.w<=right.rect.x);assert(right.rect.x+right.rect.w<=innerWidth);assert(OS.windows.size===2);return {left:left.rect,right:right.rect};')
            check('Snapping suggests and positions the companion window',snap)
            def recorder():
                clean();launch('snips');page.get_by_role('tab',name='Record',exact=True).click();page.get_by_role('button',name='Choose screen & record',exact=True).wait_for()
                js("""window.sourceCanvas=document.createElement('canvas');sourceCanvas.width=160;sourceCanvas.height=90;const ctx=sourceCanvas.getContext('2d');window.paintLoop=setInterval(()=>{ctx.fillStyle=Date.now()%2?'#456':'#789';ctx.fillRect(0,0,160,90)},30);window.captureFixture=sourceCanvas.captureStream(20);const media=navigator.mediaDevices||{};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:media});Object.defineProperty(media,'getDisplayMedia',{configurable:true,value:async()=>captureFixture});""")
                page.get_by_role('button',name='Choose screen & record',exact=True).click();page.wait_for_function('w.recorder?.state==="recording"')
                page.wait_for_timeout(350);page.get_by_role('button',name='Pause',exact=True).click();page.wait_for_function('w.recorder.state==="paused"')
                page.get_by_role('button',name='Resume',exact=True).click();page.wait_for_timeout(250);page.get_by_role('button',name='Stop',exact=True).click()
                page.wait_for_function('w.recorder.state==="complete" && w.recorder.blob?.size>0')
                page.wait_for_function('document.querySelector(".recorder-preview")?.videoWidth===160')
                page.get_by_role('button',name='Save to Videos',exact=True).click();page.wait_for_function('w.dirty===false')
                shot('snips-recording')
                result=js('assert(OS.windows.size===1&&w.appId==="snips");assert(captureFixture.getTracks().every(t=>t.readyState==="ended"));return {codec:w.recorder.blob.type,bytes:w.recorder.blob.size};')
                page.get_by_role('tab',name='Screenshot',exact=True).click();page.get_by_role('button',name='New capture',exact=True).wait_for()
                js('clearInterval(paintLoop);assert(OS.activeIntegratedViews.size===1);');clean();js('assert(OS.activeIntegratedViews.size===0);')
                return result
            check('Snips integrates real recording, encoding, preview, save and capture cleanup',recorder)
            def late_chooser():
                launch('snips',{'mode':'record'});js("Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:()=>new Promise(r=>window.resolveChooser=r)});")
                page.get_by_role('button',name='Choose screen & record',exact=True).click();page.wait_for_function('w.recorder?.state==="requesting"')
                js('window.pendingRecorder=w.recorder;await w.close(true);window.lateStream=sourceCanvas.captureStream(5);resolveChooser(lateStream);')
                page.wait_for_function('lateStream.getTracks().every(t=>t.readyState==="ended")')
                js('assert(OS.windows.size===0);assert(OS.activeIntegratedViews.size===0);document.querySelectorAll(".toast").forEach(e=>e.remove());')
                return 'Stream returned after Snips closes is immediately stopped'
            check('Delayed recording permission cannot leak a closed view or stream',late_chooser)
            def repeat_surfaces():
                clean();js('for(let i=0;i<8;i++){OS.showWidgets();await new Promise(r=>setTimeout(r,25));OS.closePanels();}await OS.featureFlush();assert(OS.activeIntegratedViews.size===0);assert(OS.windows.size===0);')
                return 'Eight reopen/close cycles release all embedded views'
            check('Repeated flyouts dispose views instead of accumulating listeners/windows',repeat_surfaces)
            if not args.inject and not args.standalone:
                def persisted():
                    js('await OS.featureFlush();await OS.setSetting("nightLight",true);await OS.db.set("settings",OS.settings);')
                    page.reload(wait_until='load');page.wait_for_function('Aster.booted && Aster.startPins');clean()
                    return js('assert(OS.widgetBoard.note==="Flyout note persists Ω");assert(OS.clipboardText.model.entries.some(e=>e.pinned));assert(OS.workspaces.groups.some(g=>g.name==="Integrated layout"));assert(OS.desktops.some(d=>d.name==="Design workspace"));assert(OS.settings.nightLight);await OS.setSetting("nightLight",false);return "Full HTTP page reload retains pins, widget note, layout group, desktop name and settings";')
                check('Integrated surface state survives a full HTTP reload',persisted)
            def visual_mobile():
                clean();launch('files',{'path':'/Documents'});js("await OS.setSetting('theme','dark');OS.showWidgets();")
                page.locator('.widgets-flyout textarea').wait_for();shot('desktop-dark');js("OS.closePanels();await OS.setSetting('theme','light');")
                clean();page.evaluate('()=>{window.shellResize=false;window.addEventListener("resize",()=>window.shellResize=true,{once:true});}');page.set_viewport_size({'width':390,'height':844});page.wait_for_function('window.shellResize&&innerWidth===390');page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                for action,selector in [('OS.toggleQuick()','.quick-integrated'),('OS.showClipboard()','.clipboard-flyout'),('OS.showNotifications()','.notifications-integrated'),('OS.showWidgets()','.widgets-flyout'),('OS.toggleStart()','.start-menu')]:
                    js('OS.closePanels();'+action);page.locator(selector).wait_for();r=page.locator(selector).bounding_box();assert r['x']>=-1 and r['x']+r['width']<=391,(selector,r)
                shot('start-mobile');js('OS.closePanels();');page.set_viewport_size({'width':1440,'height':1000})
                return 'All five shell surfaces stay within a 390px touch viewport; dark theme rendered'
            check('Responsive shell surfaces and dark theme',visual_mobile)
            check('No uncaught host JavaScript errors', lambda:js('assert(arg.length===0,JSON.stringify(arg));return arg;',report['errors']))
        except Exception as e:
            if not any(t['status']=='FAIL' for t in report['tests']):
                report['tests'].append({'name':'Test setup or teardown','status':'FAIL','error':str(e)});print('FAIL setup',str(e),flush=True)
        finally:
            report['passed']=sum(x['status']=='PASS' for x in report['tests']);report['failed']=sum(x['status']=='FAIL' for x in report['tests'])
            (out/'results.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':report['passed'],'failed':report['failed']},indent=2),flush=True)
            browser.close();server.shutdown()
    return 1 if report['failed'] else 0
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--browser');parser.add_argument('--inject',action='store_true');parser.add_argument('--standalone',action='store_true');parser.add_argument('--output',type=Path);raise SystemExit(main(parser.parse_args()))
