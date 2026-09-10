/* Aster Web Files: capability broker, atomic saves and owned-frame lifecycle. MIT. */
'use strict';
(()=>{
    const OS=Aster,M=AsterIOModels,L=M.LIMITS;let settings=M.settings(),saveQueue=Promise.resolve(),pickerOpen=null;
    const sessions=new Set(),offers=new Map();
    const reportError=e=>OS.notify('File integration',e.message||String(e),'warning');
    const fail=M.fail,token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join(''),validPath=(p,storageRoot=null)=>M.grantPath(p,storageRoot),label=p=>OS.fs.name(p);
    const IO=OS.webIO={get settings(){return structuredClone(settings);},get sessions(){return [...sessions].map(s=>({id:s.id,app:s.app,title:s.title,state:s.state,grants:s.caps.size}));},policy:app=>M.policy(settings,app)};
    IO.initialize=async()=>{settings=M.settings(await OS.db.get('web-io-v1')||{});};
    IO.update=(app,key,value)=>{
        if(!M.FEATURES.includes(key)&&key!=='nativeDrop')return Promise.reject(Error('Unknown integration setting.'));
        const work=saveQueue.catch(()=>{}).then(async()=>{const next=M.settings(settings);if(!app){if(typeof value!=='boolean')throw TypeError('Expected boolean.');if(key==='nativeDrop')next.nativeDrop=value;else next.defaults[key]=value;}else{if(!/^[\w-]{1,100}$/.test(app)||['__proto__','constructor','prototype'].includes(app))throw TypeError('Invalid app identifier.');if(!next.apps[app]&&Object.keys(next.apps).length>=L.apps)throw Error('Too many app policies.');next.apps[app]||={};if(value===null)delete next.apps[app][key];else if(typeof value==='boolean')next.apps[app][key]=value;else throw TypeError('Expected boolean or inherit.');}await OS.db.set('web-io-v1',next);settings=next;for(const s of sessions)if(!app||s.app===app){revoke(s);s.port?.postMessage({type:'policy',policy:IO.policy(s.app)});}OS.emit('web-io');});saveQueue=work;return work;
    };
    const alive=s=>{if(!s.alive||s.w.closed||!s.frame.isConnected)fail('The application connection closed.','AbortError');};
    const check=(s,feature)=>{alive(s);if(!IO.policy(s.app)[feature])fail('This file integration is disabled in Aster Settings.','NotAllowedError');};
    function revoke(s){if(activePointer?.source===s)activePointer();s.epoch++;s.caps.clear();s.streams.clear();s.staged=0;s.pickerCancel?.();for(const cancel of s.dialogs||[])cancel();for(const [id,o]of offers)if(o.session===s)offers.delete(id);OS.emit('web-io');OS.emit('web-io-transfers');}
    IO.revoke=app=>{for(const s of sessions)if(!app||s.app===app)revoke(s);};
    const storageRoot=s=>'/Documents/App storage/'+s.app;
    const scopePath=(s,p,feature)=>validPath(p,feature==='storage'?storageRoot(s):null);
    const descriptor=c=>({token:c.id,kind:c.kind,name:label(c.path)});
    function grant(s,p,kind,write=false,feature='open',root=p,pending=false){
        scopePath(s,p,feature);for(const c of s.caps.values())if(c.path===p&&c.kind===kind&&c.root===root&&c.feature===feature&&c.write===write&&c.pending===pending)return descriptor(c);
        if(s.caps.size>=L.handles)fail('Too many handles. Close and reopen this app.','QuotaExceededError');
        const id=token(),c={id,path:p,kind,write,feature,root,pending,epoch:s.epoch};s.caps.set(id,c);OS.emit('web-io');return descriptor(c);
    }
    function activation(s){alive(s);if(!navigator.userActivation?.isActive)fail('Use a click or key press in the app to open a file dialog.','SecurityError');}
    async function directoryRow(p){const r=await row(p);if(r.kind!=='directory')fail('The selected folder is no longer a directory.','TypeMismatchError');return r;}
    function cap(s,id,write=false){alive(s);const c=s.caps.get(id);if(!c||c.epoch!==s.epoch)fail('File access was revoked. Select the file again.','NotAllowedError');check(s,c.feature);if(write&&!c.write)fail('Read-only handle. Request read/write permission first.','NotAllowedError');if(write&&(!IO.policy(s.app).save||!IO.policy(s.app).write))fail('Writes are disabled for this app.','NotAllowedError');return c;}
    async function ask(s,options){
        alive(s);const epoch=s.epoch,marker=OS.el('span',{'data-io-prompt':'',hidden:true});
        const promise=OS.dialog({...options,extra:marker});const cancel=()=>marker.closest('.dialog')?.querySelector('.dialog-actions .secondary')?.click();
        (s.dialogs||=new Set()).add(cancel);
        try{const result=await promise;alive(s);if(s.epoch!==epoch)fail('Access changed while asking permission.','AbortError');return result;}finally{s.dialogs.delete(cancel);}
    }
    async function row(p){const r=await OS.fs.stat(p);if(!r)fail('File or folder no longer exists.','NotFoundError');return r;}
    async function asFile(r,relativePath){if(r.kind!=='file')fail('This handle names a folder.','TypeMismatchError');const blob=await OS.fs.blob(r);if(blob.size>L.file)fail('File exceeds 64 MiB.','QuotaExceededError');return {name:label(r.path),blob,type:r.mime||blob.type,modified:r.modified,relativePath};}
    // All authority and revision checks are synchronous within the database
    // transaction. A concurrent tab cannot replace newer work between checks/save.
    IO.atomic=(checks,puts=[],deletes=[],authority=()=>{})=>{
        function plan(rows,index){authority(rows);const live=new Map(rows.map(r=>[r.path,r]));for(const [p,expected] of checks)if(M.stamp(live.get(p))!==expected)fail('The file changed elsewhere. Reopen it before saving.','InvalidModificationError');
            let next=Array.isArray(index)?index:[],hist=[],prune=[];
            for(const r of puts){M.path(r.path);const parent=OS.fs.parent(r.path),dir=puts.find(e=>e.path===parent)||live.get(parent);if(parent!=='/'&&dir?.kind!=='directory')fail('Destination folder was removed.','NotFoundError');const old=live.get(r.path);if(old&&old.kind!==r.kind)fail('The destination has a different type.','TypeMismatchError');if(OS.settings.historyEnabled&&old?.kind==='file'&&old.size<=8*1024*1024){const h={id:OS.uid(),path:old.path,size:old.size||0,mime:old.mime||'',time:Date.now(),modified:old.modified};const pruned=AsterDesktopModels.pruneHistory(next,h);next=pruned.rows;hist.push({...h,content:old.content});prune.push(...pruned.removed.map(e=>e.id));}}
            return {index:next,hist,prune,puts:puts.map(e=>({...e,revision:OS.uid()}))};
        }
        if(OS.db.memory){try{const db=OS.db.memory,result=plan([...db.files.values()],db.meta.get('history-index')),files=new Map(db.files),history=new Map(db.history);deletes.forEach(p=>files.delete(p));result.puts.forEach(r=>files.set(r.path,structuredClone(r)));result.hist.forEach(r=>history.set(r.id,r));result.prune.forEach(id=>history.delete(id));db.files=files;db.history=history;db.meta.set('history-index',result.index);return Promise.resolve();}catch(e){return Promise.reject(e);}}
        return new Promise((resolve,reject)=>{const tx=OS.db.db.transaction(['files','history','meta'],'readwrite'),fs=tx.objectStore('files'),hs=tx.objectStore('history'),ms=tx.objectStore('meta'),read=fs.getAll(),idx=ms.get('history-index');let remaining=2,error;
            function ready(){if(--remaining)return;try{const result=plan(read.result,idx.result);deletes.forEach(p=>fs.delete(p));result.puts.forEach(r=>fs.put(r));result.hist.forEach(r=>hs.put(r));result.prune.forEach(id=>hs.delete(id));ms.put(result.index,'history-index');}catch(e){error=e;tx.abort();}}
            read.onsuccess=idx.onsuccess=ready;tx.oncomplete=()=>resolve();tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('Atomic file operation aborted.'));
        });
    };
    const changed=p=>{OS.emit('fs-change',{path:p,operation:'web-io'});OS.featureChange('history');};
    const newFile=(p,blob=new Blob([]))=>({path:p,kind:'file',mime:blob.type||OS.fs.mime(p),size:blob.size,modified:Date.now(),content:blob});
    async function ensureEmpty(s,p,authority){const r=await OS.fs.stat(p);if(r)return r;await IO.atomic([[p,null]],[newFile(p)],[],authority);changed(p);return row(p);}
    // One shared profile-aware presentation, with authority retained here.
    IO.pick=(s,kind,raw={},acceptOverride=null)=>{
        activation(s);
        if(pickerOpen)return Promise.reject(new DOMException('Another file dialog is already open.','InvalidStateError'));
        let o;try{o=M.options(raw);}catch(e){return Promise.reject(e);}
        let dir='/Documents',closed=false;const epoch=s.epoch;
        if(s.caps.has(raw.startIn)){const c=cap(s,raw.startIn);dir=c.kind==='directory'?c.path:OS.fs.parent(c.path);}
        else dir=({desktop:'/Desktop',documents:'/Documents',downloads:'/Downloads',pictures:'/Pictures',music:'/Music',videos:'/Videos'})[o.startIn]||dir;
        const authority=()=>{alive(s);if(closed||s.epoch!==epoch)fail('File access changed.','AbortError');};
        const picker=OS.filePicker.show({kind,options:o,acceptOverride,startDirectory:dir,appTitle:s.title,
            title:kind==='save'?'Save to Aster':kind==='folder'?'Choose Aster folder':'Open from Aster',
            validate:validPath,stat:p=>OS.fs.stat(p),list:p=>OS.fs.list(p),
            canCreate:()=>IO.policy(s.app).write&&IO.policy(s.app).save,
            onClose:()=>{closed=true;pickerOpen=null;s.pickerCancel=null;},
            onNewFolder:async dir=>{
                authority();check(s,'write');check(s,'save');const name=await ask(s,{title:'New folder',value:'New folder',message:'Create a folder in '+dir,confirm:'Save'});
                if(name===null)return null;authority();const p=validPath(OS.fs.join(dir,M.name(name)));
                await IO.atomic([[p,null]],[{path:p,kind:'directory',modified:Date.now()}],[],()=>{authority();check(s,'write');check(s,'save');});changed(p);return p;
            },
            onConfirm:async({dir,paths,name,filter,allTypes})=>{
                authority();let result;
                if(kind==='folder'){validPath(dir);await directoryRow(dir);result=[dir];}
                else if(kind==='save'){
                    name=M.name(name);
                    if(!allTypes&&filter.length&&!M.accepts(name,OS.fs.mime(name),filter)){const ext=filter.find(x=>x.startsWith('.'));if(ext)name+=ext;}
                    const p=validPath(OS.fs.join(dir,name)),exists=await OS.fs.stat(p);
                    if(exists?.kind==='directory')fail('A folder already uses this name.');
                    if(exists&&!await ask(s,{title:'Replace existing file?',message:p+' will be replaced only when the app closes its writable stream.',confirm:'Replace'}))return null;
                    result=[p];result.stamp=M.stamp(exists);
                }else{
                    result=paths;if(!result.length)fail('Select at least one file.');if(result.length>256)fail('Select no more than 256 files.');
                    for(const p of result){validPath(p);const r=await row(p);if(r.kind!=='file'||!M.accepts(label(p),r.mime||'',filter))fail('The selected file changed or no longer matches.');}
                }
                authority();return result;
            }
        });
        pickerOpen=s;s.pickerCancel=picker.cancel;return picker.promise;
    };
    async function permission(s,id,mode,prompt){if(!['read','readwrite'].includes(mode))fail('Invalid permission mode.');let c;try{c=cap(s,id);}catch(e){if(e.name==='NotAllowedError')return 'denied';throw e;}if(mode==='read')return 'granted';if(!IO.policy(s.app).save||!IO.policy(s.app).write)return 'denied';if(c.write)return 'granted';if(!prompt)return 'prompt';activation(s);const epoch=s.epoch,ok=await ask(s,{title:'Allow this app to edit?',message:s.title+' requests write access to '+c.path+(c.kind==='directory'?' and its descendants.':'.'),confirm:'Allow editing'});if(!ok||s.epoch!==epoch)return 'denied';cap(s,id);c.write=true;return 'granted';}
    async function treeFiles(s,id){const c=cap(s,id);if(c.kind!=='directory')fail('Expected a directory.','TypeMismatchError');const all=await OS.db.all(),rows=all.filter(r=>r.kind==='file'&&M.inside(c.path,r.path));if(rows.length>L.entries)fail('Directory has too many entries.','QuotaExceededError');const out=[];let bytes=0;for(const r of rows){try{scopePath(s,r.path,c.feature);}catch{continue;}const f=await asFile(r,label(c.path)+'/'+r.path.slice(c.path.length+1));bytes+=f.blob.size;if(bytes>L.batch)fail('Directory exceeds transfer limit.','QuotaExceededError');out.push(f);}cap(s,id);return out;}
    async function dispatch(s,op,a={}){
        alive(s);const epoch=s.epoch,permit=feature=>{check(s,feature);if(s.epoch!==epoch)fail('Access changed during the operation.','AbortError');};switch(op){
        case 'open':case 'input':{check(s,op==='input'?'inputs':'open');if(op==='input'&&(!Array.isArray(a.accept)||a.accept.length>64||a.accept.some(v=>typeof v!=='string'||v.length>100)))fail('Invalid input filter.');const paths=await IO.pick(s,'open',op==='input'?{multiple:a.multiple===true}:a.options,op==='input'?a.accept:null);check(s,op==='input'?'inputs':'open');if(op==='input'){const result=[];let bytes=0;for(const p of paths){const f=await asFile(await OS.fs.read(p));bytes+=f.blob.size;if(bytes>L.batch)fail('Selected files exceed 128 MiB.','QuotaExceededError');result.push(f);}return result;}return paths.map(p=>grant(s,p,'file',false,'open'));}
        case 'save':{check(s,'save');check(s,'write');const paths=await IO.pick(s,'save',a.options),p=paths[0];permit('save');check(s,'write');if(M.stamp(await OS.fs.stat(p))!==paths.stamp)fail('The save destination changed. Choose it again.','InvalidModificationError');permit('save');return grant(s,p,'file',true,'save',p,paths.stamp===null);}
        case 'folder':{check(s,'folders');const [p]=await IO.pick(s,'folder',a.options);check(s,'folders');await directoryRow(p);if(a.options?.mode==='readwrite'){check(s,'save');check(s,'write');}permit('folders');return grant(s,p,'directory',a.options?.mode==='readwrite','folders');}
        case 'storage':{check(s,'storage');const base='/Documents/App storage',p=base+'/'+s.app;const epoch=s.epoch;if(!await ask(s,{title:'Use Aster app storage?',message:s.title+' will store its private files in '+p+'. Existing browser OPFS data is not moved.',confirm:'Use Aster storage'}))fail('Cancelled.','AbortError');check(s,'storage');if(epoch!==s.epoch)fail('Access changed.','AbortError');const puts=[],checks=[];for(const path of [base,p]){const old=await OS.fs.stat(path);if(old&&old.kind!=='directory')fail('App storage path is occupied by a file.','TypeMismatchError');checks.push([path,M.stamp(old)]);if(!old)puts.push({path,kind:'directory',modified:Date.now()});}await IO.atomic(checks,puts,[],()=>permit('storage'));changed(p);return grant(s,p,'directory',true,'storage');}
        case 'permission':case 'requestPermission':return permission(s,a.token,a.mode,op==='requestPermission');
        case 'describe':return descriptor(cap(s,a.token));
        case 'same':{const c=cap(s,a.token),other=cap(s,a.other);return c.path===other.path&&c.kind===other.kind;}
        case 'resolve':{const c=cap(s,a.token),other=cap(s,a.other);if(c.kind!=='directory')fail('Expected directory.');return M.inside(c.path,other.path)?other.path.slice(c.path.length).split('/').filter(Boolean):null;}
        case 'read':{const c=cap(s,a.token);if(c.kind!=='file')fail('Expected file.','TypeMismatchError');const r=await OS.fs.stat(c.path);if(!r&&c.pending){cap(s,a.token);return asFile(newFile(c.path));}const f=await asFile(await OS.fs.read(c.path));cap(s,a.token);return f;}
        case 'treeFiles':return treeFiles(s,a.token);
        case 'entries':{const c=cap(s,a.token);if(c.kind!=='directory')fail('Expected directory.','TypeMismatchError');await directoryRow(c.path);const rows=(await OS.fs.list(c.path)).filter(r=>{try{return scopePath(s,r.path,c.feature);}catch{return false;}});if(rows.length>L.entries)fail('Directory has too many entries.','QuotaExceededError');cap(s,a.token);const needed=rows.filter(r=>![...s.caps.values()].some(g=>g.path===r.path&&g.kind===r.kind&&g.root===c.root&&g.feature===c.feature&&g.write===c.write&&!g.pending)).length;if(s.caps.size+needed>L.handles)fail('Directory exceeds remaining handle capacity.','QuotaExceededError');return rows.map(r=>grant(s,r.path,r.kind,c.write,c.feature,c.root));}
        case 'child':{const c=cap(s,a.token,a.create);if(c.kind!=='directory')fail('Expected directory.','TypeMismatchError');M.name(a.name);if(!['directory','file'].includes(a.kind))fail('Invalid entry kind.');await directoryRow(c.path);const p=scopePath(s,OS.fs.join(c.path,a.name),c.feature);let r=await OS.fs.stat(p);if(!r){if(!a.create)fail('Entry not found.','NotFoundError');r=a.kind==='file'?newFile(p):{path:p,kind:'directory',modified:Date.now()};await IO.atomic([[p,null]],[r],[],()=>cap(s,a.token,true));changed(p);}if(r.kind!==a.kind)fail('Entry has another type.','TypeMismatchError');cap(s,a.token);return grant(s,p,a.kind,c.write,c.feature,c.root);}
        case 'remove':{const c=cap(s,a.token,true);if(c.kind!=='directory')fail('Expected directory.','TypeMismatchError');await directoryRow(c.path);const p=scopePath(s,OS.fs.join(c.path,M.name(a.name)),c.feature),all=await OS.db.all(),rows=all.filter(r=>M.inside(p,r.path));if(!rows.length)fail('Entry not found.','NotFoundError');if(rows.length>1&&!a.recursive)fail('Directory is not empty.','InvalidModificationError');if(rows.length>L.entries)fail('Too many entries.','QuotaExceededError');await IO.atomic(rows.map(r=>[r.path,M.stamp(r)]),[],rows.map(r=>r.path),live=>{cap(s,a.token,true);if(live.filter(r=>M.inside(p,r.path)).length!==rows.length)fail('Folder changed during deletion.','InvalidModificationError');});changed(p);return true;}
        case 'writeBegin':{if(await permission(s,a.token,'readwrite',true)!=='granted')fail('Write permission denied.','NotAllowedError');const c=cap(s,a.token,true);if(c.kind!=='file')fail('Expected file.','TypeMismatchError');if(s.streams.size>=L.streams)fail('Too many open streams.','QuotaExceededError');const mode=a.mode||'siloed';if(!['siloed','exclusive'].includes(mode))fail('Invalid writer mode.');const r=await OS.fs.stat(c.path);if(!r&&!c.pending)fail('File no longer exists.','NotFoundError');if(r&&c.pending)fail('The new destination was created elsewhere. Select it again.','InvalidModificationError');if(r&&r.kind!=='file')fail('File was replaced by a folder.','TypeMismatchError');const blob=a.keep&&r?(await asFile(await OS.fs.read(c.path))).blob:new Blob([]);cap(s,a.token,true);if(s.streams.size>=L.streams)fail('Too many open streams.','QuotaExceededError');for(const other of sessions)for(const st of other.streams.values())if(st.path===c.path&&(st.mode==='exclusive'||mode==='exclusive'))fail('This file has an exclusive writer.','NoModificationAllowedError');if(s.staged+blob.size>L.batch)fail('Staged writes exceed 128 MiB.','QuotaExceededError');const id=token();s.streams.set(id,{id,token:a.token,path:c.path,stamp:M.stamp(r),blob,position:0,mode});s.staged+=blob.size;return {id};}
        case 'writeChunk':{const st=s.streams.get(a.id);if(!st)fail('Stream no longer exists.','InvalidStateError');cap(s,st.token,true);const c=a.command||{};let blob=st.blob,pos=st.position;
            if(c.type==='seek')pos=M.integer(c.position);
            else if(c.type==='truncate'){const size=M.integer(c.size);blob=size<=blob.size?blob.slice(0,size):new Blob([blob,new Uint8Array(size-blob.size)],{type:blob.type});pos=Math.min(pos,size);}
            else if(c.type==='write'){if(!(c.data instanceof Blob)||c.data.size>L.file)fail('Invalid write payload.','QuotaExceededError');if(c.position!==undefined)pos=M.integer(c.position);const end=M.integer(pos+c.data.size);blob=new Blob([blob.slice(0,Math.min(pos,blob.size)),...(pos>blob.size?[new Uint8Array(pos-blob.size)]:[]),c.data,blob.slice(end)],{type:blob.type||c.data.type});pos=end;}
            else fail('Unknown write command.');if(s.staged-st.blob.size+blob.size>L.batch)fail('Staged writes exceed 128 MiB.','QuotaExceededError');s.staged+=blob.size-st.blob.size;st.blob=blob;st.position=pos;return true;}
        case 'writeClose':{const st=s.streams.get(a.id);if(!st)fail('Stream no longer exists.','InvalidStateError');try{cap(s,st.token,true);await IO.atomic([[st.path,st.stamp]],[newFile(st.path,st.blob)],[],()=>cap(s,st.token,true));cap(s,st.token,true).pending=false;changed(st.path);return true;}finally{s.streams.delete(a.id);s.staged=Math.max(0,s.staged-st.blob.size);}}
        case 'writeAbort':{const st=s.streams.get(a.id);if(st){s.staged=Math.max(0,s.staged-st.blob.size);s.streams.delete(a.id);}return true;}
        case 'download':{check(s,'downloads');if(!(a.blob instanceof Blob)||a.blob.size>L.file)fail('Invalid export.','QuotaExceededError');const paths=await IO.pick(s,'save',{suggestedName:M.name(a.name)}),p=paths[0];permit('downloads');await IO.atomic([[p,paths.stamp]],[newFile(p,a.blob)],[],()=>permit('downloads'));changed(p);return {name:label(p)};}
        case 'pointerStart':{check(s,'dropOut');const o=IO.getOffer(a.token);if(o.session!==s)fail('Foreign transfer.','NotAllowedError');const r=s.frame.getBoundingClientRect();if(!Number.isFinite(a.x)||!Number.isFinite(a.y))fail('Invalid coordinates.');if(a.gesture!==undefined&&!/^[a-f0-9]{32}$/.test(a.gesture))fail('Invalid drag gesture.');IO.pointerDrag(a.token,r.left+a.x,r.top+a.y,s,a.gesture);return true;}
        case 'offer':{check(s,'dropOut');const result=IO.offer(a.files,s);if(a.show)IO.showTransfers();return result;}
        case 'releaseOffer':{const o=offers.get(a.token);if(o?.session===s)offers.delete(a.token);return true;}
        case 'dropRead':{check(s,'dropIn');const o=IO.getOffer(a.token);if(o.session===s)return {files:o.files,handles:[]};const files=o.paths?await IO.filesFromPaths(o.paths):o.files;IO.getOffer(a.token);permit('dropIn');const hs=[];if(o.paths)for(const p of o.paths){const r=await row(p);hs.push(grant(s,p,r.kind,false,'dropIn'));}return {files,handles:hs};}
        default:fail('Unsupported Aster file operation.','NotSupportedError');}
    }
    function connect(s,port){s.port?.close();revoke(s);s.port=port;s.alive=true;s.state='connecting';let active=0;const seen=new Set();
        port.onmessage=e=>{if(s.port!==port)return;const m=e.data;if(m?.type==='pointer'){if(activePointer?.source===s)activePointer.remote?.(m);return;}if(m?.type==='bye'){revoke(s);s.state='disconnected';s.port=null;port.close();return;}if(m?.type==='ready'){s.state='connected';OS.emit('web-io');return;}if(!m||!Number.isSafeInteger(m.id)||m.id<1||typeof m.op!=='string'||seen.has(m.id))return;if(active>=L.requests){port.postMessage({id:m.id,error:{name:'QuotaExceededError',message:'Request limit exceeded.'}});return;}seen.add(m.id);if(seen.size>4096)seen.delete(seen.values().next().value);active++;const current=s.epoch;Promise.resolve().then(()=>dispatch(s,m.op,m.args)).then(value=>{if(!s.alive||s.port!==port||s.epoch!==current)throw new DOMException('Access changed during the request.','AbortError');port.postMessage({id:m.id,value});}).catch(error=>{try{port.postMessage({id:m.id,error:{name:error.name||'Error',message:String(error.message).slice(0,500)}});}catch{}}).finally(()=>active--);};port.start();
    }
    IO.attach=(w,frame,appId,url,opaque=false)=>{
        const s={id:token(),w,frame,app:appId,title:OS.apps.get(appId)?.title||w.title||'Web app',caps:new Map(),streams:new Map(),staged:0,epoch:0,alive:true,state:'waiting',port:null};sessions.add(s);let doc=null,attempts=0,stopped=false,poll;
        function offered(){if(stopped||w.closed||!frame.isConnected)return;const previous=s.state;attempts++;try{const target=frame.contentWindow,d=target.document;if(d&&d.URL!=='about:blank'&&d!==doc){const approved=opaque||new URL(d.URL).origin===new URL(url).origin&&new URL(d.URL).pathname.startsWith(new URL(url).pathname);if(!approved){if(s.state==='connected')revoke(s);s.state='outside approved app';return;}target.AsterFiles?.dispose?.();const channel=new MessageChannel();connect(s,channel.port1);s.sameOrigin=true;doc=d;AsterIOClient.install(target,channel.port2,{policy:IO.policy(appId),session:s.id});}}
            catch{if(s.state==='connected'&&doc){revoke(s);s.port?.postMessage({type:'close'});doc=null;}if(s.state!=='connected'){s.state='SDK required';}}
            if((attempts>=100||s.state==='connected'&&doc?.readyState==='complete')&&poll){clearInterval(poll);poll=null;}if(s.state!==previous)OS.emit('web-io');}
        let loads=0;function loaded(){if(loads++){revoke(s);s.port?.postMessage({type:'close'});s.port?.close();s.port=null;s.state='waiting';s.lastHello=null;doc=null;}attempts=0;offered();if(!poll)poll=setInterval(offered,50);}
        function sendOffer(){s.sameOrigin=false;try{const channel=new MessageChannel();connect(s,channel.port1);const origin=opaque?'*':new URL(url).origin;frame.contentWindow.postMessage({type:'aster-io-offer',session:s.id,policy:IO.policy(appId)},origin,[channel.port2]);}catch{s.state='SDK required';}}
        const hello=e=>{if(e.source!==frame.contentWindow||e.data?.type!=='aster-io-ready')return;const expected=opaque?'null':new URL(url).origin;if(e.origin!==expected||typeof e.data.nonce!=='string'||e.data.nonce===s.lastHello)return;s.lastHello=e.data.nonce;sendOffer();};window.addEventListener('message',hello);
        frame.addEventListener('load',loaded);poll=setInterval(offered,50);queueMicrotask(offered);
        const dispose=()=>{if(stopped)return;stopped=true;clearInterval(poll);window.removeEventListener('message',hello);frame.removeEventListener('load',loaded);s.port?.postMessage({type:'close'});revoke(s);s.alive=false;s.port?.close();if(activePointer?.source===s)activePointer();sessions.delete(s);for(const [id,o]of offers)if(o.session===s)offers.delete(id);OS.emit('web-io');};w.addCleanup(dispose);return dispose;
    };
    IO.bootstrap=html=>{const source='window.ASTER_FILE_HOST_ORIGINS='+JSON.stringify([window.origin])+';('+function(installer){window.addEventListener('message',e=>{if(e.source!==parent||e.data?.type!=='aster-io-offer'||!e.ports[0]||!window.ASTER_FILE_HOST_ORIGINS.includes(e.origin))return;if(!window.AsterFiles?.connected)installer(window,e.ports[0],e.data);});parent.postMessage({type:'aster-io-ready',nonce:Array.from(crypto.getRandomValues(new Uint8Array(16))).join('-')},'*');}.toString()+')('+AsterIOClient.install.toString()+');';const tag='<script>'+source.replace(/<\/script/gi,'<\\/script')+'</script>';if(/<head\b[^>]*>/i.test(html))return html.replace(/<head\b[^>]*>/i,head=>head+tag);return html.replace(/^(\s*<!doctype[^>]*>)?/i,prefix=>prefix+tag);};
    IO.filesFromPaths=async paths=>{if(!Array.isArray(paths)||paths.length>L.entries)fail('Too many selected files.');const all=await OS.db.all(),result=[];let bytes=0;for(const p of paths){validPath(p);for(const r of all.filter(r=>r.kind==='file'&&M.inside(p,r.path))){try{validPath(r.path);}catch{continue;}const f=await asFile(await OS.fs.read(r.path),r.path===p?'':r.path.slice(OS.fs.parent(p).length+1));bytes+=f.blob.size;if(result.length>=L.entries||bytes>L.batch)fail('Transfer exceeds 128 MiB or 2048 files.','QuotaExceededError');result.push(f);}}return result;};
    IO.getOffer=id=>{if(typeof id!=='string'||!/^[a-f0-9]{48}(:[0-9]{1,4})?$/.test(id))fail('Invalid transfer.','NotAllowedError');const [key,index]=id.split(':'),o=offers.get(key);if(!o||o.expires<Date.now()||o.session&&(!o.session.alive||o.epoch!==o.session.epoch||!IO.policy(o.session.app).dropOut))fail('Transfer expired or access was revoked.','NotAllowedError');if(index!==undefined){if(!o.files?.[+index])fail('Invalid transfer item.');return {...o,files:[o.files[+index]]};}return o;};
    IO.offer=(files,session=null)=>{if(!Array.isArray(files)||!files.length||files.length>L.entries)fail('Invalid file transfer.');let size=0;for(const f of files){M.name(f.name);if(!(f.blob instanceof Blob)||f.blob.size>L.file)fail('Invalid or oversized file.','QuotaExceededError');size+=f.blob.size;}if(size>L.batch)fail('Transfer exceeds 128 MiB.','QuotaExceededError');for(const [id,o]of offers)if(o.expires<Date.now())offers.delete(id);if([...offers.values()].reduce((n,o)=>n+(o.size||0),0)+size>L.batch)fail('Transfer shelf exceeds 128 MiB.','QuotaExceededError');if(offers.size>=16)fail('Close or remove earlier transfers.','QuotaExceededError');const id=token();offers.set(id,{token:id,files:files.map(f=>({name:f.name,blob:f.blob,type:f.type||f.blob.type,relativePath:f.relativePath})),size,session,epoch:session?.epoch,expires:Date.now()+300000});OS.emit('web-io-transfers');return {token:id};};
    IO.beginDrag=(event,paths)=>{if(!paths.length)return;const id=token();for(const p of paths)validPath(p);offers.set(id,{token:id,paths:[...paths],expires:Date.now()+30000,session:null});event.dataTransfer.setData('application/x-aster-transfer',id);event.dataTransfer.setData('text/plain',paths.map(label).join('\n'));while(offers.size>24)offers.delete(offers.keys().next().value);};
    IO.importFiles=async(files,dir,authority=()=>{})=>{validPath(dir);if(files.some(f=>f.relativePath?.includes('/')))return IO.importNativeTree(Promise.resolve(files.map(f=>({relativePath:f.relativePath||f.name,kind:'file',blob:f.blob||f}))),dir,authority,false);authority();const rows=files.map(f=>({name:M.name(f.name),content:f.blob||f,mime:f.type||f.blob?.type||''}));if(rows.reduce((n,r)=>n+r.content.size,0)>L.batch||rows.some(r=>r.content.size>L.file)||rows.length>L.entries)fail('Import exceeds transfer limits.','QuotaExceededError');return OS.fileOps.execute({kind:'import',destination:dir,files:rows},{authority});};
    IO.acceptDrop=async(event,dir)=>{const id=event.dataTransfer.getData('application/x-aster-transfer');if(id&&!event.dataTransfer.getData('application/x-aster-paths')){const o=IO.getOffer(id),files=o.paths?await IO.filesFromPaths(o.paths):o.files;await IO.importFiles(files,dir,()=>IO.getOffer(id));return true;}return false;};
    let activePointer=null;
    IO.pointerDrag=(id,x,y,source=null,gesture=null)=>{
        const offer=IO.getOffer(id);if(document.querySelector('.io-picker,.dialog-backdrop'))fail('Close the active dialog before dragging.','InvalidStateError');activePointer?.();
        const overlay=OS.el('div',{class:'io-drag-overlay'}),ghost=OS.el('div',{class:'io-drag-ghost',text:(offer.paths?.length||offer.files.length)+' file(s) · drop to share'});overlay.append(ghost);document.body.append(overlay);
        const move=e=>{ghost.style.left=(e.clientX+14)+'px';ghost.style.top=(e.clientY+14)+'px';};move({clientX:x,clientY:y});
        let ended=false;const clean=()=>{if(ended)return;ended=true;overlay.remove();clearTimeout(timer);window.removeEventListener('keydown',key,true);window.removeEventListener('pointermove',move,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',clean,true);if(activePointer===clean)activePointer=null;};
        async function finish(x,y,ctrlKey=false,remote=false){
            if(ended)return;clean();try{
                const o=IO.getOffer(id);if(source)check(source,'dropOut');const target=document.elementFromPoint(x,y);const destination=[...sessions].find(s=>s.frame===target&&s.alive&&s.state==='connected');
                const explorer=target?.closest('.explorer-main,.explorer-file'),desktop=target?.closest('#desktop');if(!destination&&!explorer&&!desktop)return;
                // A MessagePort cannot certify a physical pointer release. An
                // isolated app's report must never authorize an automatic write
                // to the desktop or unsolicited sharing with another app.
                if(remote&&source&&!source.sameOrigin){const targetName=destination?.title||(explorer?'this Explorer folder':'Desktop');const ok=await ask(source,{title:'Complete file transfer?',message:source.title+' wants to share '+(o.paths?.length||o.files.length)+' file(s) with '+targetName+'. Only confirm if you just dragged these files.',confirm:'Transfer files'});if(!ok)return;IO.getOffer(id);check(source,'dropOut');}
                if(!target.isConnected)return;
                if(destination){check(destination,'dropIn');const r=destination.frame.getBoundingClientRect();destination.port.postMessage({type:'deliver',token:id,x:x-r.left,y:y-r.top});return;}
                if(explorer){const dt=new DataTransfer();dt.setData('application/x-aster-transfer',id);if(o.paths)dt.setData('application/x-aster-paths',JSON.stringify(o.paths));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,ctrlKey,clientX:x,clientY:y}));return;}
                if(desktop){const files=o.paths?await IO.filesFromPaths(o.paths):o.files;await IO.importFiles(files,'/Desktop',()=>IO.getOffer(id));}
            }catch(error){if(error.name!=='AbortError')reportError(error);}
        }
        const up=e=>{if(e.isTrusted)void finish(e.clientX,e.clientY,e.ctrlKey);};
        const key=e=>{if(e.key==='Escape'){e.preventDefault();clean();}};const timer=setTimeout(clean,15000);clean.source=source;activePointer=clean;
        clean.remote=m=>{if(!source||m.gesture!==gesture||m.token!==id||ended)return;if(m.phase==='cancel'){clean();return;}if(!Number.isFinite(m.x)||!Number.isFinite(m.y))return;const r=source.frame.getBoundingClientRect(),x=r.left+m.x,y=r.top+m.y;if(x<0||x>=innerWidth||y<0||y>=innerHeight){if(m.phase==='end')clean();return;}move({clientX:x,clientY:y});if(m.phase==='end')void finish(x,y,m.ctrlKey===true,true);};
        window.addEventListener('keydown',key,true);window.addEventListener('pointermove',move,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',clean,true);
        return clean;
    };
    // The actual Explorer pointer gesture feeds the same existing drop operation
    // path. Native device drops remain native; external exports use the shelf.
    let pointerCandidate=null;
    document.addEventListener('pointerdown',e=>{const row=e.target.closest?.('.file-row[draggable="true"],.file-tile[draggable="true"]');if(!row||e.button!==0||e.pointerType==='touch'||!e.isTrusted)return;const w=row.closest('.window');const paths=row.getAttribute('aria-selected')==='true'?[...w.querySelectorAll('[data-path][aria-selected="true"]')].map(r=>r.dataset.path):[row.dataset.path];pointerCandidate={x:e.clientX,y:e.clientY,paths};e.preventDefault();},true);
    document.addEventListener('pointermove',e=>{if(!pointerCandidate||!e.buttons)return;if(Math.hypot(e.clientX-pointerCandidate.x,e.clientY-pointerCandidate.y)<6)return;const candidate=pointerCandidate;pointerCandidate=null;try{const dt=new DataTransfer();IO.beginDrag({dataTransfer:dt},candidate.paths);IO.pointerDrag(dt.getData('application/x-aster-transfer'),e.clientX,e.clientY);}catch(error){reportError(error);}},true);
    document.addEventListener('pointerup',()=>{pointerCandidate=null;},true);document.addEventListener('pointercancel',()=>{pointerCandidate=null;},true);
    IO.showTransfers=()=>{OS.openApp('settings',{section:'webfiles'});};
    IO.listOffers=()=>[...offers.values()].filter(o=>!o.paths&&o.expires>Date.now()&&(!o.session||o.epoch===o.session.epoch&&IO.policy(o.session.app).dropOut)).map(o=>({token:o.token,title:o.session?.title||'Aster',files:o.files}));
    const sweep=setInterval(()=>{let removed=false;for(const [id,o]of offers)if(o.expires<Date.now()){offers.delete(id);removed=true;}if(removed)OS.emit('web-io-transfers');},30000);window.addEventListener('pagehide',()=>{clearInterval(sweep);activePointer?.();offers.clear();},{once:true});
    IO.removeOffer=id=>{offers.delete(id);OS.emit('web-io-transfers');};
    // Only non-sensitive session metadata is exposed publicly.
    IO.makeSession=(w,frame,app='test')=>({id:token(),w,frame,app,title:w.title||'Application',caps:new Map(),streams:new Map(),staged:0,epoch:0,alive:true,state:'direct'});
    // Host-only entry points are used by the shared dialogs/tests, never exposed
    // across the MessagePort. Same-origin catalog apps already share the origin.
    IO.dispatch=dispatch;
})();
