/* Atomic virtual-file operation planner. No DOM or host filesystem access. MIT. */
'use strict';
(function(root){
    const LIMITS=Object.freeze({entries:4096,bytes:64*1024*1024,journal:20,queue:4});
    const system=new Set(['/','/Local','/.Trash','/Desktop','/Documents','/Downloads','/Pictures','/Music','/Videos','/Projects']);
    const fail=m=>{throw Error(m);};
    function path(value,trash=false){
        if(typeof value!=='string'||value.length>1024||!value.startsWith('/')||value.includes('\\')||/[\x00-\x1f]/.test(value))fail('Invalid virtual path.');
        const parts=value.slice(1).split('/');
        if(value!=='/'&&parts.some(s=>!s||s==='.'||s==='..'||s.trim()!==s))fail('Invalid virtual path.');
        if(value==='/Local'||value.startsWith('/Local/')||(!trash&&(value==='/.Trash'||value.startsWith('/.Trash/'))))fail('Use an ordinary Aster folder, not a mounted folder or the Recycle Bin.');
        return value;
    }
    const name=p=>p.slice(p.lastIndexOf('/')+1),parent=p=>p.slice(0,p.lastIndexOf('/'))||'/',inside=(p,r)=>p===r||p.startsWith(r+'/');
    function validName(s){if(typeof s!=='string'||!s||s.length>240||s==='.'||s==='..'||s.trim()!==s||/[\\/\x00-\x1f]/.test(s))fail('Choose a name without slashes, control characters or surrounding spaces.');return s;}
    const top=items=>[...new Set(items)].filter(p=>!items.some(q=>q!==p&&inside(p,q)));
    const join=(p,n)=>(p==='/'?'':p)+'/'+validName(n);
    function unique(target,occupied){let i=2,base=name(target),dot=base.lastIndexOf('.'),stem=dot>0?base.slice(0,dot):base,ext=dot>0?base.slice(dot):'',result=target;while(occupied.has(result)){result=join(parent(target),`${stem} (${i++})${ext}`);if(i>10000)fail('Too many conflicting names.');}return result;}
    function same(a,b){
        if(!a||!b)return !a&&!b;
        if(a.path!==b.path||a.kind!==b.kind||a.modified!==b.modified||a.size!==b.size||a.mime!==b.mime||a.revision!==b.revision||a.deletedAt!==b.deletedAt||a.originalPath!==b.originalPath)return false;
        if(typeof a.content==='string'||typeof b.content==='string')return a.content===b.content;
        return (a.content?.size||0)===(b.content?.size||0)&&(a.content?.type||'')===(b.content?.type||'');
    }
    function equal(a,b){const m=new Map(b.map(e=>[e.path,e]));return a.length===b.length&&a.every(e=>same(e,m.get(e.path)));}
    function renameNames(entries,spec){
        const start=Number(spec.start??1),digits=Number(spec.digits??1);
        if(spec.mode==='number'&&(!Number.isSafeInteger(start)||start<0||!Number.isInteger(digits)||digits<1||digits>8))fail('Use a non-negative integer and 1–8 number digits.');
        if(spec.mode==='replace'&&(!spec.find||typeof spec.find!=='string'||spec.find.length>120))fail('Enter text to replace.');
        return entries.map((e,i)=>{const n=name(e.path),dot=e.kind==='file'?n.lastIndexOf('.'):-1,ext=dot>0?n.slice(dot):'',stem=dot>0?n.slice(0,dot):n;
            const result=spec.mode==='replace'?stem.split(spec.find).join(String(spec.replacement??''))+ext:`${validName(spec.base)} (${String(start+i).padStart(digits,'0')})${ext}`;
            return {source:e.path,target:join(parent(e.path),result)};
        });
    }
    function plan(entries,request,stamp){
        const current=new Map(entries.map(e=>[e.path,e])),puts=new Map(),deletes=new Set(),results=[],conflicts=[],skipped=[];
        if(current.size!==entries.length)fail('Duplicate file records.');
        const kind=request.kind;
        if(!['copy','move','rename','trash','restore','create','import'].includes(kind))fail('Unsupported file operation.');
        const sources=top((request.paths||[]).map(p=>path(p,kind==='restore')));
        if(kind!=='create'&&kind!=='import'&&!sources.length)fail('Select an item first.');
        const canParent=p=>p==='/'||current.get(p)?.kind==='directory'||puts.get(p)?.kind==='directory';
        const checkedParent=p=>{path(p);if(!canParent(p))fail('Destination folder no longer exists.');};
        if(['copy','move','import','create'].includes(kind))checkedParent(request.destination);
        let pairs=[];
        if(kind==='rename'){
            pairs=request.pairs||renameNames(sources.map(p=>current.get(p)||fail('Source no longer exists.')),request.spec||{});
            if(pairs.length!==sources.length||new Set(pairs.map(p=>p.source)).size!==sources.length||pairs.some(p=>!sources.includes(p.source)))fail('Rename selection mismatch.');
        }else pairs=sources.map(source=>({source}));
        const occupied=new Set(current.keys());
        if(kind==='rename')for(const source of sources)occupied.delete(source);
        if(kind==='create'||kind==='import'){
            const input=kind==='create'?[{name:request.name,kind:request.directory?'directory':'file',content:'',mime:'text/plain'}]:request.files;
            if(!Array.isArray(input)||!input.length||input.length>LIMITS.entries)fail('Invalid import selection.');
            for(const f of input){const target=unique(join(request.destination,validName(f.name)),occupied);occupied.add(target);const content=f.content??'',size=f.kind==='directory'?0:typeof content==='string'?new Blob([content]).size:content.size;
                if(!Number.isFinite(size))fail('Invalid file content.');puts.set(target,{path:target,kind:f.kind==='directory'?'directory':'file',...(f.kind==='directory'?{}:{content,mime:f.mime||'application/octet-stream',size}),modified:stamp.time,revision:stamp.id()});results.push(target);}
        }
        for(const pair of pairs){
            const source=pair.source,entry=current.get(source);if(!entry)fail('Source no longer exists: '+source);
            if((kind!=='copy'&&system.has(source))||['/','/Local','/.Trash'].includes(source))fail('System folders cannot be changed.');
            if(kind==='restore'&&(parent(source)!=='/.Trash'||!entry.originalPath))fail('Select a Recycle Bin root item.');
            let target=pair.target;
            if(kind==='trash')target='/.Trash/'+stamp.id()+'_'+name(source);
            else if(kind==='restore'){const original=path(entry.originalPath);target=canParent(parent(original))?original:join('/Documents',name(original));}
            else if(!target)target=join(request.destination,name(source));
            path(target,kind==='trash');
            if(kind!=='trash')checkedParent(parent(target));
            if(source===target){if(kind==='copy')target=unique(target,occupied);else{results.push(target);continue;}}
            if(inside(target,source))fail('A folder cannot be placed inside itself.');
            if(kind==='rename'&&parent(target)!==parent(source))fail('Rename cannot change the parent folder.');
            const existing=occupied.has(target)?(puts.get(target)||current.get(target)):null;
            if(existing){
                conflicts.push({source,target,sourceKind:entry.kind,targetKind:existing.kind});
                const policy=request.policy||'ask';
                if(policy==='skip'){skipped.push(source);continue;}
                if(policy==='keep-both')target=unique(target,occupied);
                else if(policy==='replace'&&kind!=='rename'&&entry.kind==='file'&&existing.kind==='file'){
                    if(puts.has(target))fail('Two selected files cannot replace the same destination.');deletes.add(target);
                }else if(policy==='ask'){continue;}else fail('Folders and rename collisions cannot be replaced. Choose Keep both or Skip.');
            }
            if(kind==='rename'&&results.includes(target))fail('Two renamed items would use the same name.');
            const subtree=entries.filter(e=>inside(e.path,source));
            if(subtree.some(e=>e.path.startsWith('/Local/')))fail('Local mounts are not virtual file content.');
            if(kind!=='copy')subtree.forEach(e=>deletes.add(e.path));
            for(const old of subtree){const dest=target+old.path.slice(source.length),row={...old,path:dest,modified:stamp.time,revision:stamp.id()};
                if(kind==='trash'&&old.path===source){row.originalPath=source;row.deletedAt=stamp.time;}
                if(kind==='restore'){delete row.originalPath;delete row.deletedAt;}
                puts.set(dest,row);occupied.add(dest);
            }
            results.push(target);
        }
        if(conflicts.length&&(request.policy||'ask')==='ask')return {conflicts,results:[],puts:[],deletes:[],skipped};
        const affected=new Set([...deletes,...puts.keys()]),before=entries.filter(e=>affected.has(e.path));
        const bytes=[...puts.values()].reduce((n,e)=>n+(e.size||0),0)+before.reduce((n,e)=>n+(e.size||0),0);
        if(affected.size>LIMITS.entries||bytes>LIMITS.bytes)fail('Operation exceeds the 4,096-record / 64 MiB undo limit. Use smaller selections.');
        // Remove all sources first; this permits atomic rename swaps without data loss.
        for(const dest of puts.keys())if(current.has(dest)&&!deletes.has(dest))fail('Destination already exists: '+dest);
        const after=[...puts.values()];
        return {puts:after,deletes:[...deletes],before,after,roots:top([...affected]),results,skipped,conflicts,bytes,label:kind};
    }
    function reverse(entries,record,stamp){
        const live=entries.filter(e=>record.roots.some(p=>inside(e.path,p)));
        if(!equal(live,record.after))fail('These files changed after the operation. Undo/redo will not overwrite newer work.');
        const map=new Map(entries.map(e=>[e.path,e]));
        for(const row of record.before){const p=parent(row.path);if(p!=='/'&&map.get(p)?.kind!=='directory'&&!record.before.some(e=>e.path===p&&e.kind==='directory'))fail('The original parent folder was removed.');}
        const puts=record.before.map(e=>({...e,revision:stamp.id()}));
        return {puts,deletes:record.after.map(e=>e.path),before:record.after,after:puts,roots:record.roots,results:puts.map(e=>e.path),bytes:record.bytes,label:record.label};
    }
    const api=Object.freeze({LIMITS,path,name,parent,inside,validName,top,unique,same,equal,renameNames,plan,reverse});
    if(typeof module!=='undefined')module.exports=api;root.AsterFileOperations=api;
})(globalThis);
