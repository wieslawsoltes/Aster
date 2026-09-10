"""Real App Center workflows. --inject is explicitly memory-only; HTTP/file runs
verify IndexedDB across reloads. Only URL-link responses use a labeled fixture.
HTML installation, source updates, export, registry, dialogs and sandbox are real.
"""
import argparse, json, threading, time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
SOURCE='<!doctype html><html><head><title>Library test app</title></head><body><h1>Version one</h1><label>Draft<textarea id="draft">Original</textarea></label><button id="check" onclick="document.querySelector(\'output\').textContent=\'Working\'">Test</button><output></output></body></html>'
SOURCE2=SOURCE.replace('Version one','Version two')
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main(args):
    out=args.output or ROOT/'tests/app-library/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
    report={'engine':args.engine,'mode':'injected memory' if args.inject else 'standalone' if args.standalone else 'HTTP/IndexedDB','checks':[],'errors':[]}
    with sync_playwright() as p:
        b=getattr(p,args.engine).launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox'] if args.engine=='chromium' else [])
        context=b.new_context(viewport={'width':1440,'height':1000},has_touch=True,accept_downloads=True)
        context.route('https://example.test/**',lambda r:r.fulfill(status=200,content_type='text/html',body='<h1>Explicit HTTPS link fixture</h1>'))
        page=context.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(code,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+code+'}',arg)
        def check(name,fn):
            start=time.monotonic()
            try:
                detail=fn();report['checks'].append({'name':name,'status':'PASS','detail':detail,'ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
            except Exception as e:
                report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        def focus_store():js('window.center=OS.openApp("store");await center.ready;center.focus();OS.closePanels();')
        def tab(name):focus_store();page.locator('.library-tabs').get_by_role('button',name=name,exact=True).click()
        def details(id):focus_store();js('center.navigateApp(arg);',id);page.locator('[data-app-detail]').wait_for()
        def form(title):return page.get_by_role('dialog',name=title,exact=True)
        def install(source=SOURCE,title='Review app Ω',description='Flow calculation and local review'):
            focus_store()
            with page.expect_file_chooser() as chosen:page.get_by_role('button',name='Install HTML app',exact=True).click()
            chosen.value.set_files({'name':'index.html','mimeType':'text/html','buffer':source.encode()})
            d=form('Install HTML app');d.get_by_label('App name',exact=True).fill(title);d.get_by_label('Description',exact=True).fill(description);d.get_by_label('Category',exact=True).select_option('Science & Simulation');d.get_by_label('Publisher (self-reported)',exact=True).fill('Review lab');d.get_by_label('Version (self-reported)',exact=True).fill('1.0');d.get_by_role('button',name='Install',exact=True).click();d.wait_for(state='detached')
            return js('return OS.customApps.at(-1).id;')
        def cleanup():js('OS.closePanels();for(const w of [...OS.windows.values()])if(w.appId!=="store")await w.close(true);document.querySelectorAll(".toast").forEach(n=>n.remove());')
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
            page.wait_for_function('window.Aster?.booted');page.locator('#boot').wait_for(state='detached')
            js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();await OS.db.set("settings",OS.settings);for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(n=>n.remove());')
            focus_store()
            check('Discover lists all 79 catalog apps without eager remote execution',lambda:js('assert(document.querySelectorAll("[data-library-app]").length===79);assert(!document.querySelector(".web-app-frame"));assert(OS.apps.size===107);'))
            def discover():
                for repo,title in [('VoltWeaveCircuitStudio','VoltWeave Circuit Studio'),('StratumIntelligence','Stratum Intelligence'),('Veldra3D','Veldra 3D + Weave'),('AvolithStudio','Avolith Studio'),('AureonStudio','Aureon Studio')]:
                    page.get_by_label('Search apps',exact=True).fill(title);assert page.locator('[data-library-app="web-'+repo.lower()+'"]').count()==1
                page.get_by_label('Search apps',exact=True).fill('P&ID');assert page.locator('[data-library-app="web-stratumintelligence"]').count()==1;page.get_by_label('Search apps',exact=True).fill('')
                page.get_by_label('Filter category').select_option('CAD & Manufacturing');assert page.locator('[data-library-app]').count()==11;page.get_by_label('Filter category').select_option('')
            check('Requested apps, descriptions and categories are searchable',discover)
            def cancel_install():
                old=js('return (await OS.db.all()).length;')
                with page.expect_file_chooser() as chosen:page.get_by_role('button',name='Install HTML app',exact=True).click()
                chosen.value.set_files({'name':'cancel.html','mimeType':'text/html','buffer':SOURCE.encode()});d=form('Install HTML app');d.get_by_label('Description',exact=True).fill('Do not commit');d.get_by_role('button',name='Cancel',exact=True).click();assert js('return (await OS.db.all()).length;')==old;assert js('return OS.customApps.length;')==0
            check('Cancelling installation creates neither a source file nor launcher',cancel_install)
            app=install()
            def installed():
                r=js('const r=OS.appLibrary.get(arg);assert(r.description==="Flow calculation and local review");assert(OS.apps.get(arg).description===r.description);assert((await OS.fs.text(await OS.fs.read(r.path)))===argSource);return r;'.replace('argSource',json.dumps(SOURCE)),app)
                tab('Installed');assert page.locator('[data-library-app]').count()==1;assert 'Flow calculation' in page.locator('.library-card-description').inner_text();return r
            check('Issue 11: real HTML install saves the custom description and exact source bytes',installed)
            def editing():
                js('window.running=OS.launch(arg);await running.ready;window.originalFrame=running.body.querySelector("iframe");window.originalCaptionIcon=running.titleEl.firstElementChild;',app)
                f=page.locator('.app-frame').element_handle().content_frame();f.get_by_label('Draft').click();f.get_by_label('Draft').fill('Keep unsaved Ω text');assert f.get_by_label('Draft').input_value()=='Keep unsaved Ω text','Draft entry failed before any metadata edit';f.locator('#check').click();assert f.locator('output').inner_text()=='Working'
                details(app);page.get_by_role('button',name='Edit details',exact=True).click();d=form('Edit app details');d.get_by_label('App name',exact=True).fill('Engineering desk Ω');d.get_by_label('Description',exact=True).fill('Reactor review <img src=x onerror=alert(1)>');d.get_by_label('Icon',exact=True).select_option('calculator');d.get_by_label('Icon color',exact=True).select_option('teal');d.get_by_label('Favorite',exact=True).check();d.get_by_role('button',name='Save changes',exact=True).click();d.wait_for(state='detached')
                assert f.get_by_label('Draft').input_value()=='Keep unsaved Ω text','Metadata editing changed the guest draft';js('assert(originalFrame===running.body.querySelector("iframe"));assert(running.title==="Engineering desk Ω");assert(OS.appLibrary.get(arg).color==="teal");assert(OS.appIcon(arg).includes("#258980"));assert(originalCaptionIcon===running.titleEl.firstElementChild);assert(originalCaptionIcon.style.getPropertyValue("--art-base")==="#258980");',app)
                assert not page.locator('.library-description img').count();assert '<img' in page.locator('.library-description').inner_text()
            check('Editing name, description and artwork preserves iframe identity and unsaved content',editing)
            def filters():
                tab('Favorites');assert page.locator('[data-library-app]').count()==1;page.get_by_label('Search apps',exact=True).fill('review lab');assert page.locator('[data-library-app]').count()==1;page.get_by_label('Search apps',exact=True).fill('unmatched');assert page.locator('[data-library-app]').count()==0;page.get_by_label('Search apps',exact=True).fill('');page.get_by_label('Sort apps').select_option('updated');tab('Installed')
            check('Favorites, publisher search, empty results and sort use saved metadata',filters)
            def metadata_cancel():
                details(app);page.get_by_role('button',name='Edit details',exact=True).click();d=form('Edit app details');d.get_by_label('App name',exact=True).fill('Discarded');d.get_by_label('Description',exact=True).fill('Discarded');d.press('Escape');assert js('return OS.appLibrary.get(arg).title;',app)=='Engineering desk Ω'
            check('Escape cancels edits and restores focus without changing metadata',metadata_cancel)
            def focus_and_theme():
                details(app);page.get_by_role('button',name='Edit details',exact=True).click();d=form('Edit app details');d.get_by_label('Description',exact=True).fill('Typed during profile switch');node=d.get_by_label('Description',exact=True).element_handle();d.get_by_role('button',name='Cancel',exact=True).focus()
                for preset in ['windows-light','windows-dark','macos26-light','macos26-dark','ubuntu-light','ubuntu-dark']:
                    js('await OS.themes.select(arg);',preset);assert node.evaluate('(n)=>n.isConnected&&n.value==="Typed during profile switch"');page.screenshot(path=str(out/(preset+'-editor.png')))
                last=d.get_by_role('button',name='Save changes',exact=True);last.focus();last.press('Tab');assert d.get_by_label('App name',exact=True).evaluate('(n)=>document.activeElement===n');d.get_by_label('App name',exact=True).press('Shift+Tab');assert last.evaluate('(n)=>document.activeElement===n');d.press('Escape');js('await OS.themes.select("windows-light");')
            check('Six light/dark profiles preserve draft fields and trap keyboard focus',focus_and_theme)
            def replacement():
                details(app);old=js('return OS.appLibrary.get(arg).path;',app)
                with page.expect_file_chooser() as chosen:page.get_by_role('button',name='Replace HTML',exact=True).click()
                chosen.value.set_files({'name':'v2.html','mimeType':'text/html','buffer':SOURCE2.encode()});d=form('Update Engineering desk Ω?');d.get_by_role('button',name='Update package',exact=True).click();page.wait_for_function('id=>Aster.appLibrary.get(id).path!==window.running.installedSource',arg=app)
                assert js('return running.body.querySelector("iframe")===originalFrame;');f=page.locator('.app-frame').element_handle().content_frame();assert f.get_by_role('heading').inner_text()=='Version one';assert f.get_by_label('Draft').input_value()=='Keep unsaved Ω text';assert js('return await OS.fs.text(await OS.fs.read(arg));',old)==SOURCE
                js('window.nextWindow=OS.launch(arg);await nextWindow.ready;',app);frames=page.locator('.app-frame');new=frames.nth(1).element_handle().content_frame();assert new.get_by_role('heading').inner_text()=='Version two';js('await nextWindow.close(true);')
            check('HTML replacement preserves old source and running drafts; next launch uses real new bytes',replacement)
            def export_import():
                details(app)
                with page.expect_download() as download:page.get_by_role('button',name='Export app package',exact=True).click()
                file=out/'export.asterapp';download.value.save_as(file);package=json.loads(file.read_text());assert package['html']==SOURCE2;assert package['app']['description'].startswith('Reactor review');assert 'id' not in package['app']
                with page.expect_file_chooser() as chooser:page.get_by_role('button',name='Install HTML app',exact=True).click()
                chooser.value.set_files(str(file));d=form('Install HTML app');assert d.get_by_label('App name',exact=True).input_value()=='Engineering desk Ω';d.get_by_label('App name',exact=True).fill('Imported package');d.get_by_role('button',name='Install',exact=True).click();d.wait_for(state='detached');assert js('return OS.customApps.length;')==2;assert js('return OS.customApps.at(-1).id;')!=app
            check('Exported app packages preserve source and details and import with a new identity',export_import)
            def start_search():
                js('OS.toggleStart();');search=page.get_by_role('textbox',name='Search apps and files');search.fill('Reactor review');page.locator('.start-main .search-result').first.wait_for();assert 'Engineering desk Ω' in page.locator('.start-main').inner_text();js('OS.closePanels();')
            check('Start search uses the edited description rather than the old fixed text',start_search)
            def pins():
                details(app);page.get_by_role('button',name='Pin to taskbar',exact=True).click();page.get_by_role('button',name='Pin to Start',exact=True).click();page.get_by_role('button',name='Desktop shortcut',exact=True).click();js('assert(OS.pins.includes(arg));assert(OS.startPins.includes(arg));assert(OS.desktopShortcuts.some(x=>x.app===arg));',app)
            check('Installed apps support real taskbar, Start and desktop shortcuts',pins)
            def denied_remove():
                details(app);page.get_by_role('button',name='Remove app',exact=True).click();form('Remove Engineering desk Ω?').get_by_role('button',name='Remove',exact=True).click();form('Close Engineering desk Ω?').get_by_role('button',name='Cancel',exact=True).click();js('assert(OS.appLibrary.get(arg));assert(!running.closed);',app)
            check('Cancelling an unsaved-app close cancels uninstall instead of force-closing work',denied_remove)
            def link_install():
                focus_store();page.get_by_role('button',name='Add web app',exact=True).click();d=form('Add web app');d.get_by_label('App name',exact=True).fill('Documentation link');d.get_by_label('Description',exact=True).fill('My saved documentation');d.get_by_label('Website address',exact=True).fill('javascript:alert(1)');d.get_by_role('button',name='Add app',exact=True).click();d.get_by_role('alert').wait_for();assert js('return OS.customApps.length;')==2
                d.get_by_label('Website address',exact=True).fill('https://example.test/docs');d.get_by_role('button',name='Add app',exact=True).click();d.wait_for(state='detached');link=js('return OS.customApps.at(-1).id;');js('window.linkWindow=OS.launch(arg);await linkWindow.ready;',link)
                frame=page.locator('.window').filter(has=page.locator('.app-link-notice')).locator('iframe');assert frame.get_attribute('sandbox')=='allow-scripts allow-forms allow-modals allow-downloads';assert 'allow-same-origin' not in frame.get_attribute('sandbox');assert frame.get_attribute('src')=='https://example.test/docs';js('await linkWindow.close(true);')
                return link
            check('Web links reject executable URLs and retain an opaque sandbox with an external fallback',link_install)
            def sandbox():
                f=page.locator('.app-frame').element_handle().content_frame();assert f.evaluate('(()=>{try{return !!parent.Aster}catch{return false}})()') is False;assert page.locator('.app-frame').get_attribute('sandbox')=='allow-scripts allow-forms allow-modals allow-downloads'
            check('HTML apps cannot read the parent desktop through the sandbox',sandbox)
            def stale():
                js('const old=structuredClone(OS.appLibrary.get(arg));await OS.appLibrary.save({...old,publisher:"New publisher"},old.revision);try{await OS.appLibrary.save({...old,title:"Stale"},old.revision);throw Error("unexpected success");}catch(e){assert(e.message.includes("changed elsewhere"));}assert(OS.appLibrary.get(arg).title!=="Stale");',app)
            check('Stale edit revisions cannot overwrite newer metadata',stale)
            def concurrent():
                js('const r=structuredClone(OS.appLibrary.get(arg));await Promise.all([OS.appLibrary.save({...r,description:"Concurrent A"},r.revision).then(()=>"ok",()=>"rejected"),OS.appLibrary.save({...r,description:"Concurrent B"},r.revision).then(()=>"ok",()=>"rejected")]).then(x=>assert(x.filter(y=>y==="ok").length===1));',app)
            check('Concurrent metadata saves serialize and reject the stale contender',concurrent)
            def missing():
                copied=js('return OS.customApps.find(a=>a.title==="Imported package");');js('await OS.db.batch([],[arg]);',copied['path']);details(copied['id']);page.wait_for_function('document.querySelector(".library-source-status")?.textContent.startsWith("Source is missing")')
            check('Missing packages show an actionable status without pretending to be installed payloads',missing)
            def mobile():
                cleanup();tab('Installed');page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390');js('center.rect={x:0,y:0,w:390,h:760};center.sync();');assert page.get_by_role('button',name='Install HTML app',exact=True).is_visible();page.screenshot(path=str(out/'mobile-library.png'))
                details(app);page.get_by_role('button',name='Edit details',exact=True).click();d=form('Edit app details');d.get_by_label('Description',exact=True).fill('Mobile draft');d.get_by_role('button',name='Save changes',exact=True).scroll_into_view_if_needed();assert d.bounding_box()['width']<=390;d.get_by_role('button',name='Save changes',exact=True).click();d.wait_for(state='detached');assert js('return OS.appLibrary.get(arg).description;',app)=='Mobile draft'
                page.set_viewport_size({'width':844,'height':390});js('center.rect={x:0,y:0,w:844,h:350};center.sync();');page.get_by_role('button',name='Edit details',exact=True).click();d=form('Edit app details');d.get_by_role('button',name='Cancel',exact=True).scroll_into_view_if_needed();assert d.get_by_role('button',name='Cancel',exact=True).is_visible();page.screenshot(path=str(out/'landscape-editor.png'));d.get_by_role('button',name='Cancel',exact=True).click();page.set_viewport_size({'width':1440,'height':1000});js('center.rect={x:120,y:80,w:1060,h:740};center.sync();')
            check('Portrait and short-landscape layouts retain editable fields and confirmation actions',mobile)
            def project_install():
                js('await OS.fs.write("/Projects/review-project.html",arg,"text/html");OS.installProjectApp("/Projects/review-project.html","Code project");',SOURCE);d=form('Add app to Start');d.get_by_label('Description',exact=True).fill('Created in Code Studio');d.get_by_role('button',name='Install',exact=True).click();d.wait_for(state='detached');assert js('return OS.customApps.find(a=>a.title==="Code project").description;')=='Created in Code Studio'
            check('Code Studio installation uses the same editable-description workflow',project_install)
            def settings():
                js('window.settings=OS.launch("settings",{section:"apps"});await settings.ready;');page.get_by_role('button',name='Manage installed apps',exact=True).click();page.wait_for_function('document.querySelector(".library-header h1").textContent==="Installed"');js('await settings.close(true);')
            check('Settings routes an already-open App Center to Installed apps',settings)
            def backup_roundtrip():
                cleanup();expected=js('return OS.appLibrary.get(arg);',app)
                js('window.backupSettings=OS.launch("settings",{section:"recovery"});await backupSettings.ready;')
                with page.expect_download() as download:page.get_by_role('button',name='Export backup',exact=True).click()
                file=out/'desktop-backup.json';download.value.save_as(file);packed=json.loads(file.read_text())
                assert next(r for r in packed['customApps'] if r['id']==app)==expected
                js('const r=OS.appLibrary.get(arg);await OS.fs.write(r.path,"Source changed after export","text/html");await OS.appLibrary.save({...r,description:"Changed after export",favorite:false},r.revision);',app)
                with page.expect_file_chooser() as chooser:page.get_by_role('button',name='Restore backup',exact=True).click()
                chooser.value.set_files(str(file));form('Restore Aster backup?').get_by_role('button',name='Restore',exact=True).click()
                page.wait_for_function('id=>Aster.appLibrary.get(id)?.description==="Mobile draft"&&Aster.appLibrary.get(id).favorite===true',arg=app)
                actual=js('return OS.appLibrary.get(arg);',app)
                for key in ['id','kind','title','description','category','icon','color','publisher','version','favorite','path']:assert actual[key]==expected[key],key
                assert js('return await OS.fs.text(await OS.fs.read(arg));',expected['path'])==SOURCE2
                js('await backupSettings.close(true);');focus_store()
            check('Real desktop backup restores edited app metadata and the actual HTML package',backup_roundtrip)
            if not args.inject:
                def abort_transaction():
                    js('const raw=structuredClone(await OS.db.get("customApps")),before=await OS.db.all();const original=OS.db.db.transaction.bind(OS.db.db);OS.db.db.transaction=(...args)=>{const tx=original(...args);if(args[1]==="readwrite"&&Array.isArray(args[0])&&args[0].includes("meta"))queueMicrotask(()=>tx.abort());return tx;};try{await OS.appLibrary.install({kind:"html",title:"Abort test"},"<h1>Never committed</h1>");throw Error("Unexpected commit");}catch(e){assert(e.message!=="Unexpected commit");}finally{OS.db.db.transaction=original;}assert(JSON.stringify(raw)===JSON.stringify(await OS.db.get("customApps")));assert((await OS.db.all()).length===before.length);assert(!OS.customApps.some(a=>a.title==="Abort test"));')
                check('Aborting the actual IndexedDB transaction leaves both package and launcher unchanged',abort_transaction)
                def reload():
                    expected=js('return OS.appLibrary.get(arg);',app);page.reload();page.wait_for_function('Aster.booted');page.locator('#boot').wait_for(state='detached');assert js('return OS.appLibrary.get(arg);',app)==expected;assert js('return Aster.db.mode;')=='IndexedDB';assert js('return OS.webIO.sessions.length;')==0;focus_store();tab('Favorites');assert page.locator('[data-library-app="'+app+'"]').count()==1
                check('Full reload restores edited details, favorites and packages but not expired grants',reload)
                def legacy():
                    js('await OS.fs.write("/Projects/legacy.html",arg,"text/html");const apps=await OS.db.get("customApps");apps.push({id:"custom-legacy",title:"Legacy install",path:"/Projects/legacy.html"},{id:"files",title:"Rejected raw record",path:"/Projects/legacy.html",description:"Recoverable metadata"});await OS.db.set("customApps",apps);',SOURCE);page.reload();page.wait_for_function('Aster.booted');r=js('return OS.appLibrary.get("custom-legacy");');assert r['description']=='Your sandboxed HTML application';assert r['path']=='/Projects/legacy.html'
                    js('assert(OS.appLibrary.rejected.length===1);assert(!OS.apps.get("files").custom);window.recovery=OS.launch("settings",{section:"recovery"});await recovery.ready;')
                    with page.expect_download() as download:page.get_by_role('button',name='Export backup',exact=True).click()
                    file=out/'legacy-recovery-backup.json';download.value.save_as(file);raw=json.loads(file.read_text())
                    assert any(r.get('id')=='files' and r.get('description')=='Recoverable metadata' for r in raw['customApps'])
                    js('await recovery.close(true);');focus_store();details('custom-legacy');page.get_by_role('button',name='Edit details',exact=True).click();d=form('Edit app details');d.get_by_label('Description',exact=True).fill('Updated legacy description');d.get_by_role('button',name='Save changes',exact=True).click();d.wait_for(state='detached');page.reload();page.wait_for_function('Aster.booted');assert js('return OS.appLibrary.get("custom-legacy").description;')=='Updated legacy description';focus_store()
                check('Legacy installations migrate and retain edited descriptions after another reload',legacy)
                if args.standalone:
                    context.set_offline(True);page.reload();page.wait_for_function('Aster.booted');focus_store();details(app);assert 'Mobile draft' in page.locator('.library-description').inner_text();context.set_offline(False);check('Standalone library starts offline with persisted app details',lambda:None)
            def final_remove():
                cleanup();details(app);old=js('return OS.appLibrary.get(arg).path;',app);page.get_by_role('button',name='Remove app',exact=True).click();form('Remove Engineering desk Ω?').get_by_role('button',name='Remove',exact=True).click();page.wait_for_function('id=>!Aster.apps.has(id)&&!Aster.pins.includes(id)&&!Aster.startPins.includes(id)',arg=app);js('assert(!OS.customApps.some(a=>a.id===arg));assert(!OS.pins.includes(arg));assert(!OS.startPins.includes(arg));assert(!(await OS.db.get("taskbarPins")||[]).includes(arg));assert(!(await OS.db.get("startPins")||[]).includes(arg));',app);assert js('return (await OS.fs.stat(arg)).kind;',old)=='file'
            check('Uninstall removes the launcher and pins while preserving the package and documents',final_remove)
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception:
            report['status']='FAIL';raise
        finally:
            (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));b.close();server.shutdown()
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--inject',action='store_true');parser.add_argument('--standalone',action='store_true');parser.add_argument('--engine',default='chromium');parser.add_argument('--browser');parser.add_argument('--output',type=Path);main(parser.parse_args())
