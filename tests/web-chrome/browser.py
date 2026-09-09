"""Compact windows + Orbit tests. Controlled site fixtures are explicitly labeled.
HTTP/file CI checks real navigation, CSP denial and durable reloads. --inject is
memory-only: iframe src setters use labeled srcdoc fixtures under managed policy.
--live separately checks unchanged deployed Forma/NotepadXP without route mocks.
"""
import argparse,json,threading,time
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
FIXTURE='<!doctype html><meta charset="utf-8"><title>Embedded site verification fixture</title><h1>Embedded site verification fixture</h1><label>Document text<textarea aria-label="Document text"></textarea></label><button onclick="this.textContent=\'Clicked\'">Test input</button><p>Controlled test site, not an implementation of a catalog application.</p>'
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path.startswith('/fixture/'):
            data=FIXTURE.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
            if self.path.startswith('/fixture/denied'):
                self.send_header('Content-Security-Policy',"frame-ancestors 'none'");self.send_header('X-Frame-Options','DENY')
            self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
        else:super().do_GET()

def main(args):
    out=args.output or ROOT/'tests/web-chrome/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
    report={'mode':'live sites' if args.live else 'injected memory fixtures' if args.inject else 'standalone + controlled HTTP sites' if args.standalone else 'HTTP + controlled sites','tests':[],'errors':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,args=['--no-sandbox'],**({'executable_path':args.browser} if args.browser else {}));context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow');page=context.new_page();page.set_default_timeout(20000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(body,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+body+'}',arg)
        def clean():js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def app(id='web-forma'):
            wid=js('window.web=OS.launch(arg);await web.ready;return web.id;',id);w=page.locator(f'[data-window="{wid}"]');return w
        def fixture(frame):frame.get_by_role('heading',name='Embedded site verification fixture',exact=True).wait_for()
        def menu(w):w.get_by_role('button',name='Window controls',exact=True).click()
        def check(name,fn):
            t=time.perf_counter()
            try:detail=fn();report['tests'].append({'name':name,'status':'PASS','detail':detail,'ms':round((time.perf_counter()-t)*1000)});print('PASS',name,flush=True)
            except Exception as e:report['tests'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));(out/'failure-dom.txt').write_text(page.locator('#context-menu').evaluate('(e)=>e.outerHTML'));raise
        try:
            if not args.live and not args.inject:
                context.route('https://wieslawsoltes.github.io/**',lambda route:route.fulfill(status=200,content_type='text/html',body=FIXTURE))
                context.route('https://duckduckgo.com/**',lambda route:route.fulfill(status=200,content_type='text/html',body=FIXTURE))
            url=(ROOT/'Aster.html').as_uri() if args.standalone else origin+'/'
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto(url)
            page.wait_for_function('Aster.booted && !!Aster.openInBrowser');js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();');clean()
            if args.inject:
                page.evaluate('''html=>{const d=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');Object.defineProperty(HTMLIFrameElement.prototype,'src',{get:d.get,configurable:true,set(value){if(/^https?:/.test(value)){this.setAttribute('src',value);this.srcdoc=html;}else d.set.call(this,value);}});}''',FIXTURE)
            if args.live:
                for repo in ['Forma','NotepadXP']:
                    def live(repo=repo):
                        w=app('web-'+repo.lower());frame=w.locator('.web-app-frame').element_handle().content_frame();frame.wait_for_url('https://wieslawsoltes.github.io/'+repo+'/**');frame.wait_for_load_state('domcontentloaded');frame.wait_for_function('document.body && (document.body.innerText.length>40 || document.querySelectorAll("button,input,canvas").length>3)');assert w.locator('.titlebar').is_hidden();assert w.locator('.web-app-toolbar').is_hidden();page.screenshot(path=str(out/(repo+'-compact-live.png')))
                        menu(w);page.get_by_role('menuitem',name='Open in Aster Browser',exact=True).click();page.wait_for_selector('.window[data-app="browser"] .browser-iframe');inner=page.locator('.browser-iframe').element_handle().content_frame();inner.wait_for_url('https://wieslawsoltes.github.io/'+repo+'/**');inner.wait_for_load_state('domcontentloaded');inner.wait_for_function('document.body && (document.body.innerText.length>40 || document.querySelectorAll("button,input,canvas").length>3)');page.screenshot(path=str(out/(repo+'-orbit-live.png')));clean();return 'Unchanged deployed site started both compact and in Orbit; not an exhaustive application test.'
                    check(repo+' actual deployed document starts in compact window and Orbit',live)
                report['status']='PASS';return
            w=app();frame=w.frame_locator('.web-app-frame');fixture(frame)
            def defaults():
                assert w.locator('.titlebar').is_hidden() and w.locator('.web-app-toolbar').is_hidden() and w.locator('.web-app-footer').is_hidden()
                a=w.bounding_box();f=w.locator('.web-app-frame').bounding_box();assert abs(f['y']-a['y'])<3 and f['height']>a['height']-4
                assert page.locator('#taskbar [data-app="web-forma"]').count()==1
                frame.get_by_label('Document text').fill('Keep this unsaved text');frame.get_by_role('button',name='Test input').click();assert frame.get_by_role('button',name='Clicked').count()==1
                js('window.originalFrame=web.webFrame;');page.screenshot(path=str(out/'compact-window-fixture.png'));return 'No host title/address/footer; one taskbar entry; actual interactive controlled iframe.'
            check('All catalog windows use chrome-free defaults without replacing the guest UI',defaults)
            def controls():
                menu(w);page.get_by_role('menuitem',name='Minimize',exact=True).click();assert 'minimized' in w.get_attribute('class');page.locator('#taskbar [data-app="web-forma"]').click()
                menu(w);page.get_by_role('menuitem',name='Maximize',exact=True).click();assert 'maximized' in w.get_attribute('class');menu(w);page.get_by_role('menuitem',name='Restore',exact=True).click()
                before=w.bounding_box();grip=w.get_by_label('Move app window');r=grip.bounding_box();page.mouse.move(r['x']+12,r['y']+12);page.mouse.down();page.mouse.move(r['x']-58,r['y']+45,steps=6);page.mouse.up();page.wait_for_function('(old)=>web.rect.x<old.x-30',arg={'x':before['x']})
                grip.focus();x=js('return web.rect.x;');page.keyboard.press('ArrowRight');assert js('return web.rect.x;')==x+10
                h=w.locator('.resize-handle.se').bounding_box();width=js('return web.rect.w;');page.mouse.move(h['x']+3,h['y']+3);page.mouse.down();page.mouse.move(h['x']-90,h['y']-60,steps=6);page.mouse.up();page.wait_for_function('width=>web.rect.w<width',arg=width)
                assert frame.get_by_label('Document text').input_value()=='Keep this unsaved text';return 'Menu min/max/restore; genuine pointer move/resize; keyboard movement; iframe state preserved.'
            check('Compact windows keep pointer, keyboard, resize and taskbar controls',controls)
            def settings():
                js('const s=OS.openApp("settings",{section:"webapps"});await s.ready;');s=page.locator('.window[data-app="settings"]');s.get_by_label('Show web app title bars',exact=True).check();s.get_by_label('Show web app address toolbar',exact=True).check();page.wait_for_function('!web.bar.hidden && !web.body.querySelector(".web-app-toolbar").hidden');assert w.get_by_role('button',name='Minimize',exact=True).is_visible();js('assert(web.webFrame===originalFrame);');assert frame.get_by_label('Document text').input_value()=='Keep this unsaved text'
                s.get_by_label('Show web app title bars',exact=True).uncheck();s.get_by_label('Show web app address toolbar',exact=True).uncheck();page.wait_for_function('web.bar.hidden && web.body.querySelector(".web-app-toolbar").hidden');page.screenshot(path=str(out/'settings.png'));js('await [...OS.windows.values()].find(w=>w.appId==="settings").close(true);');return 'Actual Settings inputs update existing frames in place, independently; no iframe reload.'
            check('Settings restores and hides title/address chrome live and independently',settings)
            def profiles():
                for id in ['macos26-light','ubuntu-dark','windows-light']:
                    js('await OS.themes.select(arg);',id);assert w.locator('.titlebar').is_hidden();js('web.snap("left");OS.closePanels();');a=w.bounding_box();f=w.locator('.web-app-frame').bounding_box();assert abs(a['y']-f['y'])<3;assert f['height']>a['height']-4
                js('assert(web.webFrame===originalFrame);');return 'All three OS shell profiles preserve compact geometry and the same iframe.'
            check('Compact work area survives macOS, Ubuntu and Windows theme changes',profiles)
            def taskbar():
                page.locator('#taskbar [data-app="web-forma"]').click(button='right');page.get_by_role('button',name='Window controls · Forma',exact=True).click();page.get_by_role('menuitem',name='Close',exact=False).click();d=page.get_by_role('dialog',name='Close Forma?',exact=True);d.get_by_role('button',name='Cancel',exact=True).click();assert w.is_visible();js('assert(web.webFrame===originalFrame);');return 'Taskbar exposes controls even with title hidden; dirty-work confirmation is retained.'
            check('Taskbar window controls and cancelled close preserve the running document',taskbar)
            def internal():
                menu(w);page.get_by_role('menuitem',name='Open in Aster Browser',exact=True).click();fixture(page.frame_locator('.window[data-app="browser"] .browser-iframe'));assert len(context.pages)==1
                assert page.locator('.window[data-app="browser"] > .titlebar').is_visible();assert page.locator('.browser-address').input_value()=='https://wieslawsoltes.github.io/Forma/';assert page.locator('.browser-iframe').get_attribute('data-browser-policy')=='reviewed-app';js('assert(web.webFrame===originalFrame);');return 'Explicit URL now opens in a normal Orbit window, not Home or an external tab.'
            check('Open in Aster Browser routes the canonical website to a real browser tab',internal)
            def navigation():
                b=page.locator('.window[data-app="browser"]');address=b.get_by_label('Address or search');address.fill(origin+'/fixture/one');address.press('Enter');fixture(b.frame_locator('.browser-iframe'));assert b.locator('.browser-iframe').get_attribute('data-browser-policy')=='isolated'
                address.fill(origin+'/fixture/two');address.press('Enter');page.wait_for_function('(url)=>document.querySelector(".browser-iframe").getAttribute("src")===url',arg=origin+'/fixture/two');b.get_by_role('button',name='Back',exact=True).click();page.wait_for_function('(url)=>document.querySelector(".browser-address").value===url',arg=origin+'/fixture/one');b.get_by_role('button',name='Forward',exact=True).click();page.wait_for_function('(url)=>document.querySelector(".browser-address").value===url',arg=origin+'/fixture/two')
                b.get_by_role('button',name='New tab',exact=True).click();assert b.locator('.browser-tab').count()==2;address.fill(origin+'/fixture/three');address.press('Enter');b.locator('.browser-tab').first.click();assert address.input_value()==origin+'/fixture/two';assert b.locator('.browser-content[hidden]').count()==1;return 'Browser-originated HTTP navigation, back/forward and distinct tab state.'
            check('Orbit opens entered websites internally and keeps bounded per-tab history',navigation)
            def search():
                b=page.locator('.window[data-app="browser"]');address=b.get_by_label('Address or search');address.fill('aster web search');address.press('Enter');page.wait_for_function('document.querySelector(".browser-address").value==="https://duckduckgo.com/?q=aster%20web%20search"');assert len(context.pages)==1;fixture(b.frame_locator('.browser-content:not([hidden]) > .browser-iframe'));return 'Search provider URL stays in Orbit (provider response is a labeled fixture).'
            check('Address search no longer opens a host-browser tab automatically',search)
            def local():
                js("await OS.fs.write('/Documents/isolation.html','<!doctype html><h1>Local isolated document</h1>','text/html');const b=[...OS.windows.values()].find(w=>w.appId==='browser');await b.navigate('aster://file/Documents/isolation.html');")
                f=page.locator('.browser-content:not([hidden]) > .browser-iframe');child=f.element_handle().content_frame();child.get_by_role('heading',name='Local isolated document').wait_for();assert 'allow-same-origin' not in f.get_attribute('sandbox');assert child.evaluate("()=>{try{return !parent.Aster}catch(e){return e.name==='SecurityError'}}")
                address=page.get_by_label('Address or search');address.fill('javascript:alert(1)');address.press('Enter');page.wait_for_function('Aster.notifications.some(n=>n.message.includes("Only HTTP"))');assert child.get_by_role('heading',name='Local isolated document').is_visible();return 'Local HTML cannot read parent.Aster; active scheme rejection does not replace its page.'
            check('Local HTML isolation and unsafe-address rejection are preserved',local)
            def stale_navigation():
                js("await OS.fs.write('/Documents/slow.html','<!doctype html><h1>Old navigation</h1>','text/html');window.releaseRead=null;const read=OS.fs.read.bind(OS.fs);OS.fs.read=async function(path,...args){const data=await read(path,...args);if(path==='/Documents/slow.html')await new Promise(resolve=>window.releaseRead=resolve);return data;};window.restoreRead=()=>OS.fs.read=read;const b=[...OS.windows.values()].find(w=>w.appId==='browser');window.pendingRead=b.navigate('aster://file/Documents/slow.html');")
                page.wait_for_function('!!window.releaseRead');js("const b=[...OS.windows.values()].find(w=>w.appId==='browser');await b.navigate('aster://home');releaseRead();await pendingRead;restoreRead();assert(b.body.querySelector('.browser-content:not([hidden]) > .browser-home'));assert(!b.body.querySelector('.browser-content:not([hidden]) > .browser-iframe'));")
                return 'A deliberately delayed genuine filesystem read cannot replace a newer browser navigation.'
            check('Late local file reads cannot overwrite a newer tab navigation',stale_navigation)
            def custom():
                js("OS.registerCustom({id:'custom-chrome-test',title:'Custom chrome test',path:'/Documents/isolation.html'});window.customWindow=OS.openApp('custom-chrome-test');await customWindow.ready;assert(customWindow.bar.hidden);assert(customWindow.webChrome);");page.frame_locator('.window[data-app="custom-chrome-test"] iframe').get_by_role('heading',name='Local isolated document').wait_for();js('await customWindow.close(true);');return 'Imported standalone HTML apps also use the titlebar preference without changing sandbox policy.'
            check('Custom installed web apps also receive compact controls',custom)
            if not args.inject:
                def denied():
                    js('const b=[...OS.windows.values()].find(w=>w.appId==="browser");await b.navigate(arg);',origin+'/fixture/denied');b=page.locator('.window[data-app="browser"]');f=b.locator('.browser-content:not([hidden]) > .browser-iframe').element_handle().content_frame();f.wait_for_load_state();assert f.get_by_role('heading',name='Embedded site verification fixture').count()==0;assert 'forbid embedding' in b.locator('.browser-content:not([hidden]) > .browser-note').inner_text()
                    with context.expect_page() as pop:b.get_by_role('button',name='Open in browser ↗',exact=True).click()
                    external=pop.value;external.wait_for_load_state();external.get_by_role('heading',name='Embedded site verification fixture').wait_for();external.close();return 'CSP/X-Frame-Options denial remains enforced. Explicit external fallback loads a top-level page.'
                check('Sites that forbid frames stay blocked, with working explicit external fallback',denied)
                def persistence():
                    clean();js('await OS.setSetting("webAppTitleBars",true);await OS.setSetting("webAppToolbars",false);const b=await OS.openInBrowser(arg);await b.navigate("aster://home",true);OS.settings.restore=true;await OS.db.set("settings",OS.settings);OS.cancelSessionSave();await OS.persistSessionNow();',origin+'/fixture/persist')
                    page.reload();page.wait_for_function('Aster.booted && !!Aster.openInBrowser');js('await OS.ready;assert(!OS.db.memory);assert(OS.settings.webAppTitleBars===true);assert(OS.settings.webAppToolbars===false);');page.wait_for_selector('.browser-tab');assert page.locator('.browser-tab').count()==2;assert page.get_by_label('Address or search').input_value()=='aster://home';new=app();assert new.locator('.titlebar').is_visible() and new.locator('.web-app-toolbar').is_hidden();js('await OS.setSetting("webAppTitleBars",false);');return 'Settings and two distinct browser tabs/active selection survive a full IndexedDB reload.'
                check('Preferences and Orbit tabs persist across a full browser reload',persistence)
            def mobile():
                clean();page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390');mw=app();fixture(mw.frame_locator('.web-app-frame'));f=mw.locator('.web-app-frame').bounding_box();assert f['x']>=0 and f['x']+f['width']<=391 and f['height']>220;menu(mw);assert page.get_by_role('menuitem',name='Open in Aster Browser',exact=True).is_visible();page.keyboard.press('Escape');page.screenshot(path=str(out/'mobile.png'));js('window.closedFrame=web.webFrame;');menu(mw);page.get_by_role('menuitem',name='Close',exact=False).click();page.get_by_role('dialog',name='Close Forma?',exact=True).get_by_role('button',name='Close app',exact=True).click();js('assert(!closedFrame.isConnected);assert(web.webFrame===null);');return 'Mobile content and controls stay in viewport; confirmed close disposes the iframe.'
            check('Mobile compact controls remain accessible and close releases the browsing context',mobile)
            if args.standalone:
                def offline():
                    clean();context.set_offline(True);page.reload();page.wait_for_function('Aster.booted && !!Aster.openInBrowser');js('await OS.ready;const b=OS.openApp("browser");await b.ready;assert(b.body.querySelector(".browser-home"));await OS.themes.select("ubuntu-dark");assert(OS.settings.webAppTitleBars===false);');context.set_offline(False);return 'Offline standalone keeps preferences, browser home and theme switching; remote sites still require network.'
                check('Offline standalone retains settings and browser home',offline)
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as e:report['status']='FAIL';report['error']=str(e);raise
        finally:(out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--live',action='store_true');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
