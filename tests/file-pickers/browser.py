"""Actual profile-aware host pickers through the installed opaque fixture.
No picker, byte, authority or app implementation is mocked. Injected mode is
memory-only; hosted HTTP and file:// test actual durable reloads independently.
"""
import argparse,json,threading,time
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*a):pass

def main(args):
    out=args.output or ROOT/'tests/file-pickers/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start();origin=f'http://127.0.0.1:{server.server_port}'
    report={'engine':args.engine,'mode':'injected memory' if args.inject else 'standalone' if args.standalone else 'HTTP/IndexedDB','checks':[],'errors':[]}
    with sync_playwright() as p:
        browser=getattr(p,args.engine).launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox'] if args.engine=='chromium' else [])
        context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='allow',has_touch=True);page=context.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(code,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+code+'}',arg)
        def check(name,fn):
            start=time.monotonic()
            try:
                detail=fn();report['checks'].append({'name':name,'status':'PASS','detail':detail,'ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
            except Exception as e:
                report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        def location(d,path):
            d.get_by_label('Aster folder',exact=True).fill(path);d.get_by_role('button',name='Go',exact=True).click()
            page.wait_for_function('(path)=>document.querySelector(".io-picker-status")?.textContent===path && document.querySelector(".io-picker")?.getAttribute("aria-busy")==="false"',arg=path)
        def launch(kind='open',path='/Documents/Picker review'):
            frame.locator('#'+{'open':'open','save':'save','folder':'folder','multi':'multi'}.get(kind,kind)).click()
            d=page.get_by_role('dialog',name={'save':'Save to Aster','folder':'Choose Aster folder'}.get(kind,'Open from Aster'),exact=True);d.wait_for()
            if path is not None:location(d,path)
            return d
        def close(d):
            d.get_by_role('button',name='Cancel',exact=True).click();frame.wait_for_function('error?.name==="AbortError"')
            js('assert(!OS.filePicker.diagnostics.open);assert(!OS.filePicker.diagnostics.objectURLs);assert(!document.querySelector("#window-layer").inert);')
        def complete():
            frame.wait_for_function('result!==null||error!==null');r=frame.evaluate('({result,error})');assert r['error'] is None,r;return r['result']
        def row(d,name):return d.get_by_role('option',name=name,exact=True)
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
            page.wait_for_function('Aster.booted&&Aster.filePicker');page.locator('#boot').wait_for(state='detached')
            js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();for(const w of [...OS.windows.values()])await w.close(true);OS.closePanels();document.querySelectorAll(".toast").forEach(n=>n.remove());')
            js("await OS.fs.mkdir('/Documents/Picker review');await OS.fs.mkdir('/Documents/Picker review/Projects');await OS.fs.mkdir('/Documents/Picker review/Projects/Empty');for(const [name,body]of [['Brief.txt','Aster design review — żółć 日本語'],['Notes2.txt','Two'],['Notes10.txt','Ten'],['.hidden.txt','Hidden by choice'],['Preview.svg','<svg xmlns=\"http://www.w3.org/2000/svg\"><script>parent.PREVIEW_EXECUTED=true</script></svg>']])await OS.fs.write('/Documents/Picker review/'+name,body);await OS.fs.write('/Documents/Picker review/bytes.bin',new Blob([new Uint8Array([0,255,4,8])]),'application/octet-stream');const c=document.createElement('canvas');c.width=160;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='#2b6898';ctx.fillRect(0,0,160,100);ctx.fillStyle='#98d8c3';ctx.fillRect(20,20,90,60);await OS.fs.write('/Documents/Picker review/Sketch.png',await new Promise(r=>c.toBlob(r)),'image/png');await OS.fs.write('/Documents/picker-review.html',arg,'text/html');OS.registerCustom({id:'picker-review',title:'Design workspace',path:'/Documents/picker-review.html'});window.reviewWindow=OS.openApp('picker-review');await reviewWindow.ready;",(ROOT/'tests/web-io/fixture.html').read_text())
            page.wait_for_function('Aster.webIO.sessions.some(s=>s.app==="picker-review"&&s.state==="connected")');frame=page.locator('.app-frame').element_handle().content_frame();frame.wait_for_function('AsterFiles?.connected')
            def deselect_to_one():
                d=launch('multi');row(d,'Brief.txt').click();row(d,'bytes.bin').click(modifiers=['Control']);row(d,'Brief.txt').click(modifiers=['Control'])
                assert row(d,'bytes.bin').get_attribute('aria-selected')=='true'
                assert row(d,'Brief.txt').get_attribute('aria-selected')=='false'
                assert d.get_by_label('File name',exact=True).input_value()=='bytes.bin'
                d.get_by_role('button',name='Open',exact=True).click();assert complete()['names']==['bytes.bin']
            check('Ctrl-deselect to one returns the remaining file, never the deselected filename',deselect_to_one)
            def save_navigation():
                for preset in ['windows-light','macos26-light','ubuntu-light']:
                    js('await OS.themes.select(arg);',preset)
                    d=launch('save');name='Preserved draft '+preset+' Ω.txt';field=d.get_by_label('File name',exact=True);field.fill(name)
                    row(d,'Projects').click();assert field.input_value()==name
                    d.get_by_role('button',name='Save',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents/Picker review/Projects"')
                    assert field.input_value()==name
                    assert js('return !await OS.fs.stat("/Documents/Picker review/"+arg);',name)
                    row(d,'Empty').dblclick();page.wait_for_function('document.querySelector(".io-picker-status").textContent.endsWith("/Projects/Empty")')
                    assert field.input_value()==name
                    d.get_by_role('button',name='Save',exact=True).click();complete()
                    assert js('return await OS.fs.text(await OS.fs.read("/Documents/Picker review/Projects/Empty/"+arg));',name)==frame.locator('#text').input_value()
                js('await OS.themes.select("windows-light");')
            check('Save As retains typed names while entering folders and writes only to the chosen destination',save_navigation)
            def profiles():
                presets=js('return AsterThemeModels.PRESETS.map(t=>t.id);');captures=[]
                for preset in presets:
                    js('await OS.themes.select(arg);',preset)
                    for kind in ['open','save','folder']:
                        d=launch(kind);profile=d.get_attribute('data-picker-profile');assert profile in ['windows','macos26','ubuntu']
                        button=d.get_by_role('button',name={'open':'Open','save':'Save','folder':'Select folder'}[kind],exact=True)
                        if profile=='ubuntu':assert button.evaluate('(n)=>!!n.closest(".io-title-end")')
                        else:assert button.evaluate('(n)=>!!n.closest(".io-actions")')
                        assert d.get_by_label('File name',exact=True).is_visible()==(kind!='folder')
                        if kind=='save':assert d.get_by_label('File name',exact=True).evaluate('(n)=>!!n.closest(".io-name-top")')==(profile!='windows')
                        if preset in ['windows-light','windows-dark','macos26-light','macos26-dark','ubuntu-light','ubuntu-dark']:
                            if kind=='open':row(d,'Brief.txt').click()
                            page.screenshot(path=str(out/(preset+'-'+kind+'.png')));captures.append(preset+'-'+kind)
                        close(d)
                return {'presets':len(presets),'dialogKinds':3,'screenshots':captures}
            check('All twelve presets use the correct Open, Save and Folder layout and live controls',profiles)
            js('await OS.themes.select("windows-light");')
            def navigation():
                d=launch();row(d,'Projects').click();assert d.locator('.io-picker-status').inner_text()=='/Documents/Picker review';row(d,'Projects').dblclick();page.wait_for_function('document.querySelector(".io-picker-status").textContent.endsWith("/Projects")')
                d.get_by_role('button',name='Back',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents/Picker review"');d.get_by_role('button',name='Forward',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent.endsWith("/Projects")');d.get_by_role('button',name='Parent folder',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents/Picker review"')
                d.get_by_role('navigation',name='Folder breadcrumb').get_by_role('button',name='Documents',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents"');close(d)
            check('Folder selection, double-click, history, parent and breadcrumbs navigate real paths',navigation)
            def keyboard():
                d=launch('multi');row(d,'Brief.txt').click();page.keyboard.press('Control+a');assert len(d.locator('[aria-selected=true]').all())==6
                page.keyboard.press('Home');assert row(d,'Projects').get_attribute('aria-selected')=='true';page.keyboard.press('ArrowDown');assert row(d,'Brief.txt').get_attribute('aria-selected')=='true';page.keyboard.press('ArrowDown');page.keyboard.press('ArrowDown');page.keyboard.press('ArrowDown');assert d.locator('.io-count').inner_text()=='1 selected'
                page.keyboard.press('Control+l');assert d.get_by_label('Aster folder',exact=True).evaluate('(n)=>n===document.activeElement');page.keyboard.press('Control+f');assert d.get_by_label('Filter files',exact=True).evaluate('(n)=>n===document.activeElement');close(d)
            check('Roving selection and standard keyboard navigation remain inside the picker',keyboard)
            def sorting():
                d=launch('multi');d.get_by_label('Filter files',exact=True).fill('Notes');assert [r.get_attribute('aria-label') for r in d.get_by_role('listbox',name='Aster files',exact=True).get_by_role('option').all()]==['Notes2.txt','Notes10.txt']
                d.get_by_role('button',name='Sort by Name',exact=True).click();assert d.get_by_role('listbox',name='Aster files',exact=True).get_by_role('option').first.get_attribute('data-io-path').endswith('Notes10.txt')
                d.get_by_label('Filter files',exact=True).fill('');assert not row(d,'.hidden.txt').count();d.get_by_role('button',name='Show hidden files',exact=True).click();assert row(d,'.hidden.txt').is_visible();d.get_by_role('button',name='Show hidden files',exact=True).click();d.get_by_role('button',name='Sort by Name',exact=True).click();close(d)
            check('Search, natural sorting, reverse order and optional dotfiles are functional',sorting)
            def preview():
                d=launch('multi');d.get_by_role('button',name='Icon view',exact=True).click();d.get_by_role('button',name='Preview pane',exact=True).click();row(d,'Sketch.png').click();d.locator('.io-preview img').wait_for();page.wait_for_function('document.querySelector(".io-preview img")?.naturalWidth===160');assert js('return OS.filePicker.diagnostics.objectURLs;')==1
                row(d,'Preview.svg').click();d.locator('.io-preview pre').wait_for();assert '<script>' in d.locator('.io-preview pre').inner_text();assert js('return !window.PREVIEW_EXECUTED;');assert js('return OS.filePicker.diagnostics.objectURLs;')==0
                row(d,'Brief.txt').click();page.wait_for_function('document.querySelector(".io-preview pre")?.textContent.includes("日本語")');page.screenshot(path=str(out/'safe-preview.png'))
                close(d)
            check('Grid view and actual image/text previews are inert and release object URLs',preview)
            def theme_switch():
                d=launch('save');name=d.get_by_label('File name',exact=True);name.fill('Unchanged draft Ω.txt');name.focus();js('window.nameNode=document.querySelector(".io-name input");nameNode.setSelectionRange(3,7);window.pickerNode=document.querySelector(".io-picker");')
                for preset in ['macos26-light','ubuntu-light','windows-dark']:
                    js('await OS.themes.select(arg);assert(nameNode===document.querySelector(".io-name input"));assert(pickerNode===document.querySelector(".io-picker"));assert(nameNode.value==="Unchanged draft Ω.txt");assert(document.activeElement===nameNode);assert(nameNode.selectionStart===3&&nameNode.selectionEnd===7);',preset)
                close(d);assert frame.locator('#text').is_editable();frame.locator('#text').fill('Editor still receives real clicks')
            check('Live profile changes retain the exact input, typed filename, selection and app content',theme_switch)
            def newfolder():
                js('await OS.themes.select("ubuntu-light");');d=launch('save');d.get_by_role('button',name='New folder',exact=True).click();nested=page.get_by_role('dialog',name='New folder',exact=True);nested.get_by_role('textbox').fill('Created here');nested.get_by_role('button',name='Save',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent.endsWith("/Created here")');assert js("return (await OS.fs.stat('/Documents/Picker review/Created here')).kind;")=='directory';d.get_by_label('File name',exact=True).fill('result.txt');d.get_by_role('button',name='Save',exact=True).click();complete();assert js("return await OS.fs.text(await OS.fs.read('/Documents/Picker review/Created here/result.txt'));")=='Editor still receives real clicks'
            check('GNOME header action and nested New Folder commit actual files through the broker',newfolder)
            def overwrite():
                d=launch('save');d.get_by_label('File name',exact=True).fill('Brief.txt');d.get_by_role('button',name='Save',exact=True).click();nested=page.get_by_role('dialog',name='Replace existing file?',exact=True);nested.get_by_role('button',name='Cancel',exact=True).click();assert d.is_visible();assert js("return await OS.fs.text(await OS.fs.read('/Documents/Picker review/Brief.txt'));")=='Aster design review — żółć 日本語';d.get_by_role('button',name='Save',exact=True).click();page.get_by_role('dialog',name='Replace existing file?',exact=True).get_by_role('button',name='Replace',exact=True).click();complete();assert js("return (await OS.history.list('/Documents/Picker review/Brief.txt')).length;")>0
            check('Overwrite Cancel keeps original bytes, while Replace records the previous version',overwrite)
            def folder_selected():
                d=launch('folder');row(d,'Projects').click();d.get_by_role('button',name='Select folder',exact=True).click();assert complete()['folder']=='Projects'
            check('Folder picker confirms a selected child rather than accidentally granting its parent',folder_selected)
            def typed_open():
                d=launch();d.get_by_label('File name',exact=True).fill('bytes.bin');d.get_by_label('File name',exact=True).press('Enter');r=complete();assert r['size']==4;assert frame.evaluate('async()=>[...new Uint8Array(await(await h.getFile()).arrayBuffer())]')==[0,255,4,8]
            check('Typed Open filename and Enter return the exact binary file',typed_open)
            def trap():
                d=launch('save');js('window.previouslyInert=document.querySelector("#desktop").inert;assert(previouslyInert);')
                # Cycle far enough to include both wraps without relying on DOM order.
                for key in ['Tab']*26+['Shift+Tab']*26:
                    page.keyboard.press(key);assert js('return document.querySelector(".io-picker").contains(document.activeElement);')
                page.keyboard.press('Escape');frame.wait_for_function('error?.name==="AbortError"');assert js('return !document.querySelector("#desktop").inert;')
            check('Tab and Shift+Tab trap focus and Escape restores desktop interactivity',trap)
            def mobile():
                for preset in ['windows-light','macos26-dark','ubuntu-light']:
                    js('await OS.themes.select(arg);',preset)
                    for width,height in [(390,844),(844,390)]:
                        page.set_viewport_size({'width':width,'height':height});d=launch('save');rect=d.bounding_box();assert rect['x']>=0 and rect['y']>=0 and rect['x']+rect['width']<=width+1 and rect['y']+rect['height']<=height+1
                        for control in [d.get_by_label('File name',exact=True),d.get_by_role('button',name='Save',exact=True),d.get_by_role('button',name='Cancel',exact=True)]:
                            r=control.bounding_box();assert r and r['y']>=0 and r['y']+r['height']<=height+1,(preset,r,height)
                        page.screenshot(path=str(out/f'{preset}-{width}x{height}.png'));close(d)
                page.set_viewport_size({'width':1440,'height':1000})
            check('Portrait and short landscape retain working filename and confirmation controls',mobile)
            def privacy():
                js("await OS.webIO.update('picker-review','write',false);");frame.wait_for_function('!AsterFiles.policy.write');d=launch();assert d.get_by_role('button',name='New folder',exact=True).is_disabled();close(d);js("await OS.webIO.update('picker-review','write',null);");frame.wait_for_function('AsterFiles.policy.write')
            check('Read-only integration disables creation without taking away file reading',privacy)
            def filtered_save():
                frame.evaluate("()=>{const b=document.createElement('button');b.id='filtered';b.textContent='Filtered Save';b.onclick=async()=>{result=null;error=null;try{h=await showSaveFilePicker({suggestedName:'document',excludeAcceptAllOption:true,types:[{description:'Text',accept:{'text/plain':['.txt']}}]});const s=await h.createWritable();await s.write('type filter');await s.close();result={name:h.name};}catch(e){error={name:e.name,message:e.message}}};document.body.append(b);}")
                frame.locator('#filtered').click();d=page.get_by_role('dialog',name='Save to Aster',exact=True);location(d,'/Documents/Picker review');assert not d.get_by_label('File types',exact=True).locator('option[value="all"]').count();d.get_by_role('button',name='Save',exact=True).click();assert complete()['name']=='document.txt'
            check('Required type filters remain enforced and extension completion writes the requested type',filtered_save)
            def cleanup():
                for _ in range(3):
                    d=launch();js("OS.webIO.revoke('picker-review');");frame.wait_for_function('error?.name==="AbortError"');assert not page.locator('.io-picker').count();assert js('return JSON.stringify(OS.filePicker.diagnostics);')=='{"open":false,"objectURLs":0,"subscriptions":0}'
            check('Repeated revocation releases picker listeners and does not reload the app',cleanup)
            def ranges():
                d=launch('multi');d.get_by_role('button',name='List view',exact=True).click();row(d,'Brief.txt').click();row(d,'Notes10.txt').click(modifiers=['Shift']);assert d.locator('.io-count').inner_text()=='5 selected';row(d,'Brief.txt').click(modifiers=['Control']);assert d.locator('.io-count').inner_text()=='4 selected';d.get_by_role('button',name='Open',exact=True).click();assert complete()['names']==['bytes.bin','document.txt','Notes2.txt','Notes10.txt']
            check('Pointer Shift ranges and Ctrl toggles return exactly the selected files',ranges)
            def failed_history():
                d=launch();location(d,'/Documents/Picker review/Projects');d.get_by_label('Aster folder',exact=True).fill('/Documents/App storage/another-app');d.get_by_role('button',name='Go',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent.includes("not a public file scope")');assert d.get_by_role('button',name='Open',exact=True).is_disabled();d.get_by_role('button',name='Back',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents/Picker review"');close(d)
            check('Failed and reserved paths do not enter history or become valid selections',failed_history)
            def preview_close():
                d=launch('multi');b=d.get_by_role('button',name='Preview pane',exact=True)
                if b.get_attribute('aria-pressed')!='true':b.click()
                js("window.originalPickerRead=OS.fs.read;window.previewHeld=false;window.previewGate=new Promise(r=>window.releasePreview=r);OS.fs.read=async function(path){if(path.endsWith('/Sketch.png')){previewHeld=true;await previewGate;}return originalPickerRead.call(this,path);};")
                try:
                    row(d,'Sketch.png').click();page.wait_for_function('previewHeld');close(d);js('releasePreview();await new Promise(r=>setTimeout(r,20));assert(!OS.filePicker.diagnostics.open);assert(!OS.filePicker.diagnostics.objectURLs);assert(!document.querySelector(".io-preview"));')
                finally:js('OS.fs.read=originalPickerRead;releasePreview();')
            check('A delayed real preview read cannot reattach content after cancellation',preview_close)
            def revoke_nested():
                d=launch('save');d.get_by_role('button',name='New folder',exact=True).click();prompt=page.get_by_role('dialog',name='New folder',exact=True);prompt.get_by_role('textbox').fill('Must never exist');js("OS.webIO.revoke('picker-review');");frame.wait_for_function('error?.name==="AbortError"');assert not page.locator('#dialog-layer .dialog').count();assert js("return !await OS.fs.stat('/Documents/Picker review/Must never exist');")
            check('Revoking a nested New Folder prompt releases both modals without writing',revoke_nested)
            def touch():
                js('await OS.themes.select("macos26-light");');d=launch();row(d,'bytes.bin').tap();d.get_by_role('button',name='Open',exact=True).tap();assert complete()['size']==4
            check('Touch selection and macOS sheet confirmation return the real file',touch)
            def setprefs():
                d=launch('multi');
                for label in ['Icon view','Preview pane','Show hidden files']:
                    b=d.get_by_role('button',name=label,exact=True)
                    if b.get_attribute('aria-pressed')!='true':b.click()
                d.get_by_role('button',name='Sort by Size',exact=True).click();js('await OS.filePicker.pending;');close(d)
            check('Display preferences save independently of grants and requested file filters',setprefs)
            if not args.inject:
                def persistence():
                    # registerCustom is an in-memory test descriptor, not an app installation.
                    # Re-register it after reload; do not reseed its stored file or preferences.
                    js('await OS.filePicker.pending;OS.cancelSessionSave();await OS.persistSessionNow();');page.reload();page.wait_for_function('Aster.booted&&Aster.filePicker');js('await OS.ready;assert(!OS.db.memory);assert(await OS.fs.stat("/Documents/Picker review/document.txt"));assert(OS.webIO.sessions.every(s=>s.grants===0));const v=await OS.db.get("file-picker-ui-v1");assert(v.view==="grid"&&v.preview&&v.hidden&&v.sort==="size");OS.registerCustom({id:"picker-review",title:"Design workspace",path:"/Documents/picker-review.html"});window.reviewWindow=OS.openApp("picker-review");assert(reviewWindow,"Reload fixture registration failed");await reviewWindow.ready;')
                    page.wait_for_function('Aster.webIO.sessions.some(s=>s.app==="picker-review"&&s.state==="connected")');f=page.locator('.app-frame').element_handle().content_frame();f.locator('#open').click();d=page.get_by_role('dialog',name='Open from Aster',exact=True);d.wait_for(state='visible');page.wait_for_function('document.querySelector(".io-picker")?.dataset.view==="grid"');assert d.get_by_role('button',name='Preview pane',exact=True).get_attribute('aria-pressed')=='true';d.get_by_role('button',name='Cancel',exact=True).click();f.wait_for_function('error?.name==="AbortError"')
                check('Full-page IndexedDB reload restores views without restoring expired permissions',persistence)
            if args.standalone:
                context.set_offline(True);page.reload();page.wait_for_function('Aster.booted&&Aster.filePicker');check('Standalone boots offline with persisted picker preferences',lambda:js('await OS.ready;assert(!OS.db.memory);assert((await OS.db.get("file-picker-ui-v1")).view==="grid");'))
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as e:report['status']='FAIL';report['error']=str(e);raise
        finally:(out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--engine',default='chromium');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
