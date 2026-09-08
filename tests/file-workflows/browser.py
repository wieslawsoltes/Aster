"""Actual Explorer actions and transactional operations; no application mocks.
The --inject fallback exercises memory storage only. CI tests normal HTTP and
standalone, including durable reloads. No native host-folder writes are tested.
"""
import argparse,json,threading,time
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main(args):
    out=args.output or ROOT/'tests/file-workflows/artifacts';out.mkdir(parents=True,exist_ok=True)
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}';report={'mode':'injected memory' if args.inject else 'standalone' if args.standalone else 'HTTP/IndexedDB','checks':[],'errors':[]}
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=args.browser or None,args=['--no-sandbox']);context=browser.new_context(viewport={'width':1440,'height':1000},service_workers='block');page=context.new_page();page.set_default_timeout(12000);page.on('pageerror',lambda e:report['errors'].append(str(e)))
        def js(body,arg=None):return page.evaluate('async arg=>{const OS=Aster;const assert=(v,m="Assertion failed")=>{if(!v)throw Error(m);};'+body+'}',arg)
        def clean():js('OS.closePanels();for(const w of [...OS.windows.values()])await w.close(true);document.querySelectorAll(".toast").forEach(e=>e.remove());document.querySelector(".file-operation-panel header button")?.click();')
        def launch(path):
            id=js('const w=OS.openApp("files",{path:arg});await w.ready;window.files=w;return w.id;',path)
            return page.locator(f'[data-window="{id}"]')
        def check(name,fn):
            t=time.perf_counter()
            try:result=fn();report['checks'].append({'name':name,'status':'PASS','detail':result,'ms':round((time.perf_counter()-t)*1000)});print('PASS',name,flush=True)
            except Exception as e:report['checks'].append({'name':name,'status':'FAIL','error':str(e)});page.screenshot(path=str(out/'failure.png'));raise
        try:
            if args.inject:page.set_content((ROOT/'Aster.html').read_text())
            else:page.goto((ROOT/'Aster.html').as_uri() if args.standalone else origin)
            page.wait_for_function('Aster.booted && Aster.fileOps');js('await OS.ready;OS.settings.restore=false;OS.settings.motion=false;OS.settings.dnd=true;OS.applySettings();');clean()
            js("await OS.fs.mkdir('/Documents/Operations');await OS.fs.mkdir('/Documents/Results');await OS.fs.write('/Documents/Operations/a.txt','source');await OS.fs.write('/Documents/Operations/b.txt','second');await OS.fs.write('/Documents/Results/a.txt','destination');")
            def conflict():
                clean();launch('/Documents/Operations');page.locator('.file-row[data-path="/Documents/Operations/a.txt"]').click();page.keyboard.press('Control+c');js("files.navigate('/Documents/Results');")
                page.locator('.file-row[data-path="/Documents/Results/a.txt"]').click();page.keyboard.press('Control+v');dialog=page.get_by_role('dialog',name='Replace or skip files');dialog.wait_for();dialog.get_by_label('Conflict action').select_option('replace');page.screenshot(path=str(out/'replace-or-skip.png'));dialog.get_by_role('button',name='Continue',exact=True).click();page.wait_for_function('Aster.fileOps.jobs.at(-1)?.status==="done"')
                js("assert(await OS.fs.text(await OS.fs.read('/Documents/Results/a.txt'))==='source');assert((await OS.history.list('/Documents/Results/a.txt')).length===1);")
                page.get_by_label('Undo file operation',exact=True).click();page.wait_for_function('Aster.fileOps.canRedo');js("assert(await OS.fs.text(await OS.fs.read('/Documents/Results/a.txt'))==='destination');")
                page.get_by_label('Redo file operation',exact=True).click();page.wait_for_function('Aster.fileOps.jobs.at(-1)?.status==="done"');js("assert(await OS.fs.text(await OS.fs.read('/Documents/Results/a.txt'))==='source');")
                return 'Clipboard copy, real Replace dialog, prior version, undo and redo'
            check('Explorer conflict choices preserve destination and integrate file history',conflict)
            def batch():
                clean();launch('/Documents/Operations');page.locator('.file-row').first.click();page.keyboard.press('Control+a');page.keyboard.press('F2');dialog=page.get_by_role('dialog',name='Rename 2 items');dialog.wait_for();dialog.get_by_label('Base name',exact=True).fill('Report');assert 'a.txt → Report (1).txt' in dialog.inner_text();page.screenshot(path=str(out/'batch-rename.png'));dialog.get_by_role('button',name='Rename',exact=True).click();page.wait_for_function('Aster.fileOps.jobs.at(-1)?.status==="done"');js("assert(await OS.fs.stat('/Documents/Operations/Report (1).txt'));assert(await OS.fs.stat('/Documents/Operations/Report (2).txt'));")
                page.locator('.explorer-main').focus();page.keyboard.press('Control+z');page.wait_for_function('Aster.fileOps.canRedo');js("assert(await OS.fs.stat('/Documents/Operations/a.txt'));assert(await OS.fs.stat('/Documents/Operations/b.txt'));")
                return 'Real multi-selection, F2, reviewed names, all-or-nothing rename, Ctrl+Z'
            check('Batch rename previews preserve extensions and keyboard undo restores names',batch)
            def drag():
                clean();js("await OS.fs.mkdir('/Documents/Operations/Target');");launch('/Documents/Operations');previous=js("return OS.fileOps.jobs.at(-1)?.id;");page.locator('[data-path="/Documents/Operations/b.txt"].file-row').drag_to(page.locator('[data-path="/Documents/Operations/Target"].file-row'));page.wait_for_function('(id)=>Aster.fileOps.jobs.at(-1)?.id!==id && Aster.fileOps.jobs.at(-1)?.status==="done"',arg=previous);js("assert(!await OS.fs.stat('/Documents/Operations/b.txt'));assert(await OS.fs.stat('/Documents/Operations/Target/b.txt'));await OS.fileOps.undo();")
                return 'Actual pointer drag moves within the virtual drive and is reversible'
            check('Explorer drag-and-drop moves files rather than silently copying them',drag)
            def trash():
                clean();launch('/Documents/Operations');page.locator('[data-path="/Documents/Operations/a.txt"].file-row').click();previous=js("return OS.fileOps.jobs.at(-1)?.id;");page.keyboard.press('Delete');page.wait_for_function('(id)=>Aster.fileOps.jobs.at(-1)?.id!==id && Aster.fileOps.jobs.at(-1)?.status==="done"',arg=previous);js("assert(!await OS.fs.stat('/Documents/Operations/a.txt'));assert((await OS.fs.list('/.Trash')).some(e=>e.originalPath==='/Documents/Operations/a.txt'));await OS.fileOps.undo();assert(await OS.fs.stat('/Documents/Operations/a.txt'));")
            check('Delete and undo retain the actual Recycle Bin subtree',trash)
            def create():
                clean();launch('/Documents/Operations');page.get_by_role('button',name='New',exact=True).click();page.get_by_role('menuitem',name='Folder',exact=True).click();d=page.get_by_role('dialog',name='New folder',exact=True);d.get_by_role('textbox').fill('Created in Explorer');previous=js("return OS.fileOps.jobs.at(-1)?.id;");d.get_by_role('button',name='Save',exact=True).click();page.wait_for_function('(id)=>Aster.fileOps.jobs.at(-1)?.id!==id && Aster.fileOps.jobs.at(-1)?.status==="done"',arg=previous);js("assert(await OS.fs.stat('/Documents/Operations/Created in Explorer'));await OS.fileOps.undo();assert(!await OS.fs.stat('/Documents/Operations/Created in Explorer'));")
            check('Explorer New folder participates in the same undo journal',create)
            def pause():
                clean();js("window.job=OS.fileOps.execute({kind:'copy',paths:['/Documents/Operations/Target'],destination:'/Pictures'});OS.fileOps.pause(job.jobId);")
                page.wait_for_function('Aster.fileOps.jobs.at(-1)?.status==="paused"');page.get_by_role('dialog',name='File operations').get_by_role('button',name='Cancel',exact=True).click();page.wait_for_function('Aster.fileOps.jobs.at(-1)?.status==="cancelled"');js("assert((await job).cancelled);assert(!await OS.fs.stat('/Pictures/Target'));")
                return 'Cancellation before commit leaves destination absent'
            check('Paused operations can be cancelled without partial files or utility windows',pause)
            def stale():
                clean();js("await OS.fileOps.execute({kind:'copy',paths:['/Documents/Operations/a.txt'],destination:'/Pictures'},{show:false});await OS.fs.write('/Pictures/a.txt','newest');try{await OS.fileOps.undo();throw Error('Unsafe undo succeeded');}catch(e){assert(e.message.includes('newer work'));}assert(await OS.fs.text(await OS.fs.read('/Pictures/a.txt'))==='newest');")
                return 'Revision stamps prevent undo from overwriting newer edits'
            check('Undo is rejected after newer work, even for equal-length replacements',stale)
            def collision():
                clean();js("window.pending=OS.fileOps.execute({kind:'copy',paths:['/Documents/Operations/a.txt','/Documents/Operations/b.txt'],destination:'/Documents/Results'}).catch(e=>({error:e.message}));")
                dialog=page.get_by_role('dialog',name='Replace or skip files');dialog.wait_for();js("await OS.fs.write('/Documents/Results/a.txt','concurrent');");dialog.get_by_label('Conflict action').select_option('replace');dialog.get_by_role('button',name='Continue',exact=True).click();page.wait_for_function('Aster.fileOps.jobs.at(-1)?.status==="error"');js("assert((await pending).error.includes('Files changed'));assert(!await OS.fs.stat('/Documents/Results/b.txt'));assert(await OS.fs.text(await OS.fs.read('/Documents/Results/a.txt'))==='concurrent');")
                return 'One changed conflict target aborts the entire two-file transaction'
            check('Concurrent edit during a conflict dialog rolls back the whole operation',collision)
            def imported():
                clean();js("const data=new Blob([new Uint8Array([0,255,128,1])],{type:'application/octet-stream'});await OS.fileOps.execute({kind:'import',destination:'/Documents/Results',files:[{name:'bytes.bin',content:data,mime:data.type}]},{show:false});assert(JSON.stringify([...new Uint8Array(await(await OS.fs.blob(await OS.fs.read('/Documents/Results/bytes.bin'))).arrayBuffer())])==='[0,255,128,1]');await OS.fileOps.undo();assert(!await OS.fs.stat('/Documents/Results/bytes.bin'));await OS.fileOps.redo();")
            check('Binary imports and their undo/redo retain exact bytes',imported)
            def mobile():
                clean();page.set_viewport_size({'width':390,'height':844});page.wait_for_function('innerWidth===390');js('OS.fileOps.show();');r=page.get_by_role('dialog',name='File operations').bounding_box();assert r['x']>=0 and r['x']+r['width']<=391;page.screenshot(path=str(out/'operations-mobile.png'));page.set_viewport_size({'width':1440,'height':1000})
            check('File operation surface fits narrow screens',mobile)
            if not args.inject:
                def persist():
                    clean();js('OS.cancelSessionSave();await OS.persistSessionNow();');page.reload();page.wait_for_function('Aster.booted && Aster.fileOps');js("await OS.ready;assert(!OS.db.memory);assert(await OS.fs.text(await OS.fs.read('/Documents/Results/a.txt'))==='concurrent');assert((await OS.history.list('/Documents/Results/a.txt')).length>0);assert(!OS.fileOps.canUndo&&!OS.fileOps.canRedo);assert((await OS.fs.read('/Documents/Results/bytes.bin')).size===4);")
                    return 'Files/history survive full reload; undo snapshots intentionally do not'
                check('Durable file transactions persist through a complete page reload',persist)
            assert not report['errors'],report['errors'];report['status']='PASS'
        except Exception as e:report['status']='FAIL';report['error']=str(e);raise
        finally:(out/'results.json').write_text(json.dumps(report,indent=2));browser.close();server.shutdown()
if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--inject',action='store_true');ap.add_argument('--standalone',action='store_true');ap.add_argument('--browser');ap.add_argument('--output',type=Path);main(ap.parse_args())
