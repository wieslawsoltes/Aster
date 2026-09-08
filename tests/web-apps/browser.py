"""Window/menu regression using explicit inert web-page fixtures.

--live is separate: it loads all actual deployed apps without fixtures. Its
report establishes iframe startup, not every app's editing or rendering feature.
--inject is only for restricted local browsers and does not verify HTTP/storage.
"""
import argparse, json, threading, time
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
FIXTURE='''<!doctype html><html><head><meta charset="utf-8"><title>Window behavior fixture</title></head><body data-fixture="true"><h1>Window behavior fixture</h1><label>Document text <input aria-label="Document text"></label><button onclick="this.textContent='Clicked'">Test input</button><p>This inert page verifies the Aster host only. It is not the external app.</p></body></html>'''

def main(args):
    out=ROOT/'tests/web-apps/artifacts';out.mkdir(parents=True,exist_ok=True)
    report={'mode':'live deployed iframe startup' if args.live else 'window mechanics with inert fixtures','injected':args.inject,'tests':[],'errors':[]}
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}/'
    with sync_playwright() as p:
        options={'headless':not args.headed,'args':['--no-sandbox']}
        if args.gpu:options['args']+=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface']
        if args.browser:options['executable_path']=args.browser
        browser=p.chromium.launch(**options)
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
        requests=[]
        if not args.live and not args.inject:
            context.route('https://wieslawsoltes.github.io/**',lambda r:r.fulfill(status=200,content_type='text/html',body=FIXTURE))
        page=context.new_page();page.set_default_timeout(30000)
        page.on('pageerror',lambda e:report['errors'].append(str(e)))
        page.on('request',lambda r:requests.append(r.url))
        def boot(standalone=False):
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if standalone else origin,wait_until='load')
            page.wait_for_function('window.Aster?.booted')
            page.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);Aster.settings.motion=false;Aster.settings.restore=false;Aster.settings.dnd=true;Aster.applySettings();document.querySelectorAll(".toast").forEach(e=>e.remove());}')
            if args.inject and not args.live:
                # The managed local Chromium blocks all network navigation. Replace
                # iframe navigation with an explicitly labeled fixture, not app code.
                page.evaluate('''html=>{const base=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'src');if(!window.fixtureSetterInstalled){window.fixtureSetterInstalled=true;Object.defineProperty(HTMLIFrameElement.prototype,'src',{get:base.get,configurable:true,set(value){if(String(value).startsWith('https://wieslawsoltes.github.io/')){this.setAttribute('src',value);this.srcdoc=html;}else base.set.call(this,value);}});}}''',FIXTURE)
        def check(name,fn):
            start=time.perf_counter()
            try:
                detail=fn();report['tests'].append({'name':name,'status':'PASS','ms':round((time.perf_counter()-start)*1000,2),'detail':detail});print('PASS',name,flush=True)
            except Exception as e:
                report['tests'].append({'name':name,'status':'FAIL','error':str(e)});print('FAIL',name,str(e),flush=True)
                page.screenshot(path=str(out/'failure.png'));raise
        def start():page.evaluate('Aster.closePanels(); Aster.toggleStart();')
        def web_index():start();page.get_by_role('button',name='Web apps, 67 projects',exact=True).click()
        def current_frame():return page.frame_locator('.web-app-frame')
        def close_all():page.evaluate('async()=>{for(const w of [...Aster.windows.values()])await w.close(true);}')
        try:
            boot();apps=page.evaluate('Aster.webCatalog.apps');categories=page.evaluate('Aster.webCatalog.categories')
            if args.live:
                results=[]
                for app in apps:
                    errors=[]
                    begin=time.perf_counter();row={'repo':app['repo'],'url':app['url']}
                    try:
                        page.evaluate('async id=>{window.web=Aster.launch(id);await web.ready;}',app['id'])
                        frame=page.locator('.web-app-frame');handle=frame.element_handle();embedded=handle.content_frame()
                        embedded.wait_for_url('https://wieslawsoltes.github.io/'+app['repo']+'/**',timeout=30000)
                        embedded.wait_for_load_state('domcontentloaded',timeout=30000)
                        embedded.wait_for_function('!!document.body && (document.body.innerText.trim().length>40 || document.querySelectorAll("canvas,button,input").length>3)',timeout=20000)
                        info=embedded.evaluate('({title:document.title,url:location.href,elements:document.body.querySelectorAll("*").length,textLength:document.body.innerText.trim().length,canvases:document.querySelectorAll("canvas").length,controls:document.querySelectorAll("button,input,textarea,select").length})')
                        assert not info['title'].startswith('Site not found'),info
                        row.update(status='PASS',ms=round((time.perf_counter()-begin)*1000),document=info)
                        if app['repo'] in ['PaintXP','Vellum','Gridline','AxiomCAD']:page.screenshot(path=str(out/(app['repo']+'-live.png')))
                    except Exception as e:row.update(status='FAIL',error=str(e))
                    finally:close_all()
                    results.append(row);print(row['status'],app['repo'],row.get('error',''),flush=True)
                report['apps']=results;report['passed']=sum(r['status']=='PASS' for r in results)
                assert report['passed']==len(apps),[r for r in results if r['status']!='PASS']
                return
            def registration():
                assert len(apps)==67 and len(categories)==10
                assert page.locator('.web-app-frame').count()==0
                assert not any(u.startswith('https://wieslawsoltes.github.io/') for u in requests)
                return '67 registrations; no external app requested at boot'
            check('Catalog registration is lazy and complete',registration)
            def folders():
                web_index();assert page.locator('[data-web-category]').count()==10
                seen=[]
                for cat in categories:
                    page.locator('[data-web-category="'+cat['id']+'"]').click()
                    members=page.locator('[data-web-app]').evaluate_all('(nodes)=>nodes.map(n=>n.dataset.webApp)')
                    assert sorted(members)==sorted(a['id'] for a in apps if a['category']==cat['id']);seen+=members
                    page.get_by_role('button',name='Back to web app categories').click()
                assert len(set(seen))==67
                page.screenshot(path=str(out/'start-categories.png'))
                return 'Every project reached through its category submenu'
            check('Ten category submenus contain all 67 projects exactly once',folders)
            def keys():
                first=page.locator('[data-web-category]').first;first.focus();first.press('ArrowRight');assert page.get_by_role('button',name='Back to web app categories').count()==1
                page.locator('[data-web-app]').first.press('Escape');assert page.locator('[data-web-category]').count()==10
                page.locator('[data-web-category]').first.press('Escape');assert page.locator('.web-start-entry').count()==1
                page.locator('.web-start-entry').press('Enter');assert page.locator('[data-web-category]').count()==10
                return 'Enter, ArrowRight and Escape navigate folders without closing Start prematurely'
            check('Submenu navigation works with keyboard and back controls',keys)
            def search():
                query=page.get_by_role('textbox',name='Search apps and files');query.fill('CAD & Manufacturing')
                page.wait_for_function('document.querySelectorAll(".start-main .search-result").length===7')
                assert page.locator('.start-main').inner_text().count('CAD & Manufacturing')==7
                query.fill('PaintXP');page.get_by_role('button',name='PaintXP App · Design & Graphics',exact=False).click()
                page.wait_for_selector('.web-app-frame');current_frame().get_by_role('heading',name='Window behavior fixture').wait_for()
                assert page.locator('.window-title').inner_text()=='PaintXP'
                assert page.locator('.web-app-frame').get_attribute('src')=='https://wieslawsoltes.github.io/PaintXP/'
                return 'Category search returns all matches; app search launches the canonical URL'
            check('Start search indexes app names, descriptions and category',search)
            def chrome():
                window=page.locator('.window[data-app="web-paintxp"]')
                for label in ['Minimize','Maximize','Close']:assert window.get_by_role('button',name=label,exact=True).count()==1
                assert page.get_by_label('App address').input_value()=='https://wieslawsoltes.github.io/PaintXP/'
                for a in page.locator('.web-app-toolbar a').all():assert a.get_attribute('target')=='_blank' and 'noopener' in a.get_attribute('rel')
                current_frame().get_by_label('Document text').fill('Keep my work')
                current_frame().get_by_role('button',name='Test input').click();assert current_frame().get_by_role('button',name='Clicked').count()==1
                return 'Actual titlebar and web toolbar; fixture input stays interactive'
            check('Embedded pages have working Aster window chrome and input',chrome)
            def lifecycle():
                window=page.locator('.window[data-app="web-paintxp"]')
                window.get_by_role('button',name='Minimize',exact=True).click();assert 'minimized' in window.get_attribute('class')
                page.locator('.task-button[data-app="web-paintxp"]').click();assert 'minimized' not in window.get_attribute('class')
                window.get_by_role('button',name='Maximize',exact=True).click();assert 'maximized' in window.get_attribute('class')
                window.get_by_role('button',name='Restore',exact=True).click();assert 'maximized' not in window.get_attribute('class')
                assert current_frame().get_by_label('Document text').input_value()=='Keep my work'
                old=window.bounding_box();handle=window.locator('.resize-handle.se');box=handle.bounding_box()
                page.mouse.move(box['x']+2,box['y']+2);page.mouse.down();page.mouse.move(box['x']-100,box['y']-80,steps=5);page.mouse.up()
                page.wait_for_function("width=>document.querySelector('.window[data-app=web-paintxp]').getBoundingClientRect().width<width", arg=old['width'],timeout=3000)
                page.evaluate('()=>{window.testWindow=[...Aster.windows.values()][0];testWindow.snap("left");}')
                assert page.locator('.web-app-frame').bounding_box()['width']<750
                return 'Minimize/restore/maximize/resize/snap preserve embedded document state'
            check('Window controls, resizing and snap retain the running page',lifecycle)
            def focus():
                page.evaluate('async()=>{window.other=Aster.launch("notepad");await other.ready;}')
                page.locator('.task-button[data-app="web-paintxp"]').click()
                current_frame().get_by_label('Document text').click()
                page.wait_for_function('Aster.windows.get(Aster.focused)?.appId==="web-paintxp"')
                assert page.locator('.task-button[data-app="web-paintxp"].active').count()==1
                page.evaluate('other.close(true)');return 'Embedded focus tracks the owning taskbar window'
            check('Iframe focus activates its owning desktop window',focus)
            def reload():
                page.get_by_role('button',name='Reload app',exact=True).click()
                current_frame().get_by_label('Document text').wait_for();assert current_frame().get_by_label('Document text').input_value()==''
                return 'Reload disposes the old browsing context and loads the canonical app URL'
            check('Reload replaces the frame and resets only that app view',reload)
            def failures():
                page.evaluate('window.dispatchEvent(new Event("offline"))');assert page.locator('.web-app-notice').is_visible()
                assert page.locator('.web-app-notice').get_by_role('link',name='Open in browser').count()==1
                page.evaluate('window.dispatchEvent(new Event("online"))');assert page.locator('.web-app-notice').is_hidden()
                return 'Offline state offers an explicit browser fallback, without fabricating app success'
            check('Offline and unsupported-embed fallback stays available',failures)
            def mobile():
                close_all();page.evaluate('window.webResizeSeen=false;window.addEventListener("resize",()=>window.webResizeSeen=true,{once:true})');page.set_viewport_size({'width':390,'height':844});page.wait_for_function('window.webResizeSeen');web_index()
                assert page.locator('[data-web-category]').count()==10
                page.locator('[data-web-category="games"]').click();assert page.locator('[data-web-app]').count()==3
                page.screenshot(path=str(out/'start-mobile.png'))
                page.locator('[data-web-app="web-railbound"]').click();current_frame().get_by_role('heading').wait_for()
                frame=page.locator('.web-app-frame').bounding_box();assert frame['width']>250 and frame['height']>200 and frame['x']>=0 and frame['x']+frame['width']<=390
                page.screenshot(path=str(out/'window-mobile-fixture.png'));close_all();page.set_viewport_size({'width':1440,'height':1000})
                return 'Single-column touch layout and contained mobile app windows'
            check('Mobile category navigation and window bounds remain usable',mobile)
            def standalone():
                boot(True);assert page.evaluate('Aster.webCatalog.apps.length')==67
                page.evaluate('async()=>{window.web=Aster.launch("web-gridline");await web.ready;}');current_frame().get_by_role('heading').wait_for()
                page.evaluate('web.close(true)');assert page.locator('.web-app-frame').count()==0
                return 'Single-file edition includes catalog and host; close removes its iframe'
            check('Standalone build hosts apps and closes browsing contexts',standalone)
            assert not report['errors'],report['errors']
        finally:
            (out/('live-results.json' if args.live else 'browser-results.json')).write_text(json.dumps(report,indent=2)+'\n')
            browser.close();server.shutdown()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inject',action='store_true');parser.add_argument('--live',action='store_true');parser.add_argument('--gpu',action='store_true');parser.add_argument('--headed',action='store_true');parser.add_argument('--browser');main(parser.parse_args())
