/* Reusable, lifecycle-scoped browser webviews. Cross-origin pages remain isolated. MIT. */
'use strict';
(() => {
    const OS=Aster,N=AsterWebNavigation,M=AsterOrbitModels,live=new Set();
    const el=OS.el,btn=(label,fn)=>el('button',{type:'button',class:'secondary',text:label,onclick:OS.guard(fn)});
    class Webview {
        constructor(container,options={}) {
            if(!(container instanceof HTMLElement)||!options.owner||OS.windows.get(options.owner.id)!==options.owner||options.owner.closed)throw Error('A webview requires a container and a live Aster owner window.');
            if(live.size>=40)throw Error('Close an embedded view first (40 webviews maximum).');
            this.owner=options.owner;this.options=options;this.events=new EventTarget();this.history=[];this.index=-1;this.generation=0;this.request=0;this.disposed=false;
            this.state={url:'aster://home',reportedURL:'',title:'Webview',mode:'auto',route:'internal',status:'idle',zoom:1,dirty:null};
            this.element=el('section',{class:'aster-webview','aria-label':'Website view'});container.append(this.element);live.add(this);
            this.ownerCleanup=()=>this.dispose();this.owner.addCleanup(this.ownerCleanup);
            this.blur=()=>{clearTimeout(this.focusTimer);this.focusTimer=setTimeout(()=>{if(this.frame&&document.activeElement===this.frame&&!this.element.closest('[hidden]')&&!this.owner.minimized&&!this.disposed){OS.closePanels?.();this.owner.focus(false);}},0);};
            window.addEventListener('blur',this.blur);
            this.offline=()=>{if(this.message?.isConnected)this.message.textContent='Offline · remote pages may require a connection. Local HTML remains available.';};
            window.addEventListener('offline',this.offline);
        }
        get snapshot(){return Object.freeze({...this.state,canBack:this.index>0,canForward:this.index>=0&&this.index<this.history.length-1,hasFrame:!!this.frame});}
        on(name,fn){const listener=e=>fn(e.detail);this.events.addEventListener(name,listener);return()=>this.events.removeEventListener(name,listener);}
        emit(name){const detail=this.snapshot;this.events.dispatchEvent(new CustomEvent(name,{detail}));this.events.dispatchEvent(new CustomEvent('change',{detail}));}
        currentURL(){return this.state.reportedURL||this.state.url;}
        async canLeave(reason='Leave this page?') {
            if(!this.frame||this.disposed)return true;
            if(this.state.dirty===false||this.state.dirty===null&&!OS.orbit.data.preferences.confirmLeave)return true;
            if(!this.leavePending){
                this.leaveController=new AbortController();
                this.leavePending=OS.dialog({title:reason,message:this.state.dirty?'This page reports unsaved work. Save in the app before continuing.':'Aster cannot inspect unsaved work in this embedded page. Save your work before continuing.',confirm:'Continue',signal:this.leaveController.signal}).finally(()=>{this.leavePending=null;this.leaveController=null;});
            }
            return !!await this.leavePending&&!this.disposed;
        }
        async navigate(input,options={}) {
            if(this.disposed)throw Error('This webview has been disposed.');
            const url=N.address(input,false), request=++this.request;
            // Normalize before changing any existing page or requesting permission.
            if(!options.initial&&!await this.canLeave('Leave the embedded page?'))return false;
            if(this.disposed||request!==this.request)return false;
            this.history=M.push(this.history,this.index,url);this.index=this.history.length-1;
            return this.load(url,options);
        }
        async travel(delta){const i=this.index+delta;if(i<0||i>=this.history.length)return false;const request=++this.request;if(!await this.canLeave()||this.disposed||request!==this.request)return false;this.index=i;return this.load(this.history[i],{mode:this.state.mode,history:false});}
        back(){return this.travel(-1);}forward(){return this.travel(1);}
        async reload(){const request=++this.request;if(!await this.canLeave('Reload this page?')||this.disposed||request!==this.request)return false;return this.load(this.state.url,{mode:this.state.mode,history:false});}
        clearPage() {
            ++this.generation;clearTimeout(this.timer);this.timer=null;this.detachIO?.();this.detachIO=null;this.detachClipboard?.();this.detachClipboard=null;this.detachChild?.();this.detachChild=null;
            if(this.port){this.port.onmessage=null;this.port.close();this.port=null;}
            if(this.frame){const f=this.frame;this.frame=null;f.remove();f.removeAttribute('srcdoc');f.src='about:blank';}
            this.element.replaceChildren();this.message=null;
        }
        async stop(){const request=++this.request;if(!await this.canLeave('Stop and unload this page?')||this.disposed||request!==this.request)return false;this.clearPage();this.state.status='stopped';this.state.dirty=null;this.card('Page stopped','The embedded document was unloaded. Reload to request it again.');this.emit('stop');return true;}
        external(kind='tab') {
            const url=M.webURL(this.currentURL());
            // noopener deliberately makes the result unavailable: null does NOT prove blocking.
            // There is no retained cross-origin Window proxy or simulated remote-browser control.
            if(!navigator.userActivation?.isActive){this.state.status='awaiting-gesture';if(this.message)this.message.textContent='Choose Open in browser to allow a new tab. Automatic pop-ups are not requested.';this.emit('status');return false;}
            window.open(url,'_blank',kind==='window'?'noopener,noreferrer,popup,width=1100,height=760':'noopener,noreferrer');
            this.state.status='external-requested';if(this.message)this.message.textContent='Opening requested. Check your browser tabs or pop-up blocker. Orbit cannot inspect that page.';this.emit('external');return true;
        }
        externalLinks(parent) {
            const url=this.currentURL();if(!/^https?:/.test(url))return;
            const a=el('a',{class:'primary orbit-external-link',href:url,target:'_blank',rel:'noopener noreferrer',text:'Open in browser ↗'});
            const popup=btn('Open browser window',()=>this.external('window'));parent.append(a,popup);
            a.addEventListener('click',()=>{this.state.status='external-requested';if(this.message)this.message.textContent='Opening requested. Check your browser tabs or pop-up blocker. Orbit cannot inspect that page.';this.emit('external');});
        }
        card(title,description) {
            const card=el('div',{class:'orbit-handoff'},el('span',{class:'orbit-handoff-icon',html:OS.icon('globe',36)}),el('div',{class:'orbit-eyebrow',text:'ORBIT · WEBSITE HANDOFF'}),el('h2',{text:title}),el('p',{text:description}));
            const url=el('code',{class:'orbit-handoff-url',text:this.state.url}),actions=el('div',{class:'orbit-handoff-actions'});this.externalLinks(actions);
            if(/^https?:/.test(this.state.url))actions.append(btn('Try embedded webview',()=>this.load(this.state.url,{mode:'webview'})));
            this.message=el('p',{class:'orbit-view-status',role:'status',text:'Browser tabs run outside Aster. Use the browser’s own navigation, sign-in and downloads there.'});
            card.append(url,actions,this.message);this.element.append(card);
        }
        async load(input,options={}) {
            const url=N.address(input,false);if(this.disposed)return false;
            if(options.history!==false){this.history=M.push(this.history,this.index,url);this.index=this.history.length-1;}
            const mode=options.mode||this.state.mode||'auto', route=M.route(url,mode,OS.orbit.data.routes,OS.webCatalog?.apps||[],location.protocol);
            this.clearPage();const generation=this.generation, valid=()=>!this.disposed&&generation===this.generation;
            this.state={...this.state,url,reportedURL:'',title:url.startsWith('aster:')?'Local document':new URL(url).hostname,mode,route:route.mode,status:'loading',dirty:null};
            this.emit('navigation');
            if(route.mode==='browser'||options.restored&&/^https?:/.test(url)) {
                this.state.status=options.restored?'restored':'external';
                this.card(options.restored?'Your saved address is ready':'Open this website in your browser',options.restored?'Restoring a session does not contact saved websites or open pop-ups. Choose how to open this page.':route.reason+' Google, sign-in pages and other sites may forbid embedding.');
                if(options.external===true)this.external();this.emit('status');return true;
            }
            const note=el('div',{class:'orbit-view-toolbar browser-note'}),content=el('div',{class:'orbit-frame-viewport'});
            this.message=el('span',{class:'orbit-view-status',role:'status',text:'Loading embedded document…'});note.append(this.message);
            this.externalLinks(note);
            if(/^https?:/.test(url))note.append(btn('Page not visible?',async()=>{if(await this.canLeave('Switch to browser handoff?')&&valid())await this.load(this.state.url,{mode:'browser'});}));
            this.element.append(note,content);
            const local=url.startsWith('aster://file/'),policy=(local||this.options.isolated===true)?{trusted:false,sandbox:'allow-scripts allow-forms allow-modals allow-downloads',allow:'fullscreen'}:N.framePolicy(url,OS.webCatalog?.apps||[]);
            const frame=el('iframe',{class:'browser-iframe',title:this.state.title,sandbox:policy.sandbox,allow:policy.allow,allowfullscreen:true,referrerpolicy:'no-referrer'});
            frame.dataset.browserPolicy=policy.trusted?'reviewed-app':'isolated';this.frame=frame;this.setZoom(this.state.zoom);
            let html=null;
            try {
                if(local){const path=decodeURIComponent(url.slice('aster://file'.length)),file=await OS.fs.read(path);if(!valid())return false;if(file.kind!=='file'||file.size>M.LIMITS.html)throw Error('Choose a local HTML file under 5 MiB.');html=await OS.fs.text(file);if(!valid())return false;if(new Blob([html]).size>M.LIMITS.html)throw Error('The local HTML file exceeds 5 MiB.');this.state.title=OS.fs.name(path);frame.title=this.state.title;note.append(btn('Edit source',()=>OS.launch('notepad',{path})));}
                else if(route.mode==='internal')throw Error('This webview accepts HTTP(S) addresses or aster://file paths.');
                if(!valid())return false;
                frame.addEventListener('load',()=>{
                    if(!valid()||this.frame!==frame)return;clearTimeout(this.timer);this.timer=null;
                    this.state.status='unverified';this.message.textContent=local?'Local HTML · isolated sandbox':'Webview requested · sites may forbid embedding. Cross-origin page visibility is not verifiable.';
                    this.attachPresentation(frame,url,generation);
                    this.detachChild?.();this.detachChild=null;
                    // A readable trusted document is stronger evidence than the iframe load event.
                    if(policy.trusted)try{const doc=frame.contentDocument;if(doc&&/^https?:/.test(doc.URL)){
                        this.state.status='readable';this.state.title=M.text(doc.title,160)||new URL(doc.URL).hostname;
                        if(new URL(doc.URL).origin===new URL(url).origin)this.state.reportedURL=M.webURL(doc.URL);
                        const focus=()=>{if(valid()){OS.closePanels?.();this.owner.focus(false);}};
                        const key=e=>{if(OS.input.blocked(e))return;if((e.ctrlKey||e.metaKey)&&!e.altKey&&['l','t'].includes(e.key.toLowerCase())){this.owner.onKey?.(e);}};
                        doc.addEventListener('pointerdown',focus,true);doc.addEventListener('focusin',focus,true);doc.addEventListener('keydown',key,true);
                        this.detachChild=()=>{doc.removeEventListener('pointerdown',focus,true);doc.removeEventListener('focusin',focus,true);doc.removeEventListener('keydown',key,true);};
                    }}catch{ }
                    this.emit('load');
                });
                this.timer=setTimeout(()=>{if(valid()){this.state.status='unverified';this.message.textContent='Still waiting. A blank page may indicate a framing policy or connection problem. Use Open in browser; this is not a reliable error detector.';this.emit('status');}},12000);
                if(local)frame.srcdoc=OS.webIO?OS.webIO.bootstrap(html):html;else frame.src=url;
                this.detachClipboard=OS.clipboardTools.attachFrame(frame,this.owner);
                content.append(frame);
                const catalog=local||this.options.isolated===true?null:N.catalogApp(url,OS.webCatalog?.apps||[]);
                if(local||catalog)this.detachIO=OS.webIO?.attach(this.owner,frame,local?(this.options.appId||'local-html'):catalog.id,local?'about:srcdoc':url,local);
                else if(OS.webIO) {
                    const connect=btn('Connect Aster files',async()=>{
                        const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(new URL(url).origin)));
                        if(!valid())return;this.detachIO?.();this.detachIO=OS.webIO.attach(this.owner,frame,this.options.appId||'site-'+Array.from(hash,x=>x.toString(16).padStart(2,'0')).join(''),url,true);connect.disabled=true;connect.textContent='Awaiting Files SDK';
                    });note.append(connect);
                }
                this.emit('status');return true;
            }catch(e){if(!valid())return false;this.clearPage();this.state.status='error';this.state.dirty=null;this.card('Unable to open this document',e.message);this.emit('error');return false;}
        }
        attachPresentation(frame,url,generation) {
            if(this.port){this.port.close();this.port=null;}
            const channel=new MessageChannel();this.port=channel.port1;
            let count=0,epoch=Date.now();
            channel.port1.onmessage=e=>{
                if(this.disposed||generation!==this.generation||frame!==this.frame)return;
                if(Date.now()-epoch>=1000){count=0;epoch=Date.now();}if(++count>30)return;
                const r=e.data;if(!r||r.type!=='aster-webview-state'||r.version!==1)return;
                if(typeof r.title==='string')this.state.title=M.text(r.title,160)||this.state.title;
                // The page may describe only its own origin. It cannot navigate the host,
                // add a history entry, invoke APIs, change sandbox policy or grant files.
                if(typeof r.url==='string'&&/^https?:/.test(url))try{const next=M.webURL(r.url);if(new URL(next).origin===new URL(url).origin)this.state.reportedURL=next;}catch{ }
                if(typeof r.dirty==='boolean')this.state.dirty=r.dirty;
                for(const a of this.element.querySelectorAll('a.orbit-external-link'))a.href=this.currentURL();
                this.state.status='cooperative';this.message.textContent='Connected webview · address/title and unsaved state are reported by the page';this.emit('presentation');
            };
            try{frame.contentWindow.postMessage({type:'aster-webview-init',version:1},'*',[channel.port2]);}catch{channel.port1.close();channel.port2.close();this.port=null;}
        }
        setZoom(value){this.state.zoom=M.zoom(value);if(this.frame){const z=this.state.zoom;this.frame.style.width=(100/z)+'%';this.frame.style.height=(100/z)+'%';this.frame.style.transform=`scale(${z})`;this.frame.style.transformOrigin='0 0';}this.emit('zoom');return this.state.zoom;}
        dispose(){if(this.disposed)return;this.disposed=true;this.request++;this.leaveController?.abort();this.clearPage();clearTimeout(this.focusTimer);window.removeEventListener('blur',this.blur);window.removeEventListener('offline',this.offline);this.element.remove();live.delete(this);if(!this.owner.closed){const i=this.owner.cleanups.indexOf(this.ownerCleanup);if(i>=0)this.owner.cleanups.splice(i,1);}this.state.status='disposed';this.emit('dispose');}
    }
    // The API takes no user-supplied sandbox, scripts, headers, credentials or native bridge.
    OS.webviews=Object.freeze({create:(container,options)=>{const view=new Webview(container,options);view.request=0;return view;},get activeCount(){return live.size;}});
})();
