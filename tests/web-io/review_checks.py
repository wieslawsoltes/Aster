"""Regression coverage for PR15 review findings and the consolidated Portal SDK.
Uses real broker operations, saved bytes and visible controls. Host-only authority
checks are labelled separately from native browser input and cross-origin tests.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
import threading, json

def run(page, ctx, js, picker, frame, done, check, args, root, origin):
    def request(body):
        frame.evaluate('body=>{window.reviewResult=null;window.reviewError=null;Promise.resolve().then(()=>Function("return (async()=>{"+body+"})()")()).then(v=>reviewResult=v,e=>reviewError={name:e.name,message:e.message});}',body)
    def settled():
        frame.wait_for_function('reviewResult!==null||reviewError!==null')
        return frame.evaluate('({result:reviewResult,error:reviewError})')
    def cleanup_ui():
        js('OS.closePanels();document.querySelector(".file-operation-panel header button")?.click();iow.minimized=false;iow.sync();iow.focus();')
    def root_grant():
        cleanup_ui();frame.locator('#folder').click();d=picker('Choose Aster folder','/');assert d.get_by_role('button',name='Select folder',exact=True).is_disabled()
        assert js("try{AsterIOModels.grantPath('/');return 'unsafe';}catch(e){return e.name;}")== 'NotAllowedError'
        assert d.is_visible();d.get_by_role('button',name='Cancel',exact=True).click();assert done()['error']['name']=='AbortError'
    check('Security: filesystem root is navigation-only and cannot be granted',root_grant)
    def folder_race():
        js("await OS.fs.mkdir('/Documents/IO/Folder race');");frame.locator('#folder').click();d=picker('Choose Aster folder','/Documents/IO/Folder race')
        js("await OS.fs.remove('/Documents/IO/Folder race',true);await OS.fs.write('/Documents/IO/Folder race','concurrent replacement');")
        d.get_by_role('button',name='Select folder',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent.includes("no longer a directory")');assert d.is_visible();d.get_by_role('button',name='Cancel',exact=True).click();assert done()['error']['name']=='AbortError'
    check('Security: directory replaced by a file cannot become a directory capability',folder_race)
    def grants():
        js("await OS.fs.mkdir('/Documents/IO/Many');await OS.db.batch(Array.from({length:2048},(_,i)=>({path:'/Documents/IO/Many/item-'+i+'.txt',kind:'file',content:'x',size:1,modified:Date.now(),mime:'text/plain'})));")
        frame.locator('#folder').click();d=picker('Choose Aster folder','/Documents/IO/Many');d.get_by_role('button',name='Select folder',exact=True).click();assert len(done()['result']['entries'])==2048
        before=js("return OS.webIO.sessions.find(s=>s.app==='io-fixture').grants;")
        v=frame.evaluate('async()=>{const a=await dir.getFileHandle("item-0.txt");let n=0;for await(const h of dir.values())n++;const b=await dir.getFileHandle("item-0.txt");return {n,same:a===b,identity:await a.isSameEntry(b)}}')
        assert v=={'n':2048,'same':True,'identity':True},v
        assert js("return OS.webIO.sessions.find(s=>s.app==='io-fixture').grants;")==before
        js("OS.webIO.revoke('io-fixture');")
    check('Security: 2048-entry directory refresh reuses handles without leaking grants',grants)
    def pending_save():
        request('window.pendingSave=await showSaveFilePicker({suggestedName:"pending.txt"});return true;')
        d=picker('Save to Aster');d.get_by_label('File name',exact=True).fill('pending-only.txt');d.get_by_role('button',name='Save',exact=True).click();assert settled()['result']
        js("assert(!await OS.fs.stat('/Documents/IO/pending-only.txt'));")
        assert frame.evaluate('async()=>{const s=await pendingSave.createWritable();await s.write("discarded");await s.abort();return (await pendingSave.getFile()).size;}')==0
        js("assert(!await OS.fs.stat('/Documents/IO/pending-only.txt'));await OS.fs.write('/Documents/IO/pending-only.txt','someone else');")
        v=frame.evaluate('async()=>{try{await pendingSave.createWritable();return "unsafe"}catch(e){return e.name}}');assert v=='InvalidModificationError',v
    check('Portal: save selection and aborted new writes do not create or replace files',pending_save)
    def exclusive():
        frame.locator('#folder').click();d=picker('Choose Aster folder');d.get_by_role('button',name='Select folder',exact=True).click();assert not done()['error']
        v=frame.evaluate('''async()=>{const f=await dir.getFileHandle('locks.bin',{create:true});const a=await f.createWritable({mode:'exclusive'});let denied;try{await f.createWritable();denied='unsafe'}catch(e){denied=e.name}await a.abort();const b=await f.createWritable();const writer=b.getWriter();await writer.write(new Uint8Array([0,255,81]));await writer.close();writer.releaseLock();const desc=AsterFiles.describeHandle(f);const restored=await AsterFiles.restoreHandle(desc);return {denied,same:await restored.isSameEntry(f),bytes:[...new Uint8Array(await(await f.getFile()).arrayBuffer())]}}''')
        assert v=={'denied':'NoModificationAllowedError','same':True,'bytes':[0,255,81]},v
    check('Portal: exclusive writers, standard stream writers and same-session handle restore',exclusive)
    def write_policy():
        js("await OS.webIO.update('io-fixture','write',false);");frame.wait_for_function('!AsterFiles.policy.write');frame.locator('#open').click();d=picker();d.locator('[data-io-path="/Documents/IO/b.bin"]').click();d.get_by_role('button',name='Open',exact=True).click();assert done()['result']['size']==4
        assert frame.evaluate('h.queryPermission({mode:"readwrite"})')=='denied'
        assert frame.evaluate('async()=>{try{await h.createWritable();return "unsafe"}catch(e){return e.name}}')=='NotAllowedError'
        assert page.locator('.io-picker').count()==0
        js("await OS.webIO.update('io-fixture','write',null);")
    check('Portal: independent write switch retains reads but denies mutation',write_policy)
    def private_paths():
        js("if(!await OS.fs.stat('/Documents/App storage'))await OS.fs.mkdir('/Documents/App storage');assert((await OS.fs.stat('/Documents/App storage')).kind==='directory');await OS.fs.mkdir('/Documents/App storage/foreign-app');await OS.fs.write('/Documents/App storage/foreign-app/private.txt','private');")
        frame.locator('#open').click();d=picker(folder='/Documents');assert not d.locator('[data-io-path="/Documents/App storage"]').count()
        d.get_by_label('Aster folder',exact=True).fill('/Documents/App storage/foreign-app');d.get_by_role('button',name='Go',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent.includes("not a public file scope")');d.get_by_role('button',name='Cancel',exact=True).click();assert done()['error']['name']=='AbortError'
        frame.locator('#folder').click();d=picker('Choose Aster folder','/Documents');d.get_by_role('button',name='Select folder',exact=True).click();assert not done()['error']
        v=frame.evaluate('async()=>{try{await dir.getDirectoryHandle("App storage");return "unsafe"}catch(e){return e.name}}');assert v=='NotAllowedError',v
        js("const files=await OS.webIO.filesFromPaths(['/Documents/App storage/foreign-app/private.txt']).then(()=>null,e=>e);assert(files?.name==='NotAllowedError');")
    check('Security: app-private roots are excluded from pickers, public handles and exports',private_paths)
    def navigation_races():
        cleanup_ui()
        # Delay genuine records rather than providing substituted file contents.
        js("window.realStat=OS.fs.stat;window.heldStat=false;window.onceStat=true;window.statGate=new Promise(r=>window.releaseStat=r);OS.fs.stat=async function(p){const result=await realStat.call(this,p);if(p==='/Documents'&&onceStat){onceStat=false;heldStat=true;await statGate;}return result;};")
        try:
            frame.locator('#open').click();d=page.get_by_role('dialog',name='Open from Aster',exact=True);d.wait_for();page.wait_for_function('heldStat')
            address=d.get_by_label('Aster folder',exact=True);address.fill('/Documents/IO')
            js('releaseStat();await new Promise(r=>setTimeout(r,0));')
            page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents"')
            assert address.input_value()=='/Documents/IO','A delayed initial lookup replaced newly typed text'
            d.get_by_role('button',name='Go',exact=True).click();page.wait_for_function('document.querySelector(".io-picker-status").textContent==="/Documents/IO"')
        finally:js('OS.fs.stat=realStat;releaseStat();')
        js("window.realList=OS.fs.list;window.heldList=false;window.onceList=true;window.listGate=new Promise(r=>window.releaseList=r);OS.fs.list=async function(p){const result=await realList.call(this,p);if(p==='/Documents/IO'&&onceList){onceList=false;heldList=true;await listGate;}return result;};")
        try:
            d.get_by_role('button',name='Go',exact=True).click();page.wait_for_function('heldList')
            address.fill('/Documents/App storage/foreign-app');d.get_by_role('button',name='Go',exact=True).click()
            page.wait_for_function('document.querySelector(".io-picker-status").textContent.includes("not a public file scope")')
            js('releaseList();await new Promise(r=>setTimeout(r,0));')
            assert 'not a public file scope' in d.locator('.io-picker-status').inner_text(),'An obsolete listing replaced the latest error'
            assert address.input_value()=='/Documents/App storage/foreign-app'
            d.get_by_role('button',name='Cancel',exact=True).click();assert done()['error']['name']=='AbortError'
        finally:js('OS.fs.list=realList;releaseList();')
    check('Picker navigation retains typed paths and rejects obsolete asynchronous listings',navigation_races)
    def storage_collision():
        js("await OS.webIO.update('io-collision-fixture','storage',true);await OS.fs.write('/Documents/App storage/io-collision-fixture','not a directory');window.collisionSession=OS.webIO.makeSession(iow,iow.body.querySelector('iframe'),'io-collision-fixture');window.storageCollision=OS.webIO.dispatch(collisionSession,'storage',{}).then(()=>null,e=>e.name);")
        d=page.get_by_role('dialog',name='Use Aster app storage?',exact=True);d.get_by_role('button',name='Use Aster storage',exact=True).click()
        assert js('return await storageCollision;')=='TypeMismatchError'
        js("assert(collisionSession.caps.size===0);assert(await OS.fs.text(await OS.fs.read('/Documents/App storage/io-collision-fixture'))==='not a directory');await OS.fs.remove('/Documents/App storage/io-collision-fixture',true);await OS.webIO.update('io-collision-fixture','storage',null);")
    check('Security: existing file at app-storage path is retained and never granted as a directory',storage_collision)
    def duplicate_drop():
        js("const dt=new DataTransfer();dt.items.add(new File(['first'],'same.txt'));dt.items.add(new File(['second'],'same.txt'));const rows=await OS.webIO.collectNative(dt);assert(rows[0].rootId!==rows[1].rootId);await OS.webIO.importNativeTree(Promise.resolve(rows),'/Pictures');assert(await OS.fs.text(await OS.fs.read('/Pictures/same.txt'))==='first');assert(await OS.fs.text(await OS.fs.read('/Pictures/same.txt (2)'))==='second');const records=[{relativePath:'Tree/a.txt',kind:'file',blob:new Blob(['a']),rootId:'first'},{relativePath:'Tree/a.txt',kind:'file',blob:new Blob(['b']),rootId:'second'}];await OS.webIO.importNativeTree(Promise.resolve(records),'/Pictures');assert(await OS.fs.text(await OS.fs.read('/Pictures/Tree/a.txt'))==='a');assert(await OS.fs.text(await OS.fs.read('/Pictures/Tree (2)/a.txt'))==='b');")
    check('Security: same-named native files and folder roots remain distinct in atomic imports',duplicate_drop)
    def revoke_import():
        js("window.importAllowed=true;window.revokedImport=OS.webIO.importFiles([{name:'revoked-drag.txt',blob:new Blob(['never write'])}],'/Pictures',()=>{if(!importAllowed)throw new DOMException('Revoked','NotAllowedError');}).then(()=>null,e=>e.name);importAllowed=false;")
        assert js('return await revokedImport;')=='NotAllowedError'
        js("assert(!await OS.fs.stat('/Pictures/revoked-drag.txt'));document.querySelector('.file-operation-panel header button')?.click();")
    check('Security: transfer authority is rechecked at the final Explorer transaction',revoke_import)
    def no_activation():
        # evaluate() installs a timer; the call itself runs six seconds later,
        # after genuine browser activation expires. No synthetic DOM gesture.
        frame.evaluate('window.noGesture=null;setTimeout(()=>showOpenFilePicker().then(()=>noGesture="unsafe",e=>noGesture=e.name),6200)')
        frame.wait_for_function('noGesture!==null',timeout=15000);assert frame.evaluate('noGesture')=='SecurityError';assert page.locator('.io-picker').count()==0
    check('Security: timer-driven picker without transient activation is rejected',no_activation)
    def same_readiness():
        assert frame.get_by_role('heading',name='File API conformance fixture').is_visible()
        assert frame.evaluate('document.title')=='File API conformance fixture'
    check('Regression: dragging a prepared link does not navigate away from its application',same_readiness)
    if not args.inject and not args.standalone:
        class Cooperative(SimpleHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):
                if self.path=='/cooperative':
                    source=(root/'tests/web-io/fixture.html').read_text()
                    source=source.replace('<script>', '<script>window.ASTER_FILE_HOST_ORIGINS='+json.dumps([origin])+';</script><script src="/sdk/aster-files.js"></script><script>',1)
                    body=source.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
                else:super().do_GET()
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(Cooperative,directory=str(root)));threading.Thread(target=server.serve_forever,daemon=True).start()
        def cooperative():
            url='http://127.0.0.1:'+str(server.server_port)+'/cooperative'
            js("window.coop=OS.openApp('browser',{url:arg});await coop.ready;",url)
            w=page.locator('.window[data-app="browser"]');w.get_by_role('button',name='Connect Aster files',exact=True).click()
            page.wait_for_function('Aster.webIO.sessions.some(s=>s.app.startsWith("site-")&&s.state==="connected")')
            f=w.locator('iframe').element_handle().content_frame();f.wait_for_function('AsterFiles?.connected');assert f.evaluate('(()=>{try{return !parent.Aster}catch(e){return e.name==="SecurityError"}})()')
            f.locator('#open').click();d=picker();d.locator('[data-io-path="/Documents/IO/b.bin"]').click();d.get_by_role('button',name='Open',exact=True).click();f.wait_for_function('result?.size===4')
            assert f.evaluate('async()=>AsterFiles===await AsterFileClient.connect()')
            js('await coop.close(true);iow.focus();');page.wait_for_function('!Aster.webIO.sessions.some(s=>s.app.startsWith("site-"))')
            return 'Different-origin HTTP document, exact host allowlist, unchanged opaque sandbox, one runtime'
        try:check('Cooperative SDK: an explicitly opted-in Orbit site gets a scoped file session',cooperative)
        finally:server.shutdown()
