/* App Center: local installation, discover/library views and editable details. MIT. */
'use strict';
(() => {
    const OS=Aster, M=AsterAppLibraryModels, lib=OS.appLibrary;
    const el=OS.el, button=(text,fn,primary=false)=>el('button',{type:'button',class:primary?'primary':'secondary',text,onclick:OS.guard(fn)});
    const categories=()=>['Your apps',...OS.webCatalog.categories.map(c=>c.title)];
    const input=(name,value,max,tag='input')=>el(tag,{'aria-label':name,name,value:value||'',maxlength:max,autocomplete:'off'});
    let activeEditor=null;
    function editDialog(initial,title,confirm,commit,subtitle='') {
        if(activeEditor) { activeEditor.focus();return Promise.resolve(null); }
        return new Promise(resolve=>{
            const previous=document.activeElement, cover=el('div',{class:'dialog-backdrop'}), dialog=el('section',{class:'dialog library-dialog',role:'dialog','aria-modal':'true','aria-label':title,tabindex:'-1'});
            const form=el('form',{class:'library-form'}), header=el('header',{class:'library-dialog-heading'},el('span',{html:OS.icon('store',26)}),el('div',{},el('h2',{text:title}),el('p',{text:subtitle||'Details are saved only in this Aster browser profile.'})));
            const fields=el('div',{class:'library-fields'}), controls={};
            function field(key,label,max,tag='input',wide=false) {
                const node=input(label,initial[key],max,tag);if(key==='title')node.required=true;
                if(tag==='textarea'){node.value=initial[key]||'';node.rows=3;}
                const wrap=el('label',{class:'library-field'+(wide?' wide':'')},el('span',{text:label}),node);fields.append(wrap);controls[key]=node;return node;
            }
            field('title','App name',60,'input',true);
            field('description','Description',500,'textarea',true);
            if(initial.kind==='url')field('url','Website address',2048,'input',true);
            const cat=el('select',{'aria-label':'Category'});for(const value of [...new Set([...categories(),initial.category||'Your apps'])])cat.append(el('option',{value,text:value,selected:value===(initial.category||'Your apps')}));
            fields.append(el('label',{class:'library-field'},el('span',{text:'Category'}),cat));controls.category=cat;
            field('publisher','Publisher (self-reported)',80);field('version','Version (self-reported)',40);
            const appearance=el('div',{class:'library-appearance'}), icon=el('select',{'aria-label':'Icon'}), color=el('select',{'aria-label':'Icon color'});
            for(const value of M.ICONS)icon.append(el('option',{value,text:value,selected:value===(initial.icon||'code')}));
            for(const value of M.COLORS)color.append(el('option',{value,text:value,selected:value===(initial.color||'violet')}));
            appearance.append(icon,color);fields.append(el('label',{class:'library-field'},el('span',{text:'Icon and color'}),appearance));controls.icon=icon;controls.color=color;
            const favorite=el('input',{type:'checkbox',checked:initial.favorite===true,'aria-label':'Favorite'});fields.append(el('label',{class:'library-checkbox wide'},favorite,el('span',{text:'Keep in Favorites'})));
            const note=el('p',{class:'library-safety',text:initial.kind==='url'?'Only HTTPS links are accepted. A saved link is not an offline download. Sites can refuse embedding; this never bypasses browser protections.':'Self-contained HTML only, up to 5 MiB. The app runs in a sandbox, but can make network requests. Install only code you trust. No code is executed while editing these details.'});
            const error=el('p',{class:'library-error',role:'alert',hidden:true}), actions=el('div',{class:'dialog-actions'}), cancel=button('Cancel',()=>finish(null)), save=el('button',{type:'submit',class:'primary',text:confirm});
            actions.append(cancel,save);form.append(header,fields,note,error,actions);dialog.append(form);cover.append(dialog);document.querySelector('#dialog-layer').append(cover);activeEditor=dialog;OS.emit('window-action',{action:'SystemQuestion'});
            let done=false,busy=false;
            function finish(value) { if(done||busy)return;done=true;cover.remove();activeEditor=null;if(previous?.isConnected)previous.focus();resolve(value); }
            form.onsubmit=async e=>{
                e.preventDefault();if(busy||!form.reportValidity())return;error.hidden=true;
                const values={...initial,favorite:favorite.checked};for(const [key,node] of Object.entries(controls))values[key]=node.value;
                if(!values.title.trim()){error.textContent='An app name is required.';error.hidden=false;controls.title.focus();return;}
                try { if(values.kind==='url')M.url(values.url.trim());busy=true;save.disabled=true;cancel.disabled=true;save.textContent='Saving…';const result=await commit(values);busy=false;finish(result); }
                catch(e){busy=false;save.disabled=false;cancel.disabled=false;save.textContent=confirm;error.textContent=e.message||String(e);error.hidden=false;}
            };
            cover.onkeydown=e=>{
                e.stopPropagation();if(e.key==='Escape'){e.preventDefault();finish(null);}
                if(e.key==='Tab') { const nodes=[...dialog.querySelectorAll('input,textarea,select,button')].filter(n=>!n.disabled),i=nodes.indexOf(document.activeElement);if(!nodes.length){e.preventDefault();return;}if(i<0||e.shiftKey&&i===0||!e.shiftKey&&i===nodes.length-1){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0].focus();} }
            };
            queueMicrotask(()=>{if(!done){controls.title.focus();controls.title.select();}});
        });
    }
    OS.installHTML=async()=>{
        const [file]=await OS.readFile('.html,.htm,.asterapp,text/html,application/json');if(!file)return;
        // JSON can escape each code point; bound both the container and decoded HTML.
        const packaged=/\.asterapp$/i.test(file.name);if(file.size>(packaged?32:5)*1024*1024)throw Error(packaged?'App package exceeds 32 MiB.':'HTML apps are limited to 5 MiB.');
        const body=await file.text(), unpacked=packaged?M.unpack(JSON.parse(body)):null;
        const details=unpacked?.details||{kind:'html',title:file.name.replace(/\.[^.]+$/,''),description:'',category:'Your apps',icon:'code',color:'violet'};
        const result=await editDialog(details,'Install HTML app','Install',v=>lib.install(v,unpacked?unpacked.source:body),'Review the app details before installing.');
        if(result)OS.notify('App installed in Aster',result.title,'info',{label:'Open app',fn:()=>OS.launch(result.id)});
        return result;
    };
    OS.installWebLink=()=>editDialog({kind:'url',title:'',description:'',url:'https://',category:'Your apps',icon:'globe',color:'teal'},'Add web app','Add app',v=>lib.install({...v,url:v.url.trim()}),'Save an HTTPS web shortcut in your local library.');
    OS.editInstalledApp=async id=>{const r=lib.get(id);if(!r)throw Error('App not installed.');return editDialog(structuredClone(r),'Edit app details','Save changes',v=>lib.save({...v,url:v.url?.trim()},r.revision));};
    // Code Studio's saved source goes through exactly the same metadata dialog and transaction.
    OS.installProjectApp=async(path,title)=>{
        const existing=OS.customApps.find(a=>a.path===path);if(existing)return OS.editInstalledApp(existing.id);
        const source=await OS.fs.text(await OS.fs.read(path));
        return editDialog({kind:'html',title,description:'',category:'Your apps',icon:'code',color:'violet'},'Add app to Start','Install',v=>lib.install(v,source),'A copy of the saved project is installed. Your project stays unchanged.');
    };
    OS.replaceInstalledHTML=async id=>{
        const r=lib.get(id);if(!r||r.kind!=='html')throw Error('Select an installed HTML app.');
        const [file]=await OS.readFile('.html,.htm,text/html');if(!file)return;if(file.size>M.LIMITS.html)throw Error('HTML apps are limited to 5 MiB.');
        const source=await file.text();
        if(!await OS.confirm('Update '+r.title+'?','The replacement is used on the next launch. Running windows and their unsaved content are not reloaded. The previous source remains at '+r.path+'.','Update package'))return;
        const result=await lib.replace(id,source,r.revision);OS.notify('App package updated','Reopen '+r.title+' to use the update. The previous HTML source was kept.');return result;
    };
    const pendingRemovals=new Map();
    OS.uninstallApp=id=>{
        if(pendingRemovals.has(id))return pendingRemovals.get(id);
        const work=(async()=>{
            const r=lib.get(id);if(!r)return false;
            if(!await OS.confirm('Remove '+r.title+'?', 'Remove this launcher from the library and Start. Running windows will ask you to save first. '+(r.kind==='html'?'The HTML source stays at '+r.path+'. ':'')+'Your documents and app storage are kept.','Remove',true))return false;
            // A cancelled window close cancels removal, rather than force-closing work.
            for(const w of [...OS.windows.values()].filter(w=>w.appId===id))if(await w.close()===false)return false;
            return lib.remove(id,r.revision);
        })();pendingRemovals.set(id,work);work.finally(()=>pendingRemovals.delete(id)).catch(()=>{});return work;
    };
    OS.showAppDetails=id=>{const w=OS.openApp('store',{app:id,view:lib.get(id)?'installed':'discover'});w.ready.then(()=>w.navigateApp?.(id));return w;};
    OS.register('store',{title:'App Center',description:'Discover web apps and manage your local app library.',category:'System',width:1060,height:740,minWidth:370,singleton:true,mount:async(w,options)=>{
        let view=options.mode||options.view||w.state.libraryView||'discover', selected=options.app||null, query='',category='',order='name';
        const shell=el('div',{class:'library-shell'}),nav=el('nav',{class:'library-nav','aria-label':'App Center sections'}),main=el('main',{class:'library-main'});
        const brand=el('div',{class:'library-brand'},el('span',{html:OS.appIcon('store',36)}),el('div',{},el('strong',{text:'App Center'}),el('small',{text:'YOUR LOCAL LIBRARY'})));
        const tabs=el('div',{class:'library-tabs'}), stats=el('p',{class:'library-local-note',text:'Local to this browser. No account, ratings, or automatic app updates.'});nav.append(brand,tabs,stats);
        const head=el('header',{class:'library-header'}), title=el('h1'),search=input('Search apps','',200);search.placeholder='Search apps, descriptions, publishers…';search.type='search';
        const install=button('Install HTML app',OS.installHTML,true),web=button('Add web app',OS.installWebLink);head.append(title,el('div',{class:'library-install-actions'},web,install));
        const tools=el('div',{class:'library-tools'}),categoriesSelect=el('select',{'aria-label':'Filter category'}),sort=el('select',{'aria-label':'Sort apps'});
        sort.append(el('option',{value:'name',text:'Name A–Z'}),el('option',{value:'updated',text:'Recently updated'}),el('option',{value:'installed',text:'Recently installed'}));
        tools.append(search,categoriesSelect,sort);const body=el('div',{class:'library-content'});main.append(head,tools,body);shell.append(nav,main);w.body.append(shell);
        const labels={discover:'Discover',installed:'Installed',favorites:'Favorites',builtin:'Built-in apps'};
        const selectView=next=>{view=next;selected=null;w.state.libraryView=view;OS.saveSession();render();};
        const nodes=new Map();for(const [id,label] of Object.entries(labels)){const b=button(label,()=>selectView(id));b.className='library-tab';tabs.append(b);nodes.set(id,b);}
        function resultApps(){const all=[...OS.apps.values()].filter(a=>!a.hidden);return all.filter(a=>view==='discover'?a.webApp:view==='builtin'?!a.webApp&&!a.custom:view==='favorites'?lib.get(a.id)?.favorite:a.custom).map(a=>({...a,...(lib.get(a.id)||{})}));}
        const action=(text,fn)=>button(text,async()=>{await fn();if(!w.closed)render();});
        function renderDetails(app){
            const r=lib.get(app.id),detail=el('article',{class:'library-detail','data-app-detail':app.id});
            detail.append(button('Back to '+labels[view],()=>{selected=null;render();}),el('div',{class:'library-detail-header'},el('span',{html:OS.appIcon(app.id,72)}),el('div',{},el('div',{class:'library-badge',text:r?(r.kind==='html'?'INSTALLED HTML APP':'SAVED WEB LINK'):app.webApp?'HOSTED CATALOG APP':'BUILT-IN APP'}),el('h2',{text:app.title}),el('p',{text:app.category}))));
            const actions=el('div',{class:'library-detail-actions'},button('Open',()=>OS.launch(app.id),true));
            if(r)actions.append(action('Edit details',()=>OS.editInstalledApp(r.id)),action(r.favorite?'Remove favorite':'Add to favorites',()=>lib.save({...r,favorite:!r.favorite},r.revision)),action('Export app package',()=>lib.export(r.id)));
            actions.append(action(OS.pins.includes(app.id)?'Unpin from taskbar':'Pin to taskbar',()=>OS.togglePin(app.id)),action(OS.startPins?.includes(app.id)?'Unpin from Start':'Pin to Start',()=>OS.toggleStartPin(app.id)),action('Desktop shortcut',()=>OS.addDesktopShortcut(app.id)));
            detail.append(actions,el('section',{class:'library-detail-section'},el('h3',{text:'About this app'}),el('p',{class:'library-description',text:app.description||'No description added.'})));
            const facts=el('dl',{class:'library-facts'});function fact(key,value){facts.append(el('dt',{text:key}),el('dd',{text:value||'Not specified'}));}
            fact('Category',app.category);fact('Source',r?.path||r?.url||app.url||'Included with Aster');
            if(r){fact('Publisher',r.publisher);fact('Version',r.version);fact('Installed',r.installedAt?new Date(r.installedAt).toLocaleString():'Before library upgrade');fact('Updated',r.updatedAt?new Date(r.updatedAt).toLocaleString():'Not recorded');fact('Storage',OS.db.mode);}
            detail.append(facts);
            if(r?.kind==='html'){
                detail.append(el('div',{class:'library-detail-actions'},action('Replace HTML',()=>OS.replaceInstalledHTML(r.id)),button('Open source folder',()=>OS.launch('files',{path:OS.fs.parent(r.path)}))));
                const health=el('p',{class:'library-source-status',role:'status',text:'Checking source…'});detail.append(health);
                OS.fs.stat(r.path).then(f=>{if(health.isConnected)health.textContent=f?.kind==='file'?'Local package · '+OS.formatBytes(f.size||0)+' · '+[...OS.windows.values()].filter(x=>x.appId===r.id).length+' running window(s).':'Source is missing. Replace HTML or restore the source file before opening.';}).catch(e=>{if(health.isConnected)health.textContent=e.message;});
            }
            if(app.webApp){const entry=OS.webCatalog.apps.find(a=>a.id===app.id);detail.append(el('a',{class:'library-source-link',href:entry.repository,target:'_blank',rel:'noopener noreferrer',text:'View source repository'}));}
            detail.append(el('p',{class:'library-safety',text:r?'Imported apps and web links stay in an opaque sandbox. HTML apps can request scoped Aster file access through the existing broker. Web links do not gain file access automatically. Publisher and version are self-reported.':app.webApp?'Catalog apps load from reviewed project URLs when opened. They are not downloaded into this library. Trusted same-origin catalog apps retain their existing permissions; browser checks still apply.':'This app is supplied with Aster. Update Aster to update built-in apps.'}));
            if(r)detail.append(action('File access settings',()=>OS.launch('settings',{section:'webfiles'})),action('Revoke file access',()=>OS.webIO.revoke(r.id)),action('Remove app',async()=>{if(await OS.uninstallApp(r.id))selected=null;}));
            body.replaceChildren(detail);
        }
        function render(){
            if(w.closed)return;title.textContent=labels[view]||'Discover';for(const [id,node] of nodes){node.classList.toggle('active',id===view);node.setAttribute('aria-current',id===view?'page':'false');}
            const all=resultApps(),catValues=[...new Set(all.map(a=>a.category))].sort();
            categoriesSelect.replaceChildren(el('option',{value:'',text:'All categories'}),...catValues.map(value=>el('option',{value,text:value})));if(!catValues.includes(category))category='';categoriesSelect.value=category;
            const app=selected&&OS.apps.get(selected);if(app){renderDetails(app);return;}selected=null;
            const results=M.sort(all.filter(a=>(!category||a.category===category)&&M.matches(a,query)),order),content=el('div');
            if(!query&&!category&&view==='discover')content.append(el('section',{class:'library-hero'},el('div',{},el('div',{class:'library-eyebrow',text:'MAKE ROOM FOR WHAT YOU CREATE'}),el('h2',{text:'Your next workspace starts here.'}),el('p',{text:'Explore '+OS.webCatalog.apps.length+' web apps for design, engineering and everyday work. Open in Aster, or bring your own.'})),el('div',{class:'library-hero-count'},el('strong',{text:String(OS.webCatalog.apps.length)}),el('span',{text:'curated web apps'}))));
            const count=el('div',{class:'library-results',role:'status'},el('strong',{text:results.length+' apps'}),el('span',{text:view==='installed'?OS.customApps.length+' / '+M.LIMITS.apps+' installed · '+OS.db.mode:view==='discover'?'Hosted separately · loaded on demand':'Available in this browser'}));content.append(count);
            if(lib.rejected.length&&view==='installed')content.append(el('p',{class:'library-safety',role:'status',text:lib.rejected.length+' invalid or duplicate saved entries were not registered. The original saved list remains in your backup until you make a library change.'}));
            const grid=el('div',{class:'library-grid'});for(const app of results){const r=lib.get(app.id),card=el('article',{class:'library-card','data-library-app':app.id});
                const details=button(app.title,()=>{selected=app.id;render();});details.className='library-card-title';
                card.append(el('div',{class:'library-card-top'},el('span',{html:OS.appIcon(app.id,44)}),el('span',{class:'library-tag',text:r?r.kind==='html'?'HTML app':'Web link':app.webApp?'Web app':'Built-in'})),details,el('p',{class:'library-card-description',text:app.description||'No description added.'}),el('small',{text:app.category}));
                card.append(el('div',{class:'library-card-actions'},button('Open',()=>OS.launch(app.id)),button('Details',()=>{selected=app.id;render();})));grid.append(card);}
            content.append(grid);if(!results.length)content.append(el('section',{class:'library-empty'},el('span',{html:OS.icon(view==='favorites'?'pin':'store',44)}),el('h2',{text:query||category?'No matching apps':view==='favorites'?'Keep your favorites close':'Make this library yours'}),el('p',{text:query||category?'Try a different search or category.':'Install a self-contained HTML app or add an HTTPS web shortcut. Your files stay in this browser.'}),...(view==='installed'?[button('Install your first app',OS.installHTML,true)]:[])));
            body.replaceChildren(content);
        }
        w.navigate=next=>{if(labels[next])selectView(next);};
        w.navigateApp=id=>{selected=id;view=lib.get(id)?'installed':OS.apps.get(id)?.webApp?'discover':'builtin';render();};
        search.oninput=()=>{query=search.value;selected=null;render();};categoriesSelect.onchange=()=>{category=categoriesSelect.value;selected=null;render();};sort.onchange=()=>{order=sort.value;render();};
        // Preserve focus when registry changes rebuild a card/detail, never the form.
        let scheduled=false;w.on('apps',()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(w.closed)return;const focus=body.contains(document.activeElement)?document.activeElement.textContent:null;render();if(focus)[...body.querySelectorAll('button')].find(b=>b.textContent===focus)?.focus({preventScroll:true});});});
        render();
    }});
})();
