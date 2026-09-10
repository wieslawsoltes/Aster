"""Orbit integration tests. Injected mode is memory-only, never persistence proof.
HTTP serves real fixture responses including actual CSP/XFO denial. Hosted mode
uses real popups, downloads and IndexedDB. --live checks unchanged Google HTML.
"""
import argparse, json, threading, time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
SDK=(ROOT/'sdk/aster-webview.js').read_text()
HTML='<!doctype html><html><head><title>Orbit fixture</title></head><body><h1>Orbit fixture document</h1><label>Draft<textarea>Original</textarea></label><script>'+SDK+'</script></body></html>'
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        if self.path.startswith('/orbit-fixture/'):
            body=HTML.encode();self.send_response(200)
            if '/denied' in self.path:
                self.send_header('Content-Security-Policy',"frame-ancestors 'none'");self.send_header('X-Frame-Options','DENY')
            self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else: super().do_GET()

def main(args):
    out=args.output or ROOT/'tests/orbit/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    report={'engine':args.engine,'mode':'injected memory-only' if args.inject else 'standalone/offline' if args.standalone else 'HTTP/IndexedDB','live':args.live,'checks':[],'errors':[]}
    with sync_playwright() as p:
        browser=getattr(p,args.engine).launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox'] if args.engine=='chromium' else [])
        ctx=browser.new_context(viewport={'width':1440,'height':1000},has_touch=True,accept_downloads=True)
        page=ctx.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        requests=[];ctx.on('request',lambda req:requests.append(req.url))
        def js(code,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m)};'+code+'}',arg)
        def check(name,fn):
            start=time.monotonic()
            try:
                detail=fn();report['checks'].append({'name':name,'status':'PASS','detail':detail,'ms':round(1000*(time.monotonic()-start))});print('PASS',name,flush=True)
            except Exception as e:
                report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        def boot():page.wait_for_function('window.Aster?.booted');page.locator('#boot').wait_for(state='detached');js('await OS.ready;await OS.orbit.initialize();')
        def clean():
            js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);await OS.orbit.preferences({confirmLeave:false});document.querySelectorAll(".toast").forEach(n=>n.remove());assert(OS.webviews.activeCount===0);')
        def launch(options=None):
            clean();js('window.b=OS.launch("browser",arg);await b.ready;',options or {});return page.locator('.window[data-app="browser"]')
        def local():
            w=launch({'url':'aster://file/Documents/orbit-test.html','mode':'webview'});frame=w.locator('iframe').element_handle().content_frame();frame.get_by_role('heading',name='Orbit fixture document').wait_for();frame.wait_for_function('AsterWebview.connected');return w,frame
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
            boot();js('OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();await OS.db.set("settings",OS.settings);await OS.fs.write("/Documents/orbit-test.html",arg,"text/html");',HTML)
            if args.live:
                def live_google():
                    w=launch({'url':'https://www.google.pl/'});assert not w.locator('iframe').count()
                    with ctx.expect_page() as popup:w.get_by_role('link',name='Open in browser ↗',exact=True).click()
                    remote=popup.value;remote.wait_for_load_state('domcontentloaded',timeout=60000)
                    assert remote.evaluate('window.opener===null');assert remote.url.startswith('https://')
                    from urllib.parse import urlparse
                    host=urlparse(remote.url).hostname or '';assert host=='google.pl' or host.endswith('.google.pl') or host=='google.com' or host.endswith('.google.com'),remote.url
                    remote.wait_for_function('document.body?.innerText.length>50',timeout=30000)
                    result={'url':remote.url,'title':remote.title(),'bodyCharacters':len(remote.locator('body').inner_text()),'scope':'Unchanged Google top-level document; consent/challenge pages are not a claim of completed login or search.'}
                    remote.screenshot(path=str(out/'google-real-tab.png'));remote.close();return result
                check('Google opens in a real independent browser tab without response rewriting',live_google)
            else:
                def handoff():
                    before=len(requests);w=launch({'url':'https://www.google.pl/'});w.get_by_role('heading',name='Open this website in your browser').wait_for();assert not w.locator('iframe').count();assert w.get_by_role('link',name='Open in browser ↗').get_attribute('rel')=='noopener noreferrer';assert not any('google.pl' in u for u in requests[before:]);assert js('return b.getWebview().snapshot.route;')=='browser'
                    # No trusted event: programmatic navigation must not open a popup.
                    js('await b.navigate("https://example.org/");');assert len(ctx.pages)==1;assert not w.locator('iframe').count()
                check('Google and programmatic addresses show handoff, never a broken iframe or surprise popup',handoff)
                def unsafe():
                    local();js('window.original=b.getWebview().frame;for(const value of ["javascript:alert(1)","data:text/html,x","https://user:pass@example.org"]){let failed=false;try{await b.navigate(value)}catch{failed=true}assert(failed);assert(b.getWebview().frame===original)}')
                check('Unsafe addresses reject before replacing the existing document',unsafe)
                def navigation():
                    w,f=local();f.get_by_label('Draft').click();f.get_by_label('Draft').fill('Keep Ω draft');js('window.original=b.getWebview().frame;await b.openTab("aster://home");');w.get_by_role('tab').first.click();assert f.get_by_label('Draft').input_value()=='Keep Ω draft';js('assert(b.getWebview().frame===original);');w.get_by_role('tab').last.click();js('await b.navigate("aster://bookmarks");await b.navigate("aster://history");await b.browser.back();assert(b.getTabs().find(t=>t.active).url==="aster://bookmarks");await b.browser.forward();assert(b.getTabs().find(t=>t.active).url==="aster://history");')
                check('Cached tabs preserve exact iframe and draft; Back and Forward retain per-tab navigation',navigation)
                def reopen():
                    w=launch();js('await b.openTab("https://example.org/reopen");');w.get_by_role('tab').last.get_by_role('button',name='Close tab').click();page.wait_for_function('b.getTabs().length===1');js('await b.browser.reopenClosed();assert(b.getTabs().length===2);assert(b.getWebview().snapshot.status==="restored");assert(!b.getWebview().frame);')
                check('Reopen closed tab restores an address without contacting its website',reopen)
                def guard():
                    w,f=local();f.evaluate('AsterWebview.setDirty(true)');page.wait_for_function('b.getWebview().snapshot.dirty===true');w.get_by_role('button',name='Home',exact=True).click();d=page.get_by_role('dialog',name='Leave the embedded page?');d.wait_for();d.get_by_role('button',name='Cancel',exact=True).click();assert f.get_by_role('heading').is_visible();w.get_by_role('button',name='Home',exact=True).click();d.get_by_role('button',name='Continue',exact=True).click();w.locator('.browser-home').wait_for();assert not w.locator('iframe').count()
                check('Reported unsaved work requires actual Cancel/Continue navigation confirmation',guard)
                def pending_disposal():
                    w,f=local();f.evaluate('AsterWebview.setDirty(true)');page.wait_for_function('b.getWebview().snapshot.dirty');w.get_by_role('button',name='Reload',exact=True).click();page.get_by_role('dialog',name='Reload this page?').wait_for();js('await b.close(true);');page.wait_for_function('!document.querySelector(".dialog-backdrop")');assert js('return OS.webviews.activeCount;')==0
                check('Closing an owner disposes its pending navigation confirmation and webview',pending_disposal)
                def unknown_guard():
                    w,f=local();js('b.getWebview().state.dirty=null;await OS.orbit.preferences({confirmLeave:true});');w.get_by_role('button',name='Stop and unload').click();d=page.get_by_role('dialog',name='Stop and unload this page?');d.get_by_role('button',name='Cancel',exact=True).click();assert f.get_by_role('heading').is_visible();w.get_by_role('button',name='Stop and unload').click();d.get_by_role('button',name='Continue',exact=True).click();w.get_by_role('heading',name='Page stopped').wait_for();assert not w.locator('iframe').count()
                check('Unknown dirty state is protected; confirmed Stop really unloads the document',unknown_guard)
                def sdk():
                    w,f=local();assert f.evaluate('(()=>{try{return !!parent.Aster}catch{return false}})()') is False
                    f.evaluate('document.title="Cooperative Ω";AsterWebview.update();');page.wait_for_function('b.getWebview().snapshot.title==="Cooperative Ω"');assert w.locator('.browser-tab').inner_text().startswith('Cooperative Ω')
                    js('window.beforeState=b.getWebview().snapshot;window.postMessage({type:"aster-webview-state",version:1,title:"Forged",url:"https://evil.test",dirty:true},"*");');page.wait_for_timeout(30);assert js('return b.getWebview().snapshot.title;')=='Cooperative Ω'
                check('Public presentation SDK reports title while sandbox and port scoping remain enforced',sdk)
                def compact():
                    clean();js('window.b=OS.openWebview("aster://file/Documents/orbit-test.html",{compact:true});await b.ready;');w=page.locator('.window[data-app="browser"]');assert not w.locator('.browser-nav').is_visible();assert w.locator('iframe').bounding_box()['height']>100;w.get_by_role('button',name='Show navigation').click();assert w.get_by_label('Address or search').is_visible();js('assert(b.state.webview);assert(!b.state.compact);')
                check('OS.openWebview creates a real compact view with recoverable navigation',compact)
                def reusable():
                    clean();js('const owner=OS.launch("notepad");await owner.ready;const container=OS.el("div");owner.body.append(container);const view=OS.webviews.create(container,{owner});await view.navigate("aster://file/Documents/orbit-test.html",{initial:true});assert(view.frame);view.setZoom(1.5);assert(view.frame.style.transform==="scale(1.5)");assert(OS.webviews.activeCount===1);await owner.close(true);assert(OS.webviews.activeCount===0);assert(view.snapshot.status==="disposed");')
                check('Reusable webview owns navigation, zoom, lifecycle and cleanup outside Orbit',reusable)
                def search():
                    w=launch();js('await OS.orbit.preferences({engine:"google"});await b.navigate("engineering Ω");');assert w.get_by_label('Address or search').input_value()=='https://www.google.com/search?q=engineering%20%CE%A9';assert not w.locator('iframe').count();js('await OS.orbit.preferences({engine:"duckduckgo"});')
                check('Search engine preferences produce real encoded provider addresses',search)
                def bookmarks():
                    w=launch({'url':'https://example.org/book'});w.get_by_role('button',name='Bookmark this address').click();d=page.get_by_role('dialog',name='Bookmark this address');d.locator('input').fill('Engineering Ω');d.get_by_role('button',name='Save',exact=True).click();d.wait_for(state='detached');w.get_by_role('button',name='Bookmarks',exact=True).click();w.get_by_role('button',name='Engineering Ω',exact=False).wait_for();w.get_by_role('button',name='Edit',exact=True).click();d=page.get_by_role('dialog',name='Bookmark title');d.locator('input').fill('Updated Ω');d.get_by_role('button',name='Save',exact=True).click();w.get_by_role('button',name='Updated Ω',exact=False).wait_for()
                    with page.expect_download() as download:w.get_by_role('button',name='Export bookmarks').click()
                    saved=out/'bookmarks.json';download.value.save_as(saved);data=json.loads(saved.read_text());assert data['format']=='aster.bookmarks';assert any(x['title']=='Updated Ω' for x in data['bookmarks'])
                    with page.expect_file_chooser() as chosen:w.get_by_role('button',name='Import bookmarks').click()
                    chosen.value.set_files({'name':'bookmarks.json','mimeType':'application/json','buffer':json.dumps({'format':'aster.bookmarks','version':1,'bookmarks':[{'url':'https://example.org/import','title':'Imported'}]}).encode()});page.get_by_role('dialog',name='Import bookmarks?').get_by_role('button',name='Import',exact=True).click();w.get_by_role('button',name='Imported',exact=False).wait_for()
                check('Bookmark UI editing and actual JSON download/import preserve addresses',bookmarks)
                def history():
                    w=launch();js('await OS.orbit.clearHistory();await b.navigate("https://example.org/private");assert(!OS.orbit.data.history.length);await OS.orbit.preferences({recordHistory:true});await b.navigate("https://example.org/record");assert(OS.orbit.data.history.length===1);');w.get_by_role('button',name='History',exact=True).click();w.get_by_role('button',name='Clear history',exact=True).click();d=page.get_by_role('dialog',name='Clear browsing history?');d.get_by_role('button',name='Clear history',exact=True).click();page.wait_for_function('Aster.orbit.data.history.length===0');js('await OS.orbit.preferences({recordHistory:false});')
                check('History is opt in and its actual clearing control removes stored entries',history)
                def shortcuts():
                    w=launch()
                    js('window.saving=OS.orbit.saveShortcut("https://example.org/shortcut","Shortcut Ω");');d=page.get_by_role('dialog',name='Save website shortcut');d.get_by_role('button',name='Save',exact=True).click();js('await saving;const path="/Documents/Shortcut Ω.asterlink";assert((await OS.fs.text(await OS.fs.read(path))).includes("example.org"));window.linkWindow=OS.launch(OS.appForFile(path),{path});await linkWindow.ready;assert(linkWindow.getWebview().snapshot.route==="browser");assert(!linkWindow.getWebview().frame);');return 'Actual virtual file bytes reopened through OS.appForFile.'
                check('Files website shortcuts save actual bytes and reopen through the browser association',shortcuts)
                def saved_app():
                    clean();js('window.app=await OS.appLibrary.install({kind:"url",title:"Orbit saved site",url:"https://example.org/saved",description:"Saved link",category:"Your apps",icon:"globe",color:"teal"});window.b=OS.launch(app.id);await b.ready;');w=page.locator('.window').last;w.get_by_role('heading',name='Open this website in your browser').wait_for();assert not w.locator('iframe').count();assert w.locator('.installed-webview').bounding_box()['height']>100;js('assert(b.webview.options.isolated);')
                check('Saved HTTPS apps share the handoff engine and retain usable webview geometry',saved_app)
                def routes():
                    w=launch();js('await OS.orbit.siteRoute("https://example.org/","webview");await b.navigate("aster://settings");');assert w.locator('.orbit-site-routes').inner_text().startswith('https://example.org');w.get_by_role('button',name='Reset',exact=True).click();page.wait_for_function('!Aster.orbit.data.routes.length');js('window.settings=OS.launch("settings",{section:"orbit"});await settings.ready;');page.locator('.window[data-app="settings"]').get_by_label('Search engine').wait_for()
                check('Site preferences have actual reset controls and integrate with Aster Settings',routes)
                def reuse():
                    launch();js('const first=b;await OS.openURL("https://example.org/one");assert([...OS.windows.values()].filter(w=>w.appId==="browser").length===1);assert(b.getTabs().length===2);const next=await OS.openURL("https://example.org/two",{newWindow:true});assert(next!==first);assert(!next.getWebview().frame);')
                check('OS.openURL reuses Orbit or opens an independent window without automatic remote requests',reuse)
                def stale():
                    launch();js('window.release=null;const read=OS.fs.read.bind(OS.fs);window.undoRead=()=>OS.fs.read=read;OS.fs.read=async(path,...args)=>{const f=await read(path,...args);if(path==="/Documents/orbit-test.html")await new Promise(r=>release=r);return f;};window.pending=b.navigate("aster://file/Documents/orbit-test.html");');page.wait_for_function('!!window.release');js('await b.navigate("aster://home");release();await pending;undoRead();assert(b.body.querySelector(".browser-home"));assert(!b.body.querySelector("iframe"));')
                check('A delayed real source read cannot replace a newer navigation',stale)
                def profiles():
                    w,f=local();f.get_by_label('Draft').click();f.get_by_label('Draft').fill('Theme preserved');js('window.original=b.getWebview().frame;')
                    for preset in ['windows-light','windows-dark','macos26-light','macos26-dark','ubuntu-light','ubuntu-dark']:
                        js('await OS.themes.select(arg);',preset);assert f.get_by_label('Draft').input_value()=='Theme preserved';js('assert(b.getWebview().frame===original);');page.screenshot(path=str(out/(preset+'.png')))
                    js('await OS.themes.select("windows-light");')
                check('All light/dark desktop profiles preserve the running document and draft',profiles)
                def mobile():
                    w,f=local();page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390 && (()=>{const r=document.querySelector(".orbit-browser").getBoundingClientRect();return r.x>=0&&r.right<=391})()');box=w.locator('.orbit-browser').bounding_box();assert box['x']>=0 and box['x']+box['width']<=391;assert w.get_by_label('Address or search').is_visible();page.screenshot(path=str(out/'mobile.png'));page.set_viewport_size({'width':844,'height':390});page.wait_for_function('innerHeight===390 && document.querySelector(".orbit-browser iframe").getBoundingClientRect().height>40');assert w.locator('iframe').bounding_box()['height']>40;page.screenshot(path=str(out/'landscape.png'));page.set_viewport_size({'width':1440,'height':1000})
                check('Portrait and short landscape retain real navigation and embedded content',mobile)
                def bounds():
                    launch();js('for(let i=1;i<20;i++)await b.openTab();let failed=false;try{await b.openTab()}catch{failed=true}assert(failed);assert(b.getTabs().length===20);await b.close(true);assert(OS.webviews.activeCount===0);')
                check('Tab limits fail explicitly and owner closure releases every view',bounds)
                if not args.inject:
                    def real_handoff():
                        w=launch({'url':origin+'/orbit-fixture/denied'});assert not w.locator('iframe').count()
                        with ctx.expect_page() as popup:w.get_by_role('link',name='Open in browser ↗').click()
                        remote=popup.value;remote.get_by_role('heading',name='Orbit fixture document').wait_for();assert remote.evaluate('opener===null');remote.close()
                        address=w.get_by_label('Address or search');address.fill(origin+'/orbit-fixture/allowed')
                        with ctx.expect_page() as popup:address.press('Enter')
                        remote=popup.value;remote.get_by_role('heading',name='Orbit fixture document').wait_for();assert remote.evaluate('opener===null');remote.close()
                    check('Real top-level handoff and address-bar Enter open documents with no opener',real_handoff)
                    def real_webview():
                        w=launch({'url':origin+'/orbit-fixture/allowed','mode':'webview'});f=w.locator('iframe').element_handle().content_frame();f.get_by_role('heading',name='Orbit fixture document').wait_for();assert f.evaluate('(()=>{try{return !!parent.Aster}catch{return false}})()') is False;page.wait_for_function('b.getWebview().snapshot.status==="cooperative"');f.evaluate('location.hash="updated"');page.wait_for_function('b.getWebview().snapshot.reportedURL.endsWith("#updated")');assert w.get_by_label('Address or search').input_value().endswith('#updated');assert 'allow-same-origin' not in w.locator('iframe').get_attribute('sandbox')
                    check('A real HTTP webview renders with opaque isolation and scoped SDK address updates',real_webview)
                    def denied():
                        w=launch({'url':origin+'/orbit-fixture/denied','mode':'webview'});page.wait_for_function('b.getWebview().snapshot.status==="unverified"');f=w.locator('iframe').element_handle().content_frame();assert not f.get_by_role('heading',name='Orbit fixture document').count();assert w.get_by_role('button',name='Page not visible?').is_visible()
                        with ctx.expect_page() as popup:w.get_by_role('link',name='Open in browser ↗').click()
                        remote=popup.value;remote.get_by_role('heading',name='Orbit fixture document').wait_for();remote.close()
                    check('Real CSP/XFO denial stays enforced while external fallback displays the same document',denied)
                    def persistence():
                        launch();js('assert(!OS.db.memory);await OS.orbit.preferences({restoreTabs:true,recordHistory:true,engine:"bing"});await OS.orbit.bookmark("https://example.org/persist","Durable Ω");await OS.orbit.siteRoute("https://example.net","webview");await b.navigate("https://example.org/restored");await b.openTab("aster://bookmarks");OS.settings.restore=true;await OS.db.set("settings",OS.settings);OS.cancelSessionSave();await OS.persistSessionNow();');before=len(requests);page.reload();boot();page.wait_for_function('[...Aster.windows.values()].some(w=>w.appId==="browser"&&w.getTabs)');js('window.b=[...OS.windows.values()].find(w=>w.appId==="browser");await b.ready;assert(b.getTabs().length===2);assert(OS.orbit.data.preferences.engine==="bing");assert(OS.orbit.data.bookmarks.some(b=>b.title==="Durable Ω"));assert(OS.orbit.data.routes.some(r=>r.origin==="https://example.net"));assert(!b.body.querySelector("iframe"));');assert not any('example.org/restored' in u for u in requests[before:]);page.locator('.window[data-app="browser"]').get_by_role('tab').first.click();page.get_by_role('heading',name='Your saved address is ready').wait_for()
                    check('Full IndexedDB reload restores metadata and addresses but does not contact saved sites',persistence)
                    def transactions():
                        js('window.beforeBookmarks=JSON.stringify(OS.orbit.data.bookmarks);const tx=OS.db.db.transaction.bind(OS.db.db);OS.db.db.transaction=(...args)=>{const t=tx(...args);if(args[0]==="meta"&&args[1]==="readwrite")queueMicrotask(()=>t.abort());return t;};let rejected=false;try{await OS.orbit.bookmark("https://example.org/abort","Abort")}catch{rejected=true}finally{OS.db.db.transaction=tx}assert(rejected);assert(JSON.stringify(OS.orbit.data.bookmarks)===beforeBookmarks);assert(!(await OS.db.get("orbit-v1")).bookmarks.some(b=>b.title==="Abort"));')
                    check('Aborted IndexedDB metadata commits publish neither memory nor stored bookmarks',transactions)
                if args.standalone:
                    def offline():
                        clean();js('OS.settings.restore=false;await OS.db.set("settings",OS.settings);');ctx.set_offline(True);page.reload();boot();w,f=local();assert f.get_by_role('heading').is_visible();ctx.set_offline(False)
                    check('Standalone boots offline and executes its saved local webview',offline)
            clean();assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as e:report['status']='FAIL';report['error']=str(e);raise
        finally:
            (out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--live',action='store_true');ap.add_argument('--engine',default='chromium');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
