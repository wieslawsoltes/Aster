/* Explorer operation queue, transactional undo/redo and native shell dialogs. MIT. */
'use strict';
(() => {
    const OS=Aster,M=AsterFileOperations,undo=[],redo=[],jobs=[];
    let busy=false,panel=null;
    const stamp=()=>({time:Date.now(),id:OS.uid});
    const changed=()=>{OS.emit('file-operations');render();};
    // All normal writes carry a unique revision: equal timestamp/size is not proof
    // that an older undo snapshot is still current (including edits in another tab).
    const batch=OS.db.batch.bind(OS.db),versioned=OS.db.writeVersioned.bind(OS.db),mutate=OS.db.mutateFiles.bind(OS.db);
    OS.db.batch=(puts=[],deletes=[])=>batch(puts.map(e=>({...e,revision:OS.uid()})),deletes);
    OS.db.writeVersioned=e=>versioned({...e,revision:OS.uid()});
    OS.db.mutateFiles=fn=>mutate(rows=>{const out=fn(rows);return {...out,puts:(out.puts||[]).map(e=>({...e,revision:OS.uid()}))};});
    function commit(expected,change){
        const saveHistory=(live,index,put,remove)=>{
            let next=Array.isArray(index)?index:[];const previous=new Map(live.map(e=>[e.path,e]));
            if(OS.settings.historyEnabled)for(const row of change.puts){const old=previous.get(row.path);
                if(old?.kind!=='file'||row.path.startsWith('/.')||old.size>8*1024*1024||old.content===row.content)continue;
                const item={id:OS.uid(),path:old.path,size:old.size||0,mime:old.mime||'',time:Date.now(),modified:old.modified};
                const pruned=AsterDesktopModels.pruneHistory(next,item);next=pruned.rows;put({...item,content:old.content});pruned.removed.forEach(e=>remove(e.id));
            }
            return next;
        };
        const verify=live=>{if(!M.equal(live,expected))throw Error('Files changed while this operation was being prepared. Nothing was changed; try again.');};
        if(OS.db.memory){
            const memory=OS.db.memory,live=[...memory.files.values()];verify(live);
            const next=new Map(memory.files),history=new Map(memory.history||[]);
            const index=saveHistory(live,memory.meta.get('history-index'),e=>history.set(e.id,e),id=>history.delete(id));
            change.deletes.forEach(p=>next.delete(p));change.puts.forEach(e=>next.set(e.path,structuredClone(e)));
            memory.files=next;memory.history=history;memory.meta.set('history-index',index);return Promise.resolve();
        }
        return new Promise((resolve,reject)=>{
            const tx=OS.db.db.transaction(['files','history','meta'],'readwrite'),files=tx.objectStore('files'),meta=tx.objectStore('meta'),history=tx.objectStore('history'),read=files.getAll(),idx=meta.get('history-index');let pending=2,error;
            const ready=()=>{if(--pending)return;try{verify(read.result);const index=saveHistory(read.result,idx.result,e=>history.put(e),id=>history.delete(id));change.deletes.forEach(p=>files.delete(p));change.puts.forEach(e=>files.put(e));meta.put(index,'history-index');}catch(e){error=e;tx.abort();}};
            read.onsuccess=idx.onsuccess=ready;tx.oncomplete=()=>resolve();tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('Operation rolled back; no files were changed.'));
        });
    }
    function trim(){while(undo.length>M.LIMITS.journal||undo.reduce((n,r)=>n+r.bytes,0)>M.LIMITS.bytes)undo.shift();}
    async function checkpoint(job){
        if(job.cancelled)throw new DOMException('File operation cancelled.','AbortError');
        while(job.paused){
            // Preserve the focused/clicked controls while paused. Repainting every
            // poll detached the Cancel button under a real pointer interaction.
            if(job.status!=='paused'){job.status='paused';changed();}
            await new Promise(r=>setTimeout(r,60));
            if(job.cancelled)throw new DOMException('File operation cancelled.','AbortError');
        }
        job.status='preparing';
    }
    async function conflicts(list){
        const select=OS.el('select',{'aria-label':'Conflict action'},OS.el('option',{value:'keep-both',text:'Keep both — give the new item a different name'}),OS.el('option',{value:'skip',text:'Skip existing items'}));
        if(list.every(e=>e.sourceKind==='file'&&e.targetKind==='file'))select.append(OS.el('option',{value:'replace',text:'Replace destination files'}));
        const extra=OS.el('div',{class:'file-conflicts'},...list.slice(0,8).map(e=>OS.el('p',{text:e.target})),OS.el('label',{text:'Apply to all conflicts'},select));
        const ok=await OS.dialog({title:'Replace or skip files',message:`${list.length} destination name${list.length===1?' is':'s are'} already in use. Folders are kept separate, not merged.`,extra,confirm:'Continue'});
        return ok?select.value:null;
    }
    async function pump(){
        if(busy)return;const job=jobs.find(j=>j.status==='queued');if(!job)return;busy=true;
        try{
            await checkpoint(job);const entries=await OS.db.all();let record,change;
            if(job.request.kind==='undo'||job.request.kind==='redo'){
                const stack=job.request.kind==='undo'?undo:redo;record=stack[stack.length-1];if(!record)throw Error('There is nothing to '+job.request.kind+'.');
                change=M.reverse(entries,record,stamp());
            }else{
                change=M.plan(entries,job.request,stamp());
                if(change.conflicts.length&&!change.puts.length&&(!job.request.policy||job.request.policy==='ask')){
                    job.status='waiting';changed();const choice=await conflicts(change.conflicts);if(!choice)job.cancelled=true;await checkpoint(job);change=M.plan(entries,{...job.request,policy:choice},stamp());
                }
            }
            job.total=change.puts.length+change.deletes.length;job.completed=0;
            // Yield preparation in bounded chunks. This progress counts records, not
            // fabricated disk I/O; Blob payloads remain immutable in browser storage.
            for(let n=0;n<job.total;n+=64){await checkpoint(job);job.completed=Math.min(n+64,job.total);changed();await new Promise(r=>setTimeout(r,0));}
            await checkpoint(job);job.status='committing';changed();
            await commit(entries,change);
            if(change.puts.length||change.deletes.length){
                if(job.request.kind==='undo'){undo.pop();redo.push(change);}
                else if(job.request.kind==='redo'){redo.pop();undo.push(change);trim();}
                else{undo.push(change);redo.length=0;trim();}
                OS.emit('fs-change',{path:'/',operation:job.request.kind,paths:change.results});OS.featureChange('history');
            }
            job.status='done';job.completed=job.total;job.results=change.results;job.skipped=change.skipped?.length||0;job.resolve({results:change.results,skipped:change.skipped||[],cancelled:false});
        }catch(e){job.status=e.name==='AbortError'?'cancelled':'error';job.error=e.message;if(e.name==='AbortError')job.resolve({results:[],cancelled:true});else job.reject(e);}
        finally{busy=false;delete job.request;delete job.resolve;delete job.reject;changed();queueMicrotask(pump);}
    }
    function render(){
        if(!panel?.isConnected)return;
        const list=panel.querySelector('.file-operation-list');list.replaceChildren();
        for(const job of jobs.slice(-6).reverse()){
            const row=OS.el('section',{class:'file-operation-row','data-job':job.id},OS.el('strong',{text:job.label}),OS.el('p',{text:job.error||({queued:'Queued',preparing:`Preparing ${job.completed||0} of ${job.total||0} records`,waiting:'Waiting for conflict choice',paused:'Paused — no files changed yet',committing:'Applying changes atomically…',done:`Completed${job.skipped?' · '+job.skipped+' skipped':''}`,cancelled:'Cancelled — no files changed'}[job.status])}));
            if(['queued','preparing','paused','waiting'].includes(job.status))row.append(OS.el('button',{class:'secondary',text:job.paused?'Resume':'Pause',onclick:()=>{job.paused=!job.paused;changed();}}),OS.el('button',{class:'secondary',text:'Cancel',onclick:()=>api.cancel(job.id)}));
            if(job.total)row.append(OS.el('progress',{max:job.total,value:job.completed||0,'aria-label':'Prepared file records'}));list.append(row);
        }
        if(!jobs.length)list.append(OS.el('p',{text:'No file operations in this session.'}));
        panel.querySelector('[data-undo]').disabled=busy||!undo.length;panel.querySelector('[data-redo]').disabled=busy||!redo.length;
    }
    const api=OS.fileOps={
        get canUndo(){return !busy&&!!undo.length;},get canRedo(){return !busy&&!!redo.length;},get undoLabel(){return undo.at(-1)?.label||'';},get redoLabel(){return redo.at(-1)?.label||'';},
        get jobs(){return jobs.map(({id,status,label,error,completed,total})=>({id,status,label,error,completed,total}));},
        execute(request,{show=true}={}){
            if(jobs.filter(j=>j.request).length>=M.LIMITS.queue)return Promise.reject(Error('Four operations are already queued.'));
            const labels={copy:'Copy items',move:'Move items',rename:'Rename items',trash:'Move to Recycle Bin',restore:'Restore items',create:'Create item',import:'Import files',undo:'Undo '+this.undoLabel,redo:'Redo '+this.redoLabel};
            const job={id:OS.uid(),request:structuredClone(request),label:labels[request.kind]||'File operation',status:'queued',paused:false,cancelled:false};
            const done=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});jobs.push(job);while(jobs.length>20&&!jobs[0].request)jobs.shift();changed();if(show)this.show();queueMicrotask(pump);done.jobId=job.id;return done;
        },
        undo(){return this.execute({kind:'undo'});},redo(){return this.execute({kind:'redo'});},
        pause(id){const job=jobs.find(j=>j.id===id);if(job&&['queued','preparing','waiting','paused'].includes(job.status)){job.paused=true;changed();return true;}return false;},
        resume(id){const job=jobs.find(j=>j.id===id);if(job){job.paused=false;changed();}},
        cancel(id){const job=jobs.find(j=>j.id===id);if(job&&['queued','preparing','waiting','paused'].includes(job.status)){job.cancelled=true;job.paused=false;changed();return true;}return false;},
        show(){if(panel?.isConnected){render();return;}panel=OS.el('section',{class:'file-operation-panel flyout',role:'dialog','aria-label':'File operations'},OS.el('header',{},OS.el('strong',{text:'File operations'}),OS.el('button',{class:'icon-button','aria-label':'Hide file operations',html:OS.icon('close'),onclick:()=>{panel.remove();panel=null;}})),OS.el('div',{class:'file-operation-list'}),OS.el('footer',{},OS.el('button',{class:'secondary','data-undo':'',text:'Undo',onclick:OS.guard(()=>this.undo())}),OS.el('button',{class:'secondary','data-redo':'',text:'Redo',onclick:OS.guard(()=>this.redo())}),OS.el('small',{text:'Virtual files only · Undo history lasts for this tab session.'})));document.body.append(panel);render();},
        async renameDialog(paths){
            const entries=await OS.db.all(),selected=paths.map(p=>entries.find(e=>e.path===p));if(selected.some(e=>!e))throw Error('Selection changed.');
            const mode=OS.el('select',{'aria-label':'Rename mode'},OS.el('option',{value:'number',text:'Numbered names'}),OS.el('option',{value:'replace',text:'Replace text'})),base=OS.el('input',{'aria-label':'Base name',value:'File'}),find=OS.el('input',{'aria-label':'Find in names',placeholder:'Text to replace'}),replace=OS.el('input',{'aria-label':'Replace in names',placeholder:'Replacement'}),start=OS.el('input',{type:'number',min:'0',value:'1','aria-label':'Start number'}),preview=OS.el('div',{class:'batch-rename-preview','aria-live':'polite'}),extra=OS.el('div',{class:'batch-rename-form'},OS.el('label',{text:'Rename mode'},mode),OS.el('label',{text:'Base name'},base),OS.el('label',{text:'Start number'},start),OS.el('label',{text:'Find text'},find),OS.el('label',{text:'Replace text'},replace),preview);let spec,valid=false;
            const update=()=>{spec={mode:mode.value,base:base.value,start:Number(start.value),find:find.value,replacement:replace.value};base.disabled=start.disabled=mode.value!=='number';find.disabled=replace.disabled=mode.value!=='replace';preview.replaceChildren();try{const pairs=M.renameNames(selected,spec);M.plan(entries,{kind:'rename',paths,pairs,policy:'error'},stamp());for(const pair of pairs.slice(0,30))preview.append(OS.el('p',{text:M.name(pair.source)+' → '+M.name(pair.target)}));valid=true;}catch(e){preview.append(OS.el('p',{class:'danger',text:e.message}));valid=false;}const yes=extra.closest('.dialog')?.querySelector('.dialog-actions .primary');if(yes)yes.disabled=!valid;};
            extra.addEventListener('input',update);extra.addEventListener('change',update);const result=OS.dialog({title:'Rename '+paths.length+' items',message:'Review every name before applying. File extensions are preserved. All renames succeed together or none do.',extra,confirm:'Rename'});update();if(await result&&valid)return this.execute({kind:'rename',paths,spec,policy:'error'});return {results:[],cancelled:true};
        }
    };
})();
