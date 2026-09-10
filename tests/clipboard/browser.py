"""Clipboard and keyboard regression suite. Native clipboard is populated by an
independent page's real Copy shortcut, never a replacement clipboard object.
Injected mode runs production HTML but has memory-only storage. HTTP and file
modes additionally verify real IndexedDB reloads. PNG API checks require Chromium
with explicitly granted test permissions; no such claim is made for other engines.
"""
import argparse,json,threading,time,sys
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main(args):
    out=args.output or ROOT/'tests/clipboard/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    report={'nativeClipboard':'Independent source-page Copy and target Paste; no clipboard object replacement','engine':args.engine,'platform':sys.platform,'mode':'injected / memory-only' if args.inject else 'file / IndexedDB' if args.standalone else 'HTTP / IndexedDB','checks':[],'errors':[]}
    with sync_playwright() as pw:
        browser=getattr(pw,args.engine).launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox'] if args.engine=='chromium' and sys.platform!='darwin' else [])
        ctx=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
        page=ctx.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        source=ctx.new_page();source.set_content('<label>External text<textarea></textarea></label>')
        primary='Meta' if sys.platform=='darwin' else 'Control'
        end='Meta+ArrowRight' if sys.platform=='darwin' else 'End'
        def js(code,arg=None):return page.evaluate('async arg=>{const OS=Aster,C=OS.clipboardTools;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m)};'+code+'}',arg)
        def check(name,fn):
            report['currentCheck']=name;(out/'progress.json').write_text(json.dumps(report,indent=2));print('START',name,flush=True);start=time.monotonic()
            try:detail=fn();report['checks'].append({'name':name,'status':'PASS','detail':detail,'ms':round((time.monotonic()-start)*1000)});print('PASS',name,flush=True)
            except Exception as e:
                report['checks'].append({'name':name,'status':'FAIL','error':str(e)});(out/'results.json').write_text(json.dumps(report,indent=2));page.screenshot(path=str(out/'failure.png'));(out/'failure.html').write_text(page.content());raise
        def copy_external(text):
            source.bring_to_front();source.locator('textarea').fill(text);source.locator('textarea').click();source.keyboard.press(primary+'+a');source.keyboard.press(primary+'+c');page.bring_to_front()
        def clean():
            hide=page.get_by_role('button',name='Hide file operations',exact=True)
            if hide.count():hide.click()
            js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());')
        def launch(app='notepad',options=None):
            js('window.w=OS.launch(arg[0],arg[1]);await w.ready;assert(!w.body.querySelector(".app-error"),w.body.innerText);',[app,options or {}]);return page.locator('.window').last
        def editor():clean();launch();return page.get_by_role('textbox',name='Document editor')
        def utilities():js('window.tools=OS.showClipboardUtilities();await tools.ready;');return page.locator('.window[data-app="clipboard-tools"]')
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
            page.wait_for_function('window.Aster?.booted');page.locator('#boot').wait_for(state='detached');
            if args.standalone:ctx.set_offline(True)
            js('OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();');clean()
            check('Native clipboard is independent of opt-in history and auto profile',lambda:js('assert(!OS.settings.clipboardHistory);assert(OS.input.platform()===AsterInputModels.platform(navigator.userAgentData?.platform||navigator.platform));assert(OS.apps.has("clipboard-tools"));'))
            def native_text():
                e=editor();e.fill('Before AFTER');copy_external('native Ω 👩‍💻\nsecond line');e.click();e.evaluate('(el)=>el.setSelectionRange(7,12)');page.keyboard.press(primary+'+v');assert e.input_value()=='Before native Ω 👩‍💻\nsecond line';page.keyboard.press(primary+'+z');assert e.input_value()=='Before AFTER';assert not js('return C.model.entries.length;');assert not page.locator('.clipboard-flyout').count()
            check('Real external-page clipboard pastes exact Unicode and is natively undoable with history off',native_text)
            def mac_keys():
                e=editor();e.fill('keep document');js('await OS.input.configure({keyboardProfile:"macos"});');
                for theme in ['windows-light','macos26-light','ubuntu-light']:
                    js('await OS.themes.select(arg);',theme)
                    for key in ['v','a','z','c','x']:
                        assert e.evaluate('(el,key)=>{const e=new KeyboardEvent("keydown",{key,metaKey:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return !e.defaultPrevented;}',key)
                    assert not page.locator('.clipboard-flyout').count()
                js('await OS.input.configure({keyboardProfile:"auto"});')
            check('Command editing chords remain native in all visual desktop profiles',mac_keys)
            def input_methods():
                e=editor();e.fill('Polski');
                for flags in [{'key':'v','ctrlKey':True,'altKey':True,'modifierAltGraph':True},{'key':'Enter','isComposing':True},{'key':'Dead'},{'key':'v','ctrlKey':True,'altKey':True,'isComposing':True}]:
                    assert e.evaluate('(el,flags)=>{const e=new KeyboardEvent("keydown",{...flags,bubbles:true,cancelable:true});el.dispatchEvent(e);return !e.defaultPrevented;}',flags)
                assert e.input_value()=='Polski';assert not page.locator('.clipboard-flyout').count()
                clean();launch('terminal');js('const input=w.body.querySelector(".terminal-input");assert(input);input.value="echo composition";input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true}));assert(input.value==="echo composition");')
            check('AltGr and composition events do not launch utilities or execute terminal commands',input_methods)
            def history():
                e=editor();js('await OS.input.configure({clipboardHistory:true});');e.fill('History Ω');e.click();e.press(primary+'+a');e.press(primary+'+c');page.wait_for_function('CATCH=!!Aster.clipboardText.model.entries.find(e=>e.text==="History Ω")')
                e.fill('Destination: ');e.press(end);e.press('Control+Alt+v');d=page.get_by_role('dialog',name='Clipboard history');d.get_by_role('button',name='Pin item',exact=True).first.click();d.get_by_role('searchbox').fill('Ω');d.get_by_role('button',name='Paste History Ω',exact=True).click();assert e.input_value()=='Destination: History Ω';assert e.evaluate('el=>el===document.activeElement');e.press(primary+'+z');assert e.input_value()=='Destination: '
            check('History pin/filter/paste preserves the original selection and native undo',history)
            def private():
                js('window.privateBox=OS.el("div",{"data-private":"true"});privateBox.innerHTML="<input aria-label=Secret value=secret><div contenteditable=true>private span</div>";w.body.prepend(privateBox);window.count=C.model.entries.length;')
                q=page.get_by_role('textbox',name='Secret');q.click();q.press(primary+'+a');q.press(primary+'+c');js('assert(C.model.entries.length===count);assert(!C.target);privateBox.remove();')
                e=editor();js('window.sensitive=document.createElement("input");sensitive.type="password";sensitive.value="DO NOT RETAIN";document.body.append(sensitive);sensitive.focus();assert(!C.target);sensitive.remove();')
            check('Private containers and password fields are excluded and invalidate previous targets',private)
            def manual():
                e=editor();e.fill('insert HERE');copy_external('manual Ω');e.click();e.evaluate('e=>e.setSelectionRange(7,11)');e.press('Control+Alt+v');page.get_by_role('dialog',name='Clipboard history').get_by_role('button',name='Manual paste…').click();d=page.get_by_role('dialog',name='Paste from your clipboard');box=d.get_by_role('textbox',name='Paste text here');box.click();box.press(primary+'+v');assert box.input_value()=='manual Ω';d.get_by_role('button',name='Insert text',exact=True).click();assert e.input_value()=='insert manual Ω';js('OS.closePanels();')
            check('Manual paste uses the real OS clipboard and inserts into the original field',manual)
            def workbench():
                e=editor();copy_external('  Workbench Ω\ntext  ');u=utilities();t=u.get_by_role('textbox',name='Clipboard text');t.click();t.press(primary+'+v');assert t.input_value()=='  Workbench Ω\ntext  ';u.get_by_label('Text transformation').select_option('line');u.get_by_role('button',name='Transform text',exact=True).click();assert t.input_value()=='Workbench Ω text';u.get_by_role('button',name='Copy text',exact=True).click();page.wait_for_function('document.querySelector(".clipboard-status").textContent==="Text copied to your system clipboard."');source.bring_to_front();source.locator('textarea').fill('');source.locator('textarea').click();source.keyboard.press(primary+'+v');assert source.locator('textarea').input_value()=='Workbench Ω text';page.bring_to_front();page.screenshot(path=str(out/'workbench.png'))
            check('Workbench transforms actual native paste and copies real text back to an independent page',workbench)
            def previous_field():
                e=editor();e.fill('keep END');e.click();e.evaluate('e=>e.setSelectionRange(5,8)');u=utilities();t=u.get_by_role('textbox',name='Clipboard text');t.fill('utility replacement Ω');u.get_by_role('button',name='Paste into previous field',exact=True).click();page.wait_for_function('document.querySelector(".clipboard-status").textContent==="Text inserted into the original field."');assert e.input_value()=='keep utility replacement Ω';js('assert(OS.focused===w.id);')
            check('Editing the utility workbench preserves the original target and focuses its owning window on paste',previous_field)
            def stale():
                e=editor();e.fill('before');js('C.remember(w.editor);window.target=C.target;w.editor.value="new content";let failed=false;try{C.insert("wrong",target)}catch{failed=true}assert(failed);assert(w.editor.value==="new content");await w.close(true);assert(!C.valid(target));')
            check('Stale or disposed insertion targets reject rather than overwriting current work',stale)
            def rich():
                e=editor();js('window.rich=OS.el("div",{contenteditable:"true",role:"textbox","aria-label":"Rich editor",style:"min-height:100px;"});rich.innerHTML="<b>Keep</b> replace";w.body.prepend(rich);rich.focus();const range=document.createRange();range.selectNodeContents(rich);getSelection().removeAllRanges();getSelection().addRange(range);C.remember(rich);C.insert("<script>inert</script>");assert(rich.textContent==="<script>inert</script>");assert(!rich.querySelector("script"));const ev=new MouseEvent("contextmenu",{bubbles:true,cancelable:true});rich.dispatchEvent(ev);assert(!ev.defaultPrevented);')
            check('Rich-field utilities insert inert plain text and preserve the native context menu',rich)
            def settings():
                clean();launch('settings',{'section':'clipboard'});view=page.locator('.window[data-app="settings"]');view.get_by_label('Keyboard profile',exact=True).select_option('macos');view.get_by_label('Clipboard history shortcut',exact=True).select_option('Ctrl+Shift+H');page.wait_for_function('Aster.settings.clipboardShortcut==="Ctrl+Shift+H"');e=editor();e.press('Control+Shift+h');page.get_by_role('dialog',name='Clipboard history').wait_for();page.keyboard.press('Escape');js('await OS.input.configure({clipboardShortcut:"Ctrl+Alt+V",keyboardProfile:"auto"});')
            check('Keyboard configuration changes the actual shortcut without consuming ordinary paste',settings)
            def tabs():
                e=editor();js('await OS.input.configure({editorTabFocus:true});');e.fill('unchanged');e.press('Tab');assert e.input_value()=='unchanged';assert not e.evaluate('e=>document.activeElement===e');js('await OS.input.configure({editorTabFocus:false});');e.click();e.press(end);e.press('Tab');assert e.input_value()=='unchanged    '
            check('Tab focus-navigation preference is functional and reversible',tabs)
            def snippets():
                clean();u=utilities();u.get_by_role('tab',name='Snippets').click();u.get_by_role('button',name='Add snippet',exact=True).click();d=page.get_by_role('dialog',name='Add snippet');d.get_by_label('Snippet text').fill('New editable snippet');d.get_by_role('button',name='Save',exact=True).click();u.get_by_role('searchbox').fill('New editable');u.get_by_role('button',name='Edit',exact=True).click();d=page.get_by_role('dialog',name='Edit snippet');d.get_by_label('Snippet text').fill('New editable Ω');d.get_by_role('button',name='Save',exact=True).click();assert 'New editable Ω' in u.inner_text()
                u.get_by_role('button',name='Export snippets').click()
                with page.expect_download() as download:page.get_by_role('dialog',name='Export clipboard snippets?').get_by_role('button',name='Export',exact=True).click()
                file=out/'clipboard-export.json';download.value.save_as(file);data=json.loads(file.read_text());assert any(x['text']=='New editable Ω' for x in data['snippets']);assert data['format']=='aster.clipboard'
                with page.expect_file_chooser() as chooser:u.get_by_role('button',name='Import snippets').click()
                chooser.value.set_files({'name':'clipboard.json','mimeType':'application/json','buffer':json.dumps({'format':'aster.clipboard','version':1,'snippets':[{'text':'Imported snippet Ω','pinned':True}]}).encode()});page.get_by_role('dialog',name='Import clipboard snippets?').get_by_role('button',name='Import',exact=True).click();page.wait_for_function('Aster.clipboardText.model.entries.some(e=>e.text==="Imported snippet Ω"&&e.pinned)')
            check('Snippet editor and actual JSON import/export preserve Unicode and pin state',snippets)
            def files():
                clean();js('await OS.fs.write("/Documents/Clipboard test.txt","file bytes Ω","text/plain");await OS.fs.mkdir("/Documents/Clipboard target");');launch('files',{'path':'/Documents'});row=page.locator('.file-row[data-path="/Documents/Clipboard test.txt"]');row.click();row.press(primary+'+c');js('assert(OS.clipboard.paths[0]==="/Documents/Clipboard test.txt");await w.navigate("/Documents/Clipboard target");');page.wait_for_function('w.state.path==="/Documents/Clipboard target"');page.locator('.explorer-main').click();page.keyboard.press(primary+'+v');page.wait_for_function('Aster.fs.stat("/Documents/Clipboard target/Clipboard test.txt").then(Boolean)');js('assert(await OS.fs.text(await OS.fs.read("/Documents/Clipboard target/Clipboard test.txt"))==="file bytes Ω");');copy_external('external text is not an Aster file');page.locator('.explorer-main').click();page.keyboard.press(primary+'+v');js('assert(!(await OS.fs.list("/Documents/Clipboard target")).some(e=>e.path.endsWith("(1).txt")));')
            check('Native file copy/paste copies actual bytes and rejects a stale internal file clipboard',files)
            def paste_files():
                # Synthetic DataTransfer is deliberately labeled; tests the actual byte
                # importer, not native file-manager clipboard exposure on every OS.
                clean();launch('files',{'path':'/Downloads'});js('const data=new DataTransfer();data.items.add(new File(["pasted actual fixture bytes Ω"],"Pasted fixture.txt",{type:"text/plain"}));w.body.querySelector(".explorer-main").dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data}));');page.wait_for_function('Aster.fs.stat("/Downloads/Pasted fixture.txt").then(Boolean)');js('assert(await OS.fs.text(await OS.fs.read("/Downloads/Pasted fixture.txt"))==="pasted actual fixture bytes Ω");')
            check('Synthetic file-paste fixture commits the real supplied bytes into Files',paste_files)
            def terminal():
                clean();launch('terminal');t=page.locator('.terminal-input');copy_external('echo one\necho two');t.click();t.press(primary+'+v');d=page.get_by_role('dialog',name='Review terminal paste');d.get_by_role('button',name='Cancel',exact=True).click();assert t.input_value()=='';t.click();t.press(primary+'+v');page.get_by_role('dialog',name='Review terminal paste').get_by_role('button',name='Insert as one line').click();assert t.input_value()=='echo one echo two';t.press(primary+'+a');t.press(primary+'+c');assert t.input_value()=='echo one echo two'
            check('Multiline terminal paste requires review and selection-copy does not interrupt the command',terminal)
            def sdk():
                clean();html='<!doctype html><label>Guest draft<textarea></textarea></label><button id="read">Request clipboard</button><pre id="result"></pre><script>'+(ROOT/'sdk/aster-clipboard.js').read_text()+'</script><script>read.onclick=()=>AsterClipboard.readText().then(t=>result.textContent=t,e=>result.textContent=e.message)</script>'
                js('window.app=await OS.appLibrary.install({kind:"html",title:"Clipboard guest",description:"Isolated test fixture",category:"Productivity",icon:"code",color:"blue"},arg);',html);launch(js('return app.id;'));f=page.locator('.app-frame').element_handle().content_frame();f.wait_for_function('AsterClipboard.connected');copy_external('approved guest text Ω');f.get_by_label('Guest draft').click();f.get_by_label('Guest draft').press(primary+'+v');assert f.get_by_label('Guest draft').input_value()=='approved guest text Ω';f.get_by_role('button',name='Request clipboard').click();d=page.get_by_role('dialog',name='Share clipboard text with Clipboard guest?');d.get_by_label('Paste text to share').click();d.get_by_label('Paste text to share').press(primary+'+v');d.get_by_role('button',name='Share text').click();f.wait_for_function('result.textContent==="approved guest text Ω"');assert f.evaluate('(()=>{try{return !!parent.Aster}catch{return false}})()') is False
                js('await OS.input.configure({clipboardBridge:false});');f.wait_for_function('!AsterClipboard.connected');js('await OS.input.configure({clipboardBridge:true});');f.wait_for_function('AsterClipboard.connected');f.get_by_role('button',name='Request clipboard').click();page.get_by_role('dialog',name='Share clipboard text with Clipboard guest?').wait_for();js('await w.close(true);');page.get_by_role('dialog',name='Share clipboard text with Clipboard guest?').wait_for(state='detached')
            check('Opaque guest native paste works; scoped SDK shares only approved text and cancels on close',sdk)
            def off_and_lock():
                e=editor();js('await C.add("session secret");C.setCurrent({text:"preview secret",html:"",image:null,types:["text/plain"]});OS.lock();assert(!C.current);assert(!C.target);assert(C.model.entries.every(e=>e.pinned));');page.get_by_role('button',name='Resume your session').click();js('await OS.input.configure({clipboardHistory:false});await OS.featureFlush();assert(!C.model.entries.length);assert(!(await OS.db.get("clipboard-pins")).length);')
            check('Lock clears transient content and disabling history deletes stored pins',off_and_lock)
            def mobile():
                clean();u=utilities();page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390');u.get_by_role('textbox',name='Clipboard text').scroll_into_view_if_needed();assert u.get_by_role('textbox',name='Clipboard text').is_visible();page.screenshot(path=str(out/'mobile.png'));page.set_viewport_size({'width':1440,'height':1000})
            check('Clipboard utilities remain usable on a narrow touch-sized viewport',mobile)
            if not args.inject:
                def persistence():
                    clean();js('await OS.input.configure({clipboardHistory:true,clipboardPersistPins:true,keyboardProfile:"macos",clipboardLimit:50});const entry=await C.add("Persisted pinned Ω");C.model.pin(entry.id);await C.save();await C.add("Transient only");await OS.featureFlush();');page.reload();page.wait_for_function('window.Aster?.booted');page.locator('#boot').wait_for(state='detached');js('assert(OS.db.mode==="IndexedDB");assert(C.model.entries.some(e=>e.text==="Persisted pinned Ω"&&e.pinned));assert(!C.model.entries.some(e=>e.text==="Transient only"));assert(OS.input.platform()==="macos");assert(C.model.limit===50);await OS.input.configure({keyboardProfile:"auto"});')
                check('Real IndexedDB reload retains only pins and validated keyboard configuration',persistence)
            if not args.inject and not args.standalone and args.engine=='chromium':
                def png():
                    clean();ctx.grant_permissions(['clipboard-read','clipboard-write'],origin=origin);u=utilities()
                    js('const canvas=document.createElement("canvas");canvas.width=2;canvas.height=2;const g=canvas.getContext("2d");g.fillRect(0,0,2,2);const blob=await new Promise(r=>canvas.toBlob(r,"image/png"));await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);');u.get_by_role('button',name='Read system clipboard',exact=True).click();page.wait_for_function('!!Aster.clipboardTools.current?.image');assert u.get_by_alt_text('Clipboard PNG preview').is_visible();u.get_by_role('button',name='Save image to Pictures').click();page.wait_for_function('Aster.fs.stat("/Pictures/Clipboard.png").then(Boolean)');u.get_by_role('button',name='Copy PNG image').click();page.wait_for_function('document.querySelector(".clipboard-status").textContent==="PNG image copied."');assert js('const items=await navigator.clipboard.read();return items.some(i=>i.types.includes("image/png"));');js('const f=await OS.fs.read("/Pictures/Clipboard.png");assert(f.size>0&&f.mime==="image/png");')
                check('Permission-granted Chromium reads/writes a real PNG system clipboard item and saves exact image data',png)
            assert not report['errors'],report['errors'];report['status']='PASS'
        finally:
            (out/'results.json').write_text(json.dumps(report,indent=2));ctx.close();browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--engine',default='chromium');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
