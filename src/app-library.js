/* Persistent, local-only app management. One registry and broker; no second runtime. MIT. */
'use strict';
(() => {
    const OS = Aster, M = AsterAppLibraryModels;
    let queue = Promise.resolve();
    const enqueue = task => { const work = queue.catch(()=>{}).then(task); queue = work; return work; };
    const clone = value => structuredClone(value);
    const conflict = () => { throw Error('The app library or source changed elsewhere. Preserve your drafts, reload the older tab, and try again.'); };
    const stamp = value => value == null ? '' : JSON.stringify(value);
    const fileStamp = value => value ? [value.path,value.kind,value.modified,value.size,value.mime,value.revision].join('|') : '';
    const lib = OS.appLibrary = {
        get records() { return clone(OS.customApps); },
        rejected: [],
        get(id) { return OS.customApps.find(a=>a.id===id); },
        async initialize() {
            const parsed = M.records(await OS.db.get('customApps'));
            this.rejected = parsed.rejected; OS.customApps = parsed.apps;
            for (const r of OS.customApps) OS.registerCustom(r);
        },
        // The file package and launcher metadata commit together. A second tab is
        // compared inside the transaction, not before it. Failed writes publish nothing.
        async transaction(expected, next, puts = [], checks = []) {
            const apply = (stored, files, write) => {
                if (stamp(stored) !== stamp(expected)) conflict();
                for (const [path,previous] of checks) if (fileStamp(files.get(path)) !== fileStamp(previous)) conflict();
                for (const row of puts) write('files',row,row.path);
                write('meta',clone(next),'customApps');
            };
            if (OS.db.memory) {
                apply(OS.db.memory.meta.get('customApps'),OS.db.memory.files,(store,value,key)=>OS.db.memory[store].set(key,clone(value)));
            } else {
                await new Promise((resolve,reject)=>{
                    const tx=OS.db.db.transaction(['files','meta'],'readwrite'), files=tx.objectStore('files'),meta=tx.objectStore('meta');
                    let error, remaining=checks.length+1, stored; const rows=new Map();
                    const ready=()=>{ if (--remaining) return; try { apply(stored,rows,(store,value,key)=>store==='files'?files.put(value):meta.put(value,key)); } catch(e) { error=e;tx.abort(); } };
                    const q=meta.get('customApps');q.onsuccess=()=>{stored=q.result;ready();};
                    for (const [path] of checks) { const q=files.get(path);q.onsuccess=()=>{rows.set(path,q.result);ready();}; }
                    tx.oncomplete=resolve;tx.onerror=()=>reject(error||tx.error||Error('App library save failed.'));tx.onabort=()=>reject(error||tx.error||Error('App library save cancelled.'));
                });
            }
            const oldIds = new Set(OS.customApps.map(a=>a.id)); OS.customApps = clone(next);
            for (const r of OS.customApps) { oldIds.delete(r.id);OS.registerCustom(r); }
            for (const id of oldIds) { OS.webIO?.revoke(id);OS.apps.delete(id); }
            OS.emit('apps'); OS.emit('app-library'); if (puts.length) OS.emit('fs-change',{path:'/Projects/Installed apps'});
        },
        async snapshot() { const stored=await OS.db.get('customApps'); if (stamp(M.records(stored).apps)!==stamp(OS.customApps)) conflict(); return stored; },
        save(record, expectedRevision) { return enqueue(async()=>{
            const old=this.get(record.id); if (old && expectedRevision !== old.revision) conflict();
            if (!old && OS.customApps.length>=M.LIMITS.apps) throw Error('The local library is limited to 128 installed apps.');
            const r=M.normalize({...record,installedAt:old?.installedAt||Date.now(),updatedAt:Date.now(),revision:(old?.revision||0)+1});
            // Metadata edits cannot replace the source or switch the sandbox type.
            if (old && (r.kind!==old.kind || r.kind==='html' && r.path!==old.path)) throw Error('Use Replace HTML to update an installed package.');
            const stored=await this.snapshot();
            if (r.kind==='html' && (await OS.fs.stat(r.path))?.kind!=='file') throw Error('The HTML source is missing. Restore it or replace the package.');
            const next=OS.customApps.filter(a=>a.id!==r.id);next.push(r);await this.transaction(stored,next);
            return clone(r);
        }); },
        install(details, source = null) { return enqueue(async()=>{
            if (OS.customApps.length>=M.LIMITS.apps) throw Error('The local library is limited to 128 installed apps.');
            const id='custom-'+OS.uid(), now=Date.now(), folder='/Projects/Installed apps';
            const r=M.normalize({...details,id,path:folder+'/'+id+'.html',installedAt:now,updatedAt:now,revision:1});
            const stored=await this.snapshot(), puts=[], checks=[];
            if (r.kind==='html') {
                if (typeof source!=='string'||new Blob([source]).size>M.LIMITS.html) throw Error('HTML app packages are limited to 5 MiB.');
                for (const p of ['/Projects',folder]) { const old=await OS.db.file(p);if(old&&old.kind!=='directory')throw Error('The installation folder was replaced by a file.');checks.push([p,old]);if(!old)puts.push({path:p,kind:'directory',modified:now}); }
                const old=await OS.db.file(r.path);if(old)conflict();checks.push([r.path,old]);
                puts.push({path:r.path,kind:'file',mime:'text/html',content:source,size:new Blob([source]).size,modified:now});
            }
            await this.transaction(stored,[...OS.customApps,r],puts,checks);return clone(r);
        }); },
        replace(id, source, expectedRevision) { return enqueue(async()=>{
            const old=this.get(id);if(!old||old.revision!==expectedRevision)conflict();if(old.kind!=='html')throw Error('Only HTML apps have a local package.');
            if(typeof source!=='string'||new Blob([source]).size>M.LIMITS.html)throw Error('HTML apps are limited to 5 MiB.');
            const stored=await this.snapshot(), folder='/Projects/Installed apps', now=Date.now(), path=folder+'/'+id+'-'+OS.uid()+'.html';
            const dir=await OS.db.file(folder);if(dir&&dir.kind!=='directory')throw Error('The installation folder is not a directory.');
            const existing=await OS.db.file(path);if(existing)conflict();
            const r=M.normalize({...old,path,updatedAt:now,revision:old.revision+1});
            await this.transaction(stored,OS.customApps.map(a=>a.id===id?r:a),[...(!dir?[{path:folder,kind:'directory',modified:now}]:[]),{path,kind:'file',mime:'text/html',content:source,size:new Blob([source]).size,modified:now}],[[folder,dir],[path,existing]]);
            return {record:clone(r),previousPath:old.path};
        }); },
        remove(id, expectedRevision) { return enqueue(async()=>{
            const old=this.get(id);if(!old||old.revision!==expectedRevision)conflict();
            if([...OS.windows.values()].some(w=>w.appId===id&&!w.closed))throw Error('Close the app windows before removing its launcher.');
            const stored=await this.snapshot();await this.transaction(stored,OS.customApps.filter(a=>a.id!==id));
            // Hide stale pins immediately. Other shell writers keep their existing queues.
            if(OS.pins?.includes(id))await OS.togglePin(id);
            if(OS.startPins?.includes(id))await OS.toggleStartPin(id);
            OS.emit('apps');return true;
        }); },
        async restore(records) {
            for (const r of M.records(records).apps) {
                if (r.kind==='html' && (await OS.fs.stat(r.path))?.kind!=='file')continue;
                const old=this.get(r.id); // Preserve validated metadata; never run an import.
                if(old && (old.kind!==r.kind||old.path!==r.path))continue;
                await this.save(r,old?.revision);
            }
        },
        async export(id) {
            const r=this.get(id);if(!r)throw Error('App not installed.');
            const source=r.kind==='html'?await OS.fs.text(await OS.fs.read(r.path)):null;
            OS.download(new Blob([JSON.stringify(M.packageData(r,source),null,2)],{type:'application/json'}),r.title.replace(/[\\/:*?"<>|]/g,'_')+'.asterapp');
        }
    };
    OS.registerCustom = value => {
        const r=M.normalize(value,false), existing=OS.apps.get(r.id);
        if(existing&&!existing.custom)throw Error('An installed app cannot replace a built-in or catalog app.');
        OS.register(r.id,{title:r.title,description:r.description,category:r.category,icon:r.icon,color:r.color,custom:true,width:850,height:610,
            keywords:[r.title,r.description,r.category,r.publisher,r.version].join(' '),mount:async w=>{
                const current=lib.get(r.id)||r;
                let alive=true;w.addCleanup(()=>{alive=false;});
                w.installedRevision=current.revision;w.installedSource=current.path||current.url;
                w.beforeClose=()=>OS.confirm('Close '+w.title+'?','Save your work inside the app first. Aster cannot inspect unsaved content in a sandboxed app.','Close app');
                if(current.kind!=='html') {
                    await OS.orbit.initialize();if(!alive||w.closed)return;
                    const address=M.url(current.url),controls=OS.el('div',{class:'app-link-notice'}),container=OS.el('div',{class:'installed-webview'});
                    controls.append(OS.el('span',{text:'Saved website · opening preference does not change sandbox permissions.'}),
                        OS.el('button',{class:'secondary',text:'Open in Orbit',onclick:OS.guard(()=>OS.openURL(address))}));
                    w.body.append(controls,container);
                    // A saved link is never promoted to a trusted catalog application.
                    const view=OS.webviews.create(container,{owner:w,appId:r.id,isolated:true});
                    controls.append(OS.el('button',{class:'secondary',text:'Reload website',onclick:OS.guard(()=>view.reload())}));
                    w.webview=view;await view.navigate(address,{mode:'auto',initial:true});return;
                }
                const frame=OS.el('iframe',{class:'app-frame',sandbox:'allow-scripts allow-forms allow-modals allow-downloads',title:current.title,referrerpolicy:'no-referrer'});
                if(current.kind==='html') {
                    const f=await OS.fs.read(current.path),html=await OS.fs.text(f);if(!alive||w.closed)return;
                    if(new Blob([html]).size>M.LIMITS.html)throw Error('Installed HTML exceeds the 5 MiB package limit.');
                    OS.clipboardTools.attachFrame(frame,w);frame.srcdoc=OS.webIO?OS.webIO.bootstrap(html):html;w.body.append(frame);OS.webIO?.attach(w,frame,r.id,'about:srcdoc',true);
                }
                w.addCleanup(()=>{frame.remove();frame.srcdoc='';frame.src='about:blank';});
            }});
        // Editing metadata never remounts a document or changes its stored window state.
        for(const w of OS.windows.values())if(w.appId===r.id&&!w.closed){w.setTitle(r.title);const f=w.body.querySelector('.app-frame');if(f)f.title=r.title;}
        OS.refreshIconArtwork?.(r.id);
        return r;
    };
})();
