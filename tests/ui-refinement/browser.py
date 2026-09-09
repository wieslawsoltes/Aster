"""Pointer, keyboard, touch and actual app-state regressions for owned UI chrome.

--inject explicitly means memory-only local evidence. HTTP/standalone CI use the
unchanged real app and IndexedDB. No force clicks, replacement caption handlers,
substitute window manager or synthetic screenshots. Built-in apps are retained.
"""
import argparse
import json
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PROFILES = ['windows-light', 'windows-dark', 'macos26-light', 'macos26-dark', 'ubuntu-light', 'ubuntu-dark']

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass


def main(args):
    out = (args.output or ROOT / 'tests/ui-refinement/artifacts').resolve()
    out.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = (ROOT / 'Aster.html').as_uri() if args.standalone else f'http://127.0.0.1:{server.server_port}/'
    report = {'mode': 'injected-memory' if args.inject else 'standalone' if args.standalone else 'HTTP', 'engine': args.engine, 'tests': [], 'errors': []}
    with sync_playwright() as p:
        browser_type = getattr(p, args.engine)
        launch_options = {'headless': True}
        if args.engine == 'chromium': launch_options['args'] = ['--no-sandbox']
        if args.browser: launch_options['executable_path'] = args.browser
        browser = browser_type.launch(**launch_options)
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, has_touch=True, service_workers='allow')
        page = context.new_page()
        page.set_default_timeout(20000)
        page.on('pageerror', lambda e: report['errors'].append(str(e)))
        def js(source, arg=None):
            return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};' + source + '}', arg)
        def clean():
            js('OS.cancelWindowTransform?.(false);OS.closePanels();document.querySelector("#context-menu").hidden=true;for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def preset(name):
            js('await OS.themes.select(arg);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));', name)
        def app(name='notepad', options=None):
            ident = js('window.w=OS.openApp(arg.name,arg.options);await w.ready;return w.id;', {'name': name, 'options': options or {}})
            return page.locator(f'[data-window="{ident}"]')
        def check(name, fn):
            started = time.perf_counter()
            try:
                detail = fn()
                report['tests'].append({'name': name, 'status': 'PASS', 'detail': detail, 'ms': round((time.perf_counter()-started)*1000)})
                print('PASS', name, flush=True)
            except Exception as exc:
                report['tests'].append({'name': name, 'status': 'FAIL', 'error': str(exc)})
                page.screenshot(path=str(out/'failure.png'))
                raise
        try:
            if args.inject: page.set_content((ROOT/'Aster.html').read_text())
            else: page.goto(url)
            page.wait_for_function('window.Aster?.booted && Aster.iconArtwork')
            page.locator('#boot').wait_for(state='detached')
            js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();')
            clean()
            report['environment'] = js('return {ua:navigator.userAgent,persistent:!OS.db.memory,renderer:OS.renderer.mode,version:OS.version};')
            def captions():
                result = []
                presets = js('return AsterThemeModels.PRESETS.map(x=>x.id);')
                for name in presets:
                    preset(name)
                    for app_name in ['notepad', 'files', 'settings']:
                        clean();win = app(app_name)
                        js('for(const b of w.controls.children){const r=b.getBoundingClientRect();for(const [x,y] of [[.5,.5],[.3,.3],[.7,.7]])assert(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y)?.closest("button")===b, "Blocked "+b.ariaLabel+" in "+OS.themes.chrome.profile);}assert([...w.controls.children].map(x=>x.dataset.windowAction).join(",")===(OS.themes.chrome.profile==="macos26"?"close,minimize,maximize":"minimize,maximize,close"));')
                        win.locator('.window-controls').get_by_role('button', name='Maximize', exact=True).click()
                        js('assert(w.maximized);const a=OS.viewport(),r=w.el.getBoundingClientRect();assert(Math.abs(r.x-a.x)<1&&Math.abs(r.y-a.y)<1);')
                        win.locator('.window-controls').get_by_role('button', name='Restore', exact=True).click()
                        js('assert(!w.maximized);')
                        win.locator('.window-controls').get_by_role('button', name='Minimize', exact=True).click()
                        js('assert(w.minimized);')
                        page.locator(f'#taskbar [data-app="{app_name}"]').click()
                        js('assert(!w.minimized);')
                        win.locator('.window-controls').get_by_role('button', name='Close', exact=True).click()
                        page.wait_for_function('w.closed && !Aster.windows.has(w.id)')
                        result.append(name+'/'+app_name)
                return {'presetAppCombinations': len(result), 'captionActions': len(result)*4, 'matrix': result}
            check('Real caption clicks hit and operate all twelve presets across Notepad, Explorer and Settings', captions)
            def inactive():
                clean();preset('macos26-light');old=app();js('window.old=w;old.rect={x:50,y:65,w:500,h:400};old.sync();')
                app();js('w.rect={x:680,y:120,w:560,h:440};w.sync();assert(old.el.classList.contains("inactive"));')
                old.locator('.window-controls').get_by_role('button',name='Minimize',exact=True).click()
                js('assert(old.minimized);old.restore();assert(OS.focused===old.id);')
                old.locator('.window-controls').get_by_role('button',name='Close',exact=True).click()
                page.wait_for_function('old.closed && Aster.windows.size===1')
                return 'One click acts on an inactive caption without dragging it or switching the target'
            check('Inactive glass-window controls work on the first click', inactive)
            def keyboard_menu():
                clean();preset('windows-light');win=app();js('w.rect={x:120,y:110,w:600,h:410};w.sync();window.initial={...w.rect};')
                page.keyboard.press('Alt+Space')
                page.get_by_role('menuitem',name='Move',exact=False).click()
                page.keyboard.press('ArrowRight');page.keyboard.press('Shift+ArrowRight');page.keyboard.press('ArrowDown')
                js('assert(w.rect.x===initial.x+11&&w.rect.y===initial.y+10);assert(OS.windows.size===1);')
                page.keyboard.press('Escape');js('assert(JSON.stringify(w.rect)===JSON.stringify(initial));assert(!document.querySelector(".window-transform-hud"));')
                page.keyboard.press('Alt+F7');page.keyboard.press('ArrowRight');page.keyboard.press('Enter')
                js('assert(w.rect.x===initial.x+10);')
                page.keyboard.press('Alt+F8');page.keyboard.press('ArrowRight');page.keyboard.press('Shift+ArrowDown');page.keyboard.press('Enter')
                js('assert(w.rect.w===initial.w+10&&w.rect.h===initial.h+1);')
                page.keyboard.press('Alt+F10');js('assert(w.maximized)');page.keyboard.press('Alt+F10');js('assert(!w.maximized)')
                return 'Actual key events move/resize with 10px or 1px steps; Escape reverts and Enter commits'
            check('System window menu and keyboard move, resize, precision and maximize work', keyboard_menu)
            def topmost():
                clean();preset('macos26-light');app();js('window.pinned=w;pinned.rect={x:180,y:130,w:650,h:430};pinned.sync();')
                page.keyboard.press('Alt+Space');page.get_by_role('menuitemcheckbox',name='Always on top',exact=False).click()
                js('assert(pinned.alwaysOnTop);')
                app('files');js('w.rect={...pinned.rect};w.sync();w.focus();const a=OS.viewport();assert(document.elementFromPoint(a.x+300,a.y+300).closest(".window")===pinned.el);assert(OS.renderer.getWindows().at(-1)===pinned);assert(w.stackOrder<pinned.stackOrder);')
                page.screenshot(path=str(out/'always-on-top.png'))
                js('pinned.focus();');page.keyboard.press('Alt+Space')
                assert page.get_by_role('menuitemcheckbox',name='Always on top',exact=False).get_attribute('aria-checked') == 'true'
                page.get_by_role('menuitemcheckbox',name='Always on top',exact=False).click()
                js('assert(!pinned.alwaysOnTop);w.focus();assert(OS.renderer.getWindows().at(-1)===w);')
                return 'DOM hit testing and compositor ordering agree; preference stays within Aster'
            check('Always on top maintains consistent DOM and renderer stacking and can be disabled', topmost)
            def palette():
                clean();preset('macos26-light');win=app()
                button=win.locator('[data-window-action=maximize]');button.focus();page.keyboard.press('ArrowDown')
                page.get_by_role('group',name='Snap layouts',exact=True).wait_for()
                page.keyboard.press('ArrowRight');page.keyboard.press('Enter')
                js('assert(w.rect.x>OS.viewport().w/3);assert(!w.maximized);OS.closePanels();')
                button.focus();page.keyboard.press('ArrowDown');page.keyboard.press('Escape')
                js('assert(!document.querySelector(".snap-layouts"));assert(document.activeElement===w.maxButton);')
                button.hover();page.get_by_role('group',name='Snap layouts',exact=True).wait_for()
                page.get_by_role('button',name='Snap left',exact=True).click()
                js('assert(w.rect.x===8);OS.closePanels();')
                win.locator('[data-window-action=close]').click();page.wait_for_function('w.closed')
                js('assert(!document.querySelector(".snap-layouts"));')
                return 'The same real layout choices are reachable from hover or keyboard; no stale palette after close'
            check('Maximize-button layout palette supports keyboard, pointer, Escape and disposal', palette)
            def icon_inventory():
                clean();preset('windows-light')
                result=js('''const host=OS.el('div',{id:'icon-audit',style:'position:fixed;inset:50px 20px 90px;z-index:20000;overflow:auto;background:var(--surface);color:var(--text);padding:20px;display:grid;grid-template-columns:repeat(10,1fr);gap:16px'});document.body.append(host);
                for(const app of OS.apps.values()){const card=OS.el('div',{style:'display:flex;align-items:center;flex-direction:column;gap:8px;font-size:11px;text-align:center'},OS.el('span',{html:OS.appIcon(app.id,42)}),OS.el('span',{text:app.title}));host.append(card);}
                const icons=[...host.querySelectorAll('.aster-prism-icon')];assert(icons.length===OS.apps.size);assert(OS.iconArtwork.builtins.length>=28);
                for(const i of icons){const svg=i.querySelector('svg'),r=svg.getBoundingClientRect();assert(r.width>8&&r.height>8&&r.width<129);assert(svg.getAttribute('viewBox')==='0 0 64 64');assert(!svg.querySelector('image,use,foreignObject,script'));assert(svg.querySelector('.art-glyph').innerHTML.length>20);}
                assert(!host.querySelector('[id]:not(#icon-audit)'));return{registeredApps:OS.apps.size,ownedSymbols:OS.iconArtwork.builtins.length};''')
                page.screenshot(path=str(out/'aster-prism-icons.png'))
                js('document.querySelector("#icon-audit").remove();')
                return result
            check('Every registered app has a bounded, id-free, original scalable icon', icon_inventory)
            def icon_modes():
                clean();win=app('files')
                for profile in PROFILES:
                    preset(profile)
                    for style in ['colorful','dark','tinted','clear']:
                        js('await OS.themes.update({iconStyle:arg});assert(document.body.dataset.iconStyle===arg);',style)
                        # The descriptor's explicit style field is checked by the model and browser.
                        js('const icon=w.el.querySelector(".file-table .aster-prism-icon")||document.querySelector("#taskbar .aster-prism-icon");assert(icon);const r=icon.getBoundingClientRect(),s=icon.querySelector(":scope>svg").getBoundingClientRect();assert(Math.abs(r.width-s.width)<.2&&Math.abs(r.height-s.height)<.2);assert(getComputedStyle(icon.querySelector(".art-glyph")).stroke!=="none");')
                return 'All six profiles: normal/dark/tinted/clear artwork sizes and ink remain visible'
            check('Icon rendering remains aligned and legible through all profile and style switches', icon_modes)
            def centers():
                clean();preset('ubuntu-light');win=app('files')
                js('w.rect={x:25,y:50,w:700,h:480};w.sync();')
                page.keyboard.press('Alt+Space');page.get_by_role('menuitem',name='Center window',exact=True).click()
                js('const a=OS.viewport();assert(Math.abs(w.rect.x-(a.w-w.rect.w)/2)<=1);assert(Math.abs(w.rect.y-(a.h-w.rect.h)/2)<=1);')
                # Drag from the reserved caption space, not from a forced target.
                box=win.locator('.titlebar').bounding_box();x=box['x']+box['width']*.48;y=box['y']+box['height']*.5
                before=js('return {...w.rect};')
                page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+45,y+30,steps=5);page.mouse.up()
                js('assert(w.rect.x!==arg.x||w.rect.y!==arg.y);',before)
                return 'Centered geometry respects dock offsets and a real title drag continues working'
            check('Center command and real titlebar dragging work with side-dock work areas', centers)
            def close_guards():
                clean();preset('macos26-dark');win=app()
                win.locator('textarea').fill('Unsaved caption regression')
                win.locator('[data-window-action=close]').click()
                dialog=page.get_by_role('dialog').last;dialog.wait_for()
                # Existing Notepad confirmation remains in charge; no bypass.
                assert js('return !w.closed&&w.dirty;')
                dialog.get_by_role('button',name='Cancel',exact=True).click()
                js('assert(!w.closed);assert(w.editor.value==="Unsaved caption regression");window.a=w.close();window.b=w.close();')
                page.wait_for_function('document.querySelectorAll(".dialog-backdrop").length===1')
                page.get_by_role('dialog').last.get_by_role('button',name='Cancel',exact=True).click()
                js('await a;await b;assert(!w.closed);assert(!document.querySelector(".dialog-backdrop"));')
                win.locator('[data-window-action=close]').click()
                dialog=page.get_by_role('dialog').last
                dialog.get_by_role('button',name='Discard',exact=False).click()
                page.wait_for_function('w.closed')
                return 'Real dirty-document confirmation: Cancel preserves content; concurrent close requests share one prompt'
            check('Caption Close respects unsaved documents and concurrent close requests do not stack prompts', close_guards)
            def touch():
                clean();page.set_viewport_size({'width':390,'height':844})
                for profile in PROFILES:
                    preset(profile);win=app('notepad')
                    win.locator('[data-window-action=maximize]').tap();js('assert(w.maximized);')
                    win.locator('[data-window-action=maximize]').tap();js('assert(!w.maximized);')
                    win.locator('[data-window-action=close]').tap();page.wait_for_function('w.closed')
                page.set_viewport_size({'width':1440,'height':1000})
                return 'Actual touchscreen taps maximize/restore/close in six light/dark profiles at 390px'
            check('Narrow-screen touch targets work across all six core profiles',touch)
            def screenshots():
                clean();app('notepad');js('window.note=w;note.rect={x:855,y:215,w:530,h:400};note.sync();note.editor.value="Aster Prism • original desktop artwork";')
                app('files',{'path':'/Documents'});js('window.files=w;files.rect={x:105,y:95,w:850,h:620};files.sync();')
                for profile in PROFILES:
                    preset(profile);js('OS.materials.refresh();')
                    page.wait_for_function('Aster.materials.diagnostics.settled')
                    page.screenshot(path=str(out/(profile+'.png')))
                    js('assert(note.editor.value==="Aster Prism • original desktop artwork");assert(OS.windows.size===2);')
                return 'Six actual rendered desktop screenshots with the same two application instances'
            check('Six visual-review captures preserve application identity and content',screenshots)
            def accessible():
                clean();preset('macos26-light');win=app();context.clear_cookies()
                page.emulate_media(reduced_motion='reduce',forced_colors='active')
                js('OS.materials.refresh();');page.wait_for_function('document.body.dataset.glassBackend==="opaque"')
                win.locator('[data-window-action=maximize]').click();js('assert(w.maximized);')
                win.locator('[data-window-action=maximize]').click();js('assert(!w.maximized);')
                page.screenshot(path=str(out/'forced-colors.png'))
                page.emulate_media(reduced_motion='no-preference',forced_colors='none')
                return 'High-contrast glyphs remain actionable with glass disabled by actual media emulation'
            check('Forced colors and reduced motion preserve working caption controls', accessible)
            def menu_navigation():
                clean();preset('windows-dark');app();page.keyboard.press('Alt+Space');page.keyboard.press('End')
                assert js('return document.activeElement.textContent.includes("Close");')
                page.keyboard.press('Home');assert js('return document.activeElement.textContent.includes("Move");')
                page.keyboard.press('Escape');js('assert(document.querySelector("#context-menu").hidden);')
                return 'Home/End skip disabled commands and Escape restores the shell without action'
            check('Window menus support keyboard boundary navigation and semantic toggle state',menu_navigation)
            def column_headers():
                clean();preset('macos26-light');win=app('files',{'path':'/Documents'})
                js('w.rect={x:80,y:75,w:690,h:540};w.sync();')
                win.get_by_role('button',name='Sort by Date modified',exact=True).click()
                page.wait_for_function('w.body.querySelectorAll(".file-table th")[1]?.getAttribute("aria-sort")==="ascending"')
                js('const heads=[...w.body.querySelectorAll(".file-table th")];assert(heads[1].getAttribute("aria-sort")==="ascending");for(const th of heads){const b=th.querySelector("button"),r=th.getBoundingClientRect(),q=b.getBoundingClientRect();assert(q.right<=r.right+.5,"Header paints into next column");assert(getComputedStyle(b).textOverflow==="ellipsis");}')
                win.get_by_role('button',name='Sort by Date modified',exact=True).click()
                page.wait_for_function('w.body.querySelectorAll(".file-table th")[1]?.getAttribute("aria-sort")==="descending"')
                js('assert(w.body.querySelectorAll(".file-table th")[1].getAttribute("aria-sort")==="descending");')
                return 'Narrow column labels stay inside cells while full names and sorting remain accessible'
            check('Explorer header labels no longer overlap and expose live sort direction',column_headers)
            def autofocus():
                clean();preset('macos26-light')
                for name in ['notepad','terminal']:
                    clean();app(name);page.keyboard.press('Alt+Space')
                    # Wait past the application's documented initial-focus timer.
                    # This delay tests the delayed behavior, not asynchronous job completion.
                    page.wait_for_timeout(120)
                    js('assert(document.querySelector("#context-menu").contains(document.activeElement),"Mount autofocus stole menu focus");')
                    page.keyboard.press('Escape')
                return 'Both real editor/terminal mount timers leave an already opened system menu alone'
            check('Delayed initial app focus cannot steal keyboard focus from a shell menu',autofocus)
            if not args.inject:
                def persist():
                    clean();preset('macos26-dark');win=app('notepad')
                    page.keyboard.press('Alt+Space');page.get_by_role('menuitemcheckbox',name='Always on top',exact=False).click()
                    js('OS.settings.restore=true;await OS.db.set("settings",OS.settings);OS.cancelSessionSave();await OS.persistSessionNow();await OS.themes.pending;')
                    page.reload();page.wait_for_function('window.Aster?.booted && Aster.iconArtwork');page.locator('#boot').wait_for(state='detached')
                    js('await OS.ready;assert(!OS.db.memory);window.w=[...OS.windows.values()].find(w=>w.appId==="notepad");assert(w&&w.alwaysOnTop);assert(w.el.dataset.alwaysOnTop==="true");assert(OS.themes.chrome.profile==="macos26");')
                    page.locator('.window[data-app=notepad] [data-window-action=maximize]').click();js('assert(w.maximized);')
                    return 'Full IndexedDB reload restores only the user-selected on-top state; captions still respond'
                check('Pinned-window state and theme survive a real page reload',persist)
                if args.standalone:
                    clean();context.set_offline(True);page.reload();page.wait_for_function('window.Aster?.booted && Aster.iconArtwork');page.locator('#boot').wait_for(state='detached')
                    # The preceding case intentionally persisted an on-top editor.
                    # Minimize it through its actual caption before testing a window below it.
                    page.locator('.window[data-app=notepad] [data-window-action=minimize]').click()
                    page.wait_for_function('[...Aster.windows.values()].find(w=>w.appId==="notepad")?.minimized')
                    app('files');page.locator('.window[data-app=files] [data-window-action=maximize]').click();js('assert(w.maximized);')
                    report['tests'].append({'name':'Standalone icons and controls work with networking disabled','status':'PASS'})
            assert not report['errors'], report['errors']
            report['status']='PASS'
        except Exception as exc:
            report['status']='FAIL';report['error']=str(exc);raise
        finally:
            (out/'results.json').write_text(json.dumps(report,indent=2))
            browser.close();server.shutdown()

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--inject',action='store_true');parser.add_argument('--standalone',action='store_true')
    parser.add_argument('--engine',choices=['chromium','firefox'],default='chromium');parser.add_argument('--browser');parser.add_argument('--output',type=Path)
    main(parser.parse_args())
