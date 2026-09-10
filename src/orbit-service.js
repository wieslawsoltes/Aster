/* Shared Orbit bookmarks/preferences and OS link routing. MIT. */
'use strict';
(() => {
    const OS=Aster, M=AsterOrbitModels, KEY='orbit-v1', clone=v=>structuredClone(v);
    let queue=Promise.resolve(), initialization=null, data=M.normalize(null);
    const service=OS.orbit={
        get data(){return clone(data);},
        initialize(){return initialization ||= OS.ready.then(async()=>{data=M.normalize(await OS.db.get(KEY));return service.data;}).catch(e=>{initialization=null;throw e;});},
        mutate(fn){
            const job=queue.catch(()=>{}).then(async()=>{
                await this.initialize();let next;
                const apply=stored=>{const draft=M.normalize(stored);fn(draft);return M.normalize(draft);};
                if(OS.db.memory){next=apply(OS.db.memory.meta.get(KEY));OS.db.memory.meta.set(KEY,clone(next));}
                else await new Promise((resolve,reject)=>{
                    let error;const tx=OS.db.db.transaction('meta','readwrite'),store=tx.objectStore('meta'),q=store.get(KEY);
                    q.onsuccess=()=>{try{next=apply(q.result);store.put(next,KEY);}catch(e){error=e;tx.abort();}};
                    tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('Orbit preferences were not saved.'));
                });
                data=next;OS.emit('orbit-data',this.data);return this.data;
            });queue=job;return job;
        },
        preferences(patch){return this.mutate(d=>{d.preferences=M.preferences({...d.preferences,...patch});});},
        bookmark(url,title){url=M.webURL(url);return this.mutate(d=>{const old=d.bookmarks.find(b=>b.url===url);if(old)old.title=M.text(title,160)||old.title;else{if(d.bookmarks.length>=M.LIMITS.bookmarks)throw Error('Remove a bookmark first (200 maximum).');d.bookmarks.push({url,title});}});},
        removeBookmark(url){return this.mutate(d=>{d.bookmarks=d.bookmarks.filter(b=>b.url!==url);});},
        record(url,title){if(!/^https?:/.test(url))return Promise.resolve();url=M.webURL(url);return this.mutate(d=>{if(d.preferences.recordHistory)d.history=[{url,title,time:Date.now()},...d.history.filter(h=>h.url!==url)].slice(0,M.LIMITS.history);});},
        clearHistory(){return this.mutate(d=>{d.history=[];});},
        siteRoute(url,mode){const origin=new URL(M.webURL(url)).origin;return this.mutate(d=>{d.routes=d.routes.filter(r=>r.origin!==origin);if(mode!=='auto'){if(!['browser','webview','native'].includes(mode))throw Error('Unknown site opening preference.');if(d.routes.length>=M.LIMITS.routes)throw Error('Remove a site preference first (100 maximum).');d.routes.push({origin,mode});}});},
        async exportBookmarks(){await this.initialize();OS.download(new Blob([JSON.stringify({format:'aster.bookmarks',version:1,bookmarks:data.bookmarks},null,2)],{type:'application/json'}),'Orbit-bookmarks.json');},
        async importBookmarks(){const [file]=await OS.readFile('.json,application/json');if(!file)return;if(file.size>1024*1024)throw Error('Bookmark imports are limited to 1 MiB.');const raw=JSON.parse(await file.text());if(raw.format!=='aster.bookmarks'||raw.version!==1||!Array.isArray(raw.bookmarks)||raw.bookmarks.length>M.LIMITS.bookmarks)throw Error('Not a supported Orbit bookmarks file.');for(const r of raw.bookmarks)M.webURL(r.url);const entries=M.normalize(raw).bookmarks;if(!await OS.confirm('Import bookmarks?',entries.length+' links will be added locally. No website will be opened.','Import'))return;return this.mutate(d=>{const merged=new Map(d.bookmarks.map(b=>[b.url,b]));for(const b of entries)merged.set(b.url,b);if(merged.size>M.LIMITS.bookmarks)throw Error('The merged bookmarks exceed 200 entries.');d.bookmarks=[...merged.values()];});},
        async saveShortcut(url,title){url=M.webURL(url);const name=M.text(title,80).replace(/[\\/:*?"<>|]/g,'_')||'Website';const path=await OS.prompt('Save website shortcut','/Documents/'+name+'.asterlink','Save');if(path===null)return;if(!/\.asterlink$/i.test(path))throw Error('Use the .asterlink extension.');if(await OS.fs.stat(path)&&!await OS.confirm('Replace shortcut?',path,'Replace',true))return;await OS.fs.write(path,JSON.stringify({format:'aster.link',version:1,url,title:M.text(title,160)},null,2),'application/x-aster-link+json');OS.notify('Website shortcut saved',path);return path;},
        // Data-only backup. Deliberately excludes browsing history and restores no grants.
        async backup(){await this.initialize();return {bookmarks:clone(data.bookmarks)};},
        restore(raw){const entries=M.normalize(raw).bookmarks;return this.mutate(d=>{const merged=new Map(d.bookmarks.map(b=>[b.url,b]));for(const b of entries)merged.set(b.url,b);if(merged.size>M.LIMITS.bookmarks)throw Error('Restored bookmarks exceed the 200-entry limit.');d.bookmarks=[...merged.values()];});},
        async open(input,options={}){
            await this.initialize();
            const url=M.address(input,data.preferences.engine);
            const existing=!options.newWindow&&[...OS.windows.values()].reverse().find(w=>w.appId==='browser'&&!w.closed&&!w.state.webview&&w.desktop===OS.activeDesktop);
            if(existing){await existing.ready;if(!existing.closed){existing.restore();await existing.openTab(url,{mode:options.mode||'auto'});return existing;}}
            const w=OS.launch('browser',{url,mode:options.mode||'auto'});await w.ready;return w;
        }
    };
    OS.openURL=(input,options)=>service.open(input,options);
    OS.openWebview=(input,options={})=>{
        const url=AsterWebNavigation.address(input,false);
        // A normal OS window with a single-page view; no iframe/host sandbox bypass.
        return OS.launch('browser',{url,mode:'webview',webview:true,compact:options.compact===true});
    };
})();
