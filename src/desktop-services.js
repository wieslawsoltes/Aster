/* Persistent services for Aster's Windows-inspired desktop essentials. MIT. */
'use strict';
(() => {
    const OS=Aster, M=AsterDesktopModels;
    Object.assign(OS.settings,{clipboardHistory:false,historyEnabled:true,colorFilter:'none',largePointer:false,readingGuide:false});
    const queues=new Map();
    OS.featureSave=(key,value)=>{
        const snapshot=structuredClone(value),job=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(()=>OS.db.set(key,snapshot));
        queues.set(key,job);job.finally(()=>{if(queues.get(key)===job)queues.delete(key);}).catch(()=>{});return job;
    };
    OS.featureFlush=()=>Promise.all([...queues.values()]);
    OS.featureChange=(name)=>OS.emit('feature-change',{name});
    OS.db.writeVersioned=function(entry){
        const perform=(old,index,putHistory,deleteHistory,commit)=>{
            if(old?.kind==='directory')throw Error('Cannot replace a folder with a file.');
            let next=Array.isArray(index)?index:[];
            if(OS.settings.historyEnabled && old?.kind==='file' && !entry.path.startsWith('/.') && old.size<=8*1024*1024 && !(typeof entry.content==='string'&&entry.content===old.content)){
                const row={id:OS.uid(),path:old.path,size:old.size||0,mime:old.mime||'',time:Date.now(),modified:old.modified};
                const pruned=M.pruneHistory(next,row);next=pruned.rows;
                putHistory({...row,content:old.content});for(const r of pruned.removed)deleteHistory(r.id);
            }
            commit(next);
        };
        if(this.memory){
            this.memory.history ||= new Map();
            perform(this.memory.files.get(entry.path),this.memory.meta.get('history-index')||[],row=>this.memory.history.set(row.id,row),id=>this.memory.history.delete(id),index=>{this.memory.files.set(entry.path,structuredClone(entry));this.memory.meta.set('history-index',index);});
            return Promise.resolve();
        }
        return new Promise((resolve,reject)=>{
            const tx=this.db.transaction(['files','meta','history'],'readwrite'),files=tx.objectStore('files'),meta=tx.objectStore('meta'),history=tx.objectStore('history');
            const read=files.get(entry.path),idx=meta.get('history-index');let pending=2;
            const ready=()=>{if(--pending)return;try{perform(read.result,idx.result||[],row=>history.put(row),id=>history.delete(id),index=>{files.put(entry);meta.put(index,'history-index');});}catch(e){tx.abort();reject(e);}};
            read.onsuccess=idx.onsuccess=ready;tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('File save aborted; original file unchanged.'));
        });
    };
    // Read-check-write operations share one transaction across tabs. Never overwrite
    // a concurrently created ZIP target, or delete trash after it was restored.
    OS.db.mutateFiles=function(operation){
        const apply=(entries,put,remove)=>{const change=operation(entries);for(const path of change.deletes||[])remove(path);for(const entry of change.puts||[])put(entry);return change.result;};
        if(this.memory){const entries=[...this.memory.files.values()],change=operation(entries);for(const entry of change.puts||[])if(this.memory.files.has(entry.path))return Promise.reject(Error('Destination already exists.'));for(const path of change.deletes||[])this.memory.files.delete(path);for(const entry of change.puts||[])this.memory.files.set(entry.path,structuredClone(entry));return Promise.resolve(change.result);}
        return new Promise((resolve,reject)=>{const tx=this.db.transaction('files','readwrite'),store=tx.objectStore('files'),request=store.getAll();let result;
            request.onsuccess=()=>{try{result=apply(request.result,entry=>store.add(entry),path=>store.delete(path));}catch(error){tx.abort();reject(error);}};
            tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('File operation aborted; existing files unchanged.'));
        });
    };
    OS.history={
        async list(path){const rows=await OS.db.get('history-index')||[];return rows.filter(e=>!path||e.path===path).reverse().sort((a,b)=>b.time-a.time);},
        get(id){return OS.db.request('history','readonly',(s,m)=>s?s.get(id):m.get(id));},
        async restore(id,copy=false){
            const row=await this.get(id);if(!row)throw Error('This version is no longer retained.');
            const parent=OS.fs.parent(row.path);let path=row.path;
            if(!await OS.fs.stat(parent)){path=OS.fs.join('/Documents',OS.fs.name(path));copy=true;}
            if(copy)path=await OS.fs.unique(path);
            await OS.fs.write(path,row.content,row.mime);OS.featureChange('history');return path;
        },
        async clear(){
            if(OS.db.memory){OS.db.memory.history.clear();OS.db.memory.meta.set('history-index',[]);}
            else await new Promise((resolve,reject)=>{const tx=OS.db.db.transaction(['history','meta'],'readwrite');tx.objectStore('history').clear();tx.objectStore('meta').put([],'history-index');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('History cleanup aborted'));});
            OS.featureChange('history');
        }
    };
    OS.storageSense={
        policy:{enabled:false,days:30,lastRun:0},
        async scan(){
            const entries=await OS.db.all(),history=await OS.history.list(),groups=new Map();
            for(const e of entries)if(e.kind==='file'){const group=e.path.startsWith('/.Trash/')?'Recycle Bin':e.path.split('/')[1]||'Other';groups.set(group,(groups.get(group)||0)+(e.size||0));}
            let estimate={};try{estimate=await navigator.storage?.estimate?.()||{};}catch{}
            return {entries,groups:[...groups].sort((a,b)=>b[1]-a[1]),bytes:entries.reduce((n,e)=>n+(e.size||0),0),historyBytes:history.reduce((n,e)=>n+e.size,0),estimate};
        },
        eligible(entries,days=this.policy.days,now=Date.now()){
            const cutoff=now-M.clamp(days,1,365,30)*86400000;
            return entries.filter(e=>OS.fs.parent(e.path)==='/.Trash'&&e.originalPath&&Number.isFinite(e.deletedAt)&&e.deletedAt<=cutoff);
        },
        async clean(days=this.policy.days,approved=null){
            const result=await OS.db.mutateFiles(entries=>{
                const eligible=this.eligible(entries,days),roots=approved?eligible.filter(e=>approved.some(a=>a.path===e.path&&a.deletedAt===e.deletedAt)):eligible;
                const removed=entries.filter(e=>roots.some(r=>e.path===r.path||e.path.startsWith(r.path+'/')));
                return {deletes:removed.map(e=>e.path),result:{items:roots.length,bytes:removed.reduce((n,e)=>n+(e.size||0),0)}};
            });
            this.policy.lastRun=Date.now();await OS.featureSave('storage-sense',this.policy);
            OS.emit('fs-change',{path:'/.Trash'});OS.featureChange('storage');return result;
        }
    };
    OS.archives={
        async create(paths,destination){
            if(!Array.isArray(paths)||!paths.length)throw Error('Select files or folders first.');
            const roots=[...new Set(paths.map(p=>OS.fs.normalize(p)))].filter(p=>!paths.some(q=>q!==p&&p.startsWith(q+'/')));
            if(roots.some(p=>p.startsWith('/Local')||p.startsWith('/.')||p==='/'))throw Error('ZIP creation uses your virtual files. Import local files first.');
            const all=await OS.db.all(),entries=[];let size=0;
            for(const root of roots){const rows=all.filter(e=>e.path===root||e.path.startsWith(root+'/'));if(!rows.length)throw Error('A selected file was removed.');
                for(const row of rows){size+=row.size||0;if(size>AsterZIP.LIMIT)throw Error('Archive input exceeds 64 MiB.');const name=row.path.slice(OS.fs.parent(root).length+(OS.fs.parent(root)==='/'?0:1))+(row.kind==='directory'?'/':'');
                    if(entries.length>=AsterZIP.MAX_ENTRIES)throw Error('Archive entry limit exceeded (1024).');
                    entries.push({name,bytes:row.kind==='directory'?new Uint8Array():new Uint8Array(await(await OS.fs.blob(row)).arrayBuffer())});}}
            destination=OS.fs.normalize(destination);if(destination.startsWith('/Local')||destination.startsWith('/.'))throw Error('Choose a virtual folder for the archive.');
            if(await OS.fs.stat(destination))throw Error('The archive already exists; choose a different name.');
            const blob=await AsterZIP.run('pack',entries);
            await OS.db.mutateFiles(all=>{if(!all.some(e=>e.path===OS.fs.parent(destination)&&e.kind==='directory')&&OS.fs.parent(destination)!=='/')throw Error('Destination folder was removed.');return {puts:[{path:destination,kind:'file',content:blob,mime:'application/zip',size:blob.size,modified:Date.now()}]};});OS.emit('fs-change',{path:destination});return destination;
        },
        async extract(path,parent){
            parent=OS.fs.normalize(parent);if(parent.startsWith('/Local')||parent.startsWith('/.')||(await OS.fs.stat(parent))?.kind!=='directory')throw Error('Choose an existing virtual destination folder.');
            const file=await OS.fs.read(path);if(file.size>AsterZIP.LIMIT+1024*1024)throw Error('ZIP file is too large.');
            const entries=await AsterZIP.run('unpack',await(await OS.fs.blob(file)).arrayBuffer());
            const root=await OS.fs.unique(OS.fs.join(parent,OS.fs.name(path).replace(/\.zip$/i,'')+' extracted')),puts=new Map([[root,{path:root,kind:'directory',modified:Date.now()}]]);
            for(const e of entries){const directory=e.name.endsWith('/'),dest=root+'/'+e.name.replace(/\/$/,''),parts=dest.split('/');parts.pop();
                while(parts.join('/').startsWith(root)){const p=parts.join('/');if(!puts.has(p))puts.set(p,{path:p,kind:'directory',modified:Date.now()});parts.pop();}
                puts.set(dest,directory?{path:dest,kind:'directory',modified:Date.now()}:{path:dest,kind:'file',content:new Blob([e.bytes],{type:OS.fs.mime(dest)}),mime:OS.fs.mime(dest),size:e.bytes.length,modified:Date.now()});}
            // New subtree only: a malformed archive never partially replaces user files.
            if(await OS.fs.stat(root))throw Error('Destination changed during extraction; try again.');
            await OS.db.mutateFiles(all=>{if(parent!=='/'&&!all.some(e=>e.path===parent&&e.kind==='directory'))throw Error('Destination folder was removed.');return {puts:[...puts.values()]};});OS.emit('fs-change',{path:root});return root;
        }
    };
    OS.clipboardText={target:null,model:new M.ClipboardHistory(),
        async save(){await OS.featureSave('clipboard-pins',this.model.saved());OS.featureChange('clipboard');},
        async add(text){if(!OS.settings.clipboardHistory)return false;const entry=this.model.add(text);if(entry)await this.save();return entry;},
        paste(id){const e=this.model.entries.find(e=>e.id===id),target=this.target;if(!e||!target||!target.element.isConnected)throw Error('Click an Aster text field before opening Clipboard History.');
            const el=target.element;if(el.disabled||el.readOnly||!['text','search','email','url','tel','textarea'].includes(el.type))throw Error('This field does not accept clipboard history.');
            if(target.value!==el.value)throw Error('The target changed. Select its insertion point again before pasting.');
            el.setRangeText(e.text,target.start,target.end,'end');el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:e.text}));el.focus();this.remember(el);return true;},
        remember(el){if((el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement)&&['text','search','email','url','tel','textarea'].includes(el.type)&&!el.readOnly&&!el.disabled&&typeof el.selectionStart==='number')this.target={element:el,start:el.selectionStart,end:el.selectionEnd,value:el.value};},
        async readSystem(){if(!navigator.clipboard?.readText)throw Error('System clipboard access is unavailable. Copy text inside Aster instead.');return this.add(await navigator.clipboard.readText());}
    };
    document.addEventListener('focusout',e=>{if(!e.target.closest?.('[data-app="clipboard"]'))OS.clipboardText.remember(e.target);});
    const captureClipboard=e=>{
        if(!OS.settings.clipboardHistory||e.target.closest?.('input[type="password"],[data-private]'))return;
        const el=e.target;let text='';if(el instanceof HTMLTextAreaElement||el instanceof HTMLInputElement){if(!['text','search','url','tel','textarea'].includes(el.type))return;text=el.value.slice(el.selectionStart,el.selectionEnd);}else text=getSelection()?.toString()||'';
        OS.clipboardText.add(text).catch(console.warn);
    };
    document.addEventListener('copy',captureClipboard);document.addEventListener('cut',captureClipboard);
    OS.quiet={schedule:{enabled:false,start:'22:00',end:'08:00'},active(){return !!OS.settings.dnd||OS.focusSession?.state.status==='running'||M.inQuietHours(this.schedule);}};
    OS.focusAction=async(action,...args)=>{if(!['start','pause','resume','cancel'].includes(action))throw Error('Unknown focus action');OS.focusSession[action](...args);await OS.featureSave('focus-session',OS.focusSession.state);OS.featureChange('focus');};
    OS.workspaces={groups:[],
        async save(name){
            name=String(name||'').trim();if(!name||name.length>60)throw Error('Name the group using 1–60 characters.');if(this.groups.length>=20)throw Error('Remove a saved group before adding another (limit 20).');
            const vp=OS.viewport(),windows=[...OS.windows.values()].filter(w=>w.desktop===OS.activeDesktop&&w.appId!=='workspaces'&&!w.closed&&!w.minimized).slice(0,12);
            if(!windows.length)throw Error('Open at least one app on this desktop first.');
            const group={id:OS.uid(),name,desktop:OS.activeDesktop,entries:windows.map(w=>({app:w.appId,state:M.safeWindowState(w.state),rect:{x:w.rect.x/vp.w,y:w.rect.y/vp.h,w:w.rect.w/vp.w,h:w.rect.h/vp.h}}))};
            this.groups.push(group);await this.persist();return group;
        },
        persist(){OS.featureChange('workspaces');return OS.featureSave('window-groups',this.groups);},
        async restore(id){const group=this.groups.find(g=>g.id===id);if(!group)throw Error('Window group not found.');const used=new Set(),vp=OS.viewport(),restored=[];
            const desktop=OS.desktops.some(d=>d.id===group.desktop)?group.desktop:OS.activeDesktop;OS.switchDesktop(desktop);
            for(const entry of group.entries){if(!OS.apps.has(entry.app)||entry.app==='workspaces')continue;
                let w=[...OS.windows.values()].find(w=>!used.has(w.id)&&w.appId===entry.app&&(w.state.path||'')===(entry.state.path||''));
                w ||= OS.launch(entry.app,{...entry.state,desktop});if(!w)continue;await w.ready;if(w.closed)continue;
                used.add(w.id);w.desktop=desktop;w.maximized=false;w.minimized=false;w.rect={x:entry.rect.x*vp.w,y:entry.rect.y*vp.h,w:entry.rect.w*vp.w,h:entry.rect.h*vp.h};w.constrain();w.sync();restored.push(w);}
            restored.at(-1)?.focus();OS.emit('windows');return restored;
        },
        arrange(layout,ids){const windows=ids.map(id=>OS.windows.get(id)).filter(w=>w&&!w.closed).slice(0,4),rects=M.layoutRects(layout,windows.length,OS.viewport());
            if(rects.some(r=>r.w<270||r.h<180))throw Error('This layout is too small for the current screen. Choose fewer windows or a larger display.');
            windows.forEach((w,i)=>{w.restoreRect={...w.rect};w.maximized=false;w.minimized=false;w.desktop=OS.activeDesktop;w.rect=rects[i];w.sync();});OS.emit('windows');return windows;
        }
    };
    OS.effectiveWallpaper=()=>OS.desktops.find(d=>d.id===OS.activeDesktop)?.wallpaper||OS.settings.wallpaper;
    OS.initDesktopServices=async()=>{
        OS.db.memory && (OS.db.memory.history ||= new Map());
        const [pins,focus,quiet,storage,groups,favorites,widgets]=await Promise.all(['clipboard-pins','focus-session','quiet-hours','storage-sense','window-groups','file-favorites','widget-board'].map(k=>OS.db.get(k)));
        OS.clipboardText.model=new M.ClipboardHistory(OS.settings.clipboardHistory?pins:[]);
        OS.focusSession=new M.FocusSession(focus);OS.quiet.schedule={enabled:!!quiet?.enabled,start:/^\d\d:\d\d$/.test(quiet?.start)?quiet.start:'22:00',end:/^\d\d:\d\d$/.test(quiet?.end)?quiet.end:'08:00'};
        Object.assign(OS.storageSense.policy,{enabled:!!storage?.enabled,days:M.clamp(storage?.days,1,365,30),lastRun:M.clamp(storage?.lastRun,0,Date.now(),0)});
        OS.workspaces.groups=(Array.isArray(groups)?groups:[]).filter(g=>g&&typeof g.id==='string'&&typeof g.name==='string'&&Array.isArray(g.entries)).slice(0,20).map(g=>({...g,name:g.name.slice(0,60),entries:g.entries.filter(e=>e&&typeof e.app==='string'&&e.rect&&['x','y','w','h'].every(k=>Number.isFinite(e.rect[k])&&Math.abs(e.rect[k])<=2)).slice(0,12).map(e=>({...e,state:M.safeWindowState(e.state)}))}));
        OS.fileFavorites=(Array.isArray(favorites)?favorites:[]).filter(p=>typeof p==='string'&&p.startsWith('/')&&!p.startsWith('/.')).slice(0,30);
        OS.widgetBoard={order:['clock','agenda','tasks','notes','focus','storage'],hidden:[],note:''};
        if(widgets){const allowed=OS.widgetBoard.order;OS.widgetBoard.order=[...new Set([...(Array.isArray(widgets.order)?widgets.order:[]).filter(x=>allowed.includes(x)),...allowed])];OS.widgetBoard.hidden=(Array.isArray(widgets.hidden)?widgets.hidden:[]).filter(x=>allowed.includes(x));OS.widgetBoard.note=M.validText(widgets.note,20000);}
        const tick=()=>{if(OS.focusSession.tick()){OS.featureSave('focus-session',OS.focusSession.state).catch(console.warn);OS.featureChange('focus');OS.notify('Focus session complete',OS.focusSession.state.task||'Take a break before your next session.','info',null,{priority:'high'});}OS.emit('focus-tick');};
        tick();OS.desktopFeatureTimer=setInterval(tick,1000);
        if(OS.storageSense.policy.enabled&&Date.now()-OS.storageSense.policy.lastRun>86400000)await OS.storageSense.clean().catch(error=>{OS.storageSense.error=error.message;console.warn('Automatic cleanup did not complete',error);});
        OS.on('settings',()=>OS.applyAccessibility?.());
    };
})();
