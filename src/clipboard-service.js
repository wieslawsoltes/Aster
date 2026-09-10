/* Native-first clipboard service. No polling, automatic host reads or silent fallbacks. MIT. */
'use strict';
(() => {
    const OS=Aster,M=AsterInputModels;
    Object.assign(OS.settings,M.DEFAULTS);
    const privateSelector='[data-private],input[type="password"],[autocomplete~="one-time-code" i],[autocomplete*="cc-" i],[autocomplete~="current-password" i],[autocomplete~="new-password" i]';
    const ownUI=e=>!!e?.closest?.('[data-clipboard-ui],[data-app="clipboard"]');
    const privateField=e=>{for(let n=e;n;n=n.getRootNode?.().host){if(n.closest?.(privateSelector))return true;}return false;};
    const privateSelection=doc=>{const selection=doc.getSelection();if(!selection?.rangeCount)return false;const range=selection.getRangeAt(0),root=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;if(privateField(root))return true;return [...(root?.querySelectorAll?.(privateSelector)||[])].some(node=>range.intersectsNode(node));};
    const editable=e=>!!e&&(e.matches?.('textarea,input:not([type]),input[type="text"],input[type="search"],input[type="url"],input[type="tel"],input[type="email"],input[type="password"],input[type="number"]')||e.isContentEditable||!!e.closest?.('[role="textbox"]'));
    const deepActive=(doc=document)=>{let e=doc.activeElement;while(e?.shadowRoot?.activeElement)e=e.shadowRoot.activeElement;return e;};
    OS.input={preferences:()=>M.preferences(OS.settings),platform:()=>M.profile(OS.settings,navigator.userAgentData?.platform||navigator.platform),blocked:M.blocked,primary:M.primary,editable,privateField,deepActive,
        target:e=>e.composedPath?.()[0]||e.target,
        async configure(values){for(const key of Object.keys(values))if(!(key in M.DEFAULTS))throw Error('Unknown input preference: '+key);const clean=M.preferences({...OS.settings,...values});Object.assign(OS.settings,clean);OS.applySettings();await OS.featureSave('settings',OS.settings);},
        chord:key=>(OS.input.platform()==='macos'?'⌘':'Ctrl+')+key};
    let inserting=false,initialized=false,lastHistory=false,revision=0;
    const C=OS.clipboardTools=OS.clipboardText={target:null,model:new M.History(),current:null,
        initialize(pins){this.model=new M.History(OS.settings.clipboardHistory&&OS.settings.clipboardPersistPins?pins:[],OS.settings);lastHistory=OS.settings.clipboardHistory;initialized=true;},
        async save(){await OS.featureSave('clipboard-pins',OS.settings.clipboardHistory&&OS.settings.clipboardPersistPins?this.model.saved():[]);OS.featureChange('clipboard');},
        async add(text){if(!OS.settings.clipboardHistory)return false;const entry=this.model.add(text);if(entry)await this.save();return entry;},
        remember(element=deepActive()){
            if(ownUI(element))return this.target;
            if(privateField(element)){this.target=null;return null;}
            if(element?.tagName==='IFRAME'){this.target=null;return null;}
            if(!element?.isConnected||element.disabled||element.readOnly)return null;
            if(element.matches?.('textarea,input')&&typeof element.selectionStart==='number'){
                this.target={element,kind:'text',start:element.selectionStart,end:element.selectionEnd,value:element.value};return this.target;
            }
            const root=element?.isContentEditable?(element.closest('[contenteditable="true"],[contenteditable="plaintext-only"],[contenteditable=""]')||element):null;
            const selection=element?.ownerDocument?.getSelection();if(root&&selection?.rangeCount&&!privateSelection(element.ownerDocument)){const range=selection.getRangeAt(0);if(root.contains(range.commonAncestorContainer))this.target={element:root,kind:'rich',range:range.cloneRange(),value:root.innerHTML};return this.target;}
            return null;
        },
        valid(target){const e=target?.element;if(!e?.isConnected||e.disabled||e.readOnly||privateField(e)||e.closest('[hidden],.lock-screen'))return false;
            if(OS.$('.lock-screen'))return false;const w=e.closest('.window'),owner=OS.windows.get(w?.dataset.window);if(w&&(w.hidden||w.getAttribute('aria-hidden')==='true'||owner?.minimized||owner&&owner.desktop!==OS.activeDesktop))return false;
            return target.kind==='text'?e.value===target.value:e.isContentEditable&&e.innerHTML===target.value&&e.contains(target.range.commonAncestorContainer);},
        insert(text,target=this.target){text=M.transform(text);if(!this.valid(target))throw Error('The original text field changed or closed. Click its insertion point again before pasting.');
            const e=target.element,doc=e.ownerDocument,win=doc.defaultView;if(!e.dispatchEvent(new win.InputEvent('beforeinput',{bubbles:true,cancelable:true,composed:true,inputType:'insertFromPaste',data:text})))return false;
            const owner=OS.windows.get(e.closest('.window')?.dataset.window);owner?.focus(false);e.focus({preventScroll:true});
            if(target.kind==='text')e.setSelectionRange(target.start,target.end);else{const s=doc.getSelection();s.removeAllRanges();s.addRange(target.range);}
            // insertText retains native undo in supported engines. setRangeText is the
            // deterministic fallback; native keyboard paste itself is never synthesized.
            let inputSeen=false;const seen=()=>{inputSeen=true;};e.addEventListener('input',seen,{once:true});inserting=true;
            try {const success=doc.execCommand?.('insertText',false,text);if(!success){if(target.kind==='text')e.setRangeText(text,target.start,target.end,'end');else{const range=target.range;range.deleteContents();const node=doc.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);const s=doc.getSelection();s.removeAllRanges();s.addRange(range);}}
                if(!inputSeen)e.dispatchEvent(new win.InputEvent('input',{bubbles:true,composed:true,inputType:'insertFromPaste',data:text}));
            }finally{inserting=false;e.removeEventListener('input',seen);}this.remember(e);return true;
        },
        paste(id,mode='plain'){const e=this.model.prune().find(e=>e.id===id);if(!e)throw Error('This clipboard entry has expired.');return this.insert(M.transform(e.text,mode));},
        async copyText(text,{history=true}={}){text=M.transform(text);let copied=false;
            // Call the browser API directly on the originating click; no init/db await.
            try {if(!navigator.clipboard?.writeText)throw Error('Unavailable');await navigator.clipboard.writeText(text);copied=true;}catch{}
            if(!copied){const original=this.remember(),active=deepActive(),box=OS.el('textarea',{'aria-label':'Copy text fallback','data-private':'true',readonly:true});box.value=text;box.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;';document.body.append(box);box.select();inserting=true;
                try{copied=!!document.execCommand('copy');}catch{}finally{inserting=false;box.remove();if(active?.isConnected)active.focus({preventScroll:true});this.target=original;}}
            if(!copied)throw Error('Browser clipboard write was denied. Select the text in Clipboard utilities and use the browser’s Copy command.');
            if(history)await this.add(text);return true;
        },
        copyFileReference(record){
            const target=this.target,active=deepActive(),box=OS.el('textarea',{'data-private':'true',readonly:true});box.value=record.paths.join('\n');box.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:.01;';
            const write=e=>{if(!e.clipboardData)return;e.clipboardData.setData('text/plain',box.value);e.clipboardData.setData('application/x-aster-files',record.token);e.preventDefault();};
            document.body.append(box);box.select();document.addEventListener('copy',write,true);inserting=true;
            try{return !!document.execCommand('copy');}catch{return false;}finally{inserting=false;document.removeEventListener('copy',write,true);box.remove();if(active?.isConnected)active.focus({preventScroll:true});this.target=target;}
        },
        async readText(){if(!navigator.clipboard?.readText)throw Error('Clipboard reading needs HTTPS/localhost and browser support. Use the manual Paste box instead.');const text=await navigator.clipboard.readText();return M.transform(text);},
        async readSystem(){const token=revision,text=await this.readText();if(token!==revision)return false;this.setCurrent({text,html:'',image:null,types:['text/plain']});return this.add(text);},
        async pasteSystem(target=this.remember()) {let text;try{text=await this.readText();}catch(error){return this.manualPaste(target,error.message);}return this.insert(text,target);},
        async manualPaste(target=this.target,message=''){
            const box=OS.el('textarea',{'aria-label':'Paste text here','data-private':'true',rows:6}),note=OS.el('p',{text:message||'Use your keyboard paste shortcut, browser menu, or touch Paste in this box.'}),extra=OS.el('div',{'data-clipboard-ui':'true'},note,box);
            const result=await OS.dialog({title:'Paste from your clipboard',message:'Nothing is read until you paste it here. Only plain text is inserted.',extra,confirm:target?'Insert text':'Use text'});
            if(!result)return false;const text=M.transform(box.value);if(target)return this.insert(text,target);this.setCurrent({text,html:'',image:null,types:['text/plain']});return true;
        },
        editItems(element=deepActive()){
            const target=this.remember(element)||(this.target?.element===element?this.target:null),restore=()=>{element.focus();if(this.valid(target)){if(target.kind==='text')element.setSelectionRange(target.start,target.end);else{const selection=element.ownerDocument.getSelection();selection.removeAllRanges();selection.addRange(target.range);}}},copy=()=>{restore();if(!document.execCommand('copy'))throw Error('Select text and use your browser’s Copy command.');};
            return [{text:'Cut',icon:'cut',key:OS.input.chord('X'),disabled:!editable(element)||element.readOnly,action:()=>{restore();if(!document.execCommand('cut'))throw Error('Use your keyboard Cut shortcut.');}},
                {text:'Copy',icon:'copy',key:OS.input.chord('C'),action:copy},{text:'Paste',icon:'paste',key:OS.input.chord('V'),disabled:!target,action:()=>this.pasteSystem(target)},
                {text:'Paste as plain text…',icon:'paste',disabled:!target,action:()=>this.pasteSystem(target)},null,
                {text:'Select all',key:OS.input.chord('A'),action:()=>{element.focus();element.select?element.select():document.execCommand('selectAll');}},
                {text:'Clipboard utilities',icon:'paste',action:()=>OS.showClipboardUtilities()}];
        },
        setCurrent(value){this.current=value;revision++;OS.featureChange('clipboard-current');},
        async inspect(){if(!navigator.clipboard?.read){await this.readSystem();return this.current;}
            const token=revision,pending=navigator.clipboard.read(),values=await pending;let text='',html='',image=null;const types=[];
            for(const item of values.slice(0,4))for(const type of item.types){if(!types.includes(type))types.push(type);if(!['text/plain','text/html','image/png'].includes(type))continue;const blob=await item.getType(type);if(blob.size>(type==='image/png'?M.LIMITS.image:M.LIMITS.text))throw Error('Clipboard item exceeds the safe preview size.');if(type==='text/plain'&&!text)text=await blob.text();if(type==='text/html'&&!html)html=await blob.text();if(type==='image/png'&&!image)image=blob;}
            if(token!==revision)return null;this.setCurrent({text,html,image,types});if(text)await this.add(text);return this.current;
        },
        async copyImage(){const image=this.current?.image;if(!image)throw Error('Read or paste a PNG image first.');if(!navigator.clipboard?.write||!globalThis.ClipboardItem)throw Error('This browser cannot write images. Use Download image instead.');await navigator.clipboard.write([new ClipboardItem({'image/png':image})]);return true;},
        async importFiles(files,directory){if(!files?.length)throw Error('The clipboard does not contain files.');if(files.length>M.LIMITS.files||files.reduce((n,f)=>n+f.size,0)>32*1024*1024)throw Error('Paste up to 32 files / 32 MiB at once.');
            directory=OS.fs.normalize(directory);if(directory.startsWith('/.')||directory.startsWith('/Local')||(await OS.fs.stat(directory))?.kind!=='directory')throw Error('Choose a writable virtual folder.');
            const puts=[],reserved=new Set((await OS.db.all()).map(e=>e.path));for(const f of files){const original=f.name||'Clipboard image.png';OS.fs.validateName(original);let name=original,n=1;while(reserved.has(OS.fs.join(directory,name))){const i=original.lastIndexOf('.');name=i>0?original.slice(0,i)+' ('+(n++)+')'+original.slice(i):original+' ('+(n++)+')';}const path=OS.fs.join(directory,name);reserved.add(path);puts.push({path,kind:'file',content:f,mime:f.type||OS.fs.mime(path),size:f.size,modified:Date.now()});}
            await OS.db.mutateFiles(entries=>{if(!entries.some(e=>e.path===directory&&e.kind==='directory'))throw Error('Destination was removed.');if(puts.some(p=>entries.some(e=>e.path===p.path)))throw Error('Destination changed; paste again.');return {puts};});OS.emit('fs-change',{path:directory});return puts.map(e=>e.path);
        },
        async pasteToFolder(directory){
            let current;try{current=await this.inspect();}catch(error){if(!await this.manualPaste(null,error.message))return [];current=this.current;}
            if(current?.image)return this.importFiles([new File([current.image],'Clipboard.png',{type:'image/png'})],directory);
            if(!current?.text)throw Error('No text or PNG image was provided. Use native Paste on the file list for actual clipboard files.');
            const text=current.text,name=await OS.prompt('Paste text as a file','Clipboard.txt');if(name===null)return [];OS.fs.validateName(name);
            return this.importFiles([new File([text],name,{type:'text/plain'})],directory);
        },
        async clear(all=false){this.model.clear(all);this.setCurrent(null);this.target=null;await this.save();},
        async export(){const data={format:'aster.clipboard',version:1,snippets:this.model.prune().map(({text,pinned})=>({text,pinned}))};OS.download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'Aster-clipboard.json');},
        async import(value){const entries=M.unpack(value);if(!OS.settings.clipboardHistory)throw Error('Turn on clipboard history before importing snippets.');let count=0;for(const e of entries)if(this.model.add(e.text,e.pinned))count++;await this.save();return count;}
    };
    function capture(e){if(inserting||e.defaultPrevented||!e.isTrusted||!OS.settings.clipboardHistory)return;const t=OS.input.target(e);if(privateField(t)||ownUI(t)||!t?.isConnected||privateSelection(t.ownerDocument))return;
        let text='';if(e.type==='paste'){if(!OS.settings.clipboardCapturePaste)return;text=e.clipboardData?.getData('text/plain')||'';}else if(t.matches?.('textarea,input')){if(typeof t.selectionStart!=='number')return;text=t.value.slice(t.selectionStart,t.selectionEnd);}else text=t.ownerDocument?.getSelection()?.toString()||'';
        C.add(text).catch(console.warn);
    }
    document.addEventListener('focusout',e=>{if(!ownUI(OS.input.target(e)))C.remember(OS.input.target(e));},true);
    document.addEventListener('focusin',e=>{if(!ownUI(OS.input.target(e))&&privateField(OS.input.target(e)))C.target=null;},true);
    for(const event of ['copy','cut','paste'])document.addEventListener(event,capture);
    document.addEventListener('paste',e=>{
        const t=OS.input.target(e);if(e.defaultPrevented||privateField(t)||ownUI(t)||!e.clipboardData)return;
        if(OS.settings.clipboardPlainPaste&&editable(t)&&t.isContentEditable){const snap=C.remember(t);if(snap){e.preventDefault();OS.guard(()=>C.insert(e.clipboardData.getData('text/plain'),snap))();}}
    });
    OS.on('settings',()=>{const p=M.preferences(OS.settings);Object.assign(OS.settings,p);C.model.configure(p);if(initialized){if(lastHistory&&!p.clipboardHistory){C.model.clear(true);C.save().catch(console.warn);}else if(!p.clipboardPersistPins)OS.featureSave('clipboard-pins',[]).catch(console.warn);lastHistory=p.clipboardHistory;}});
    OS.on('clipboard-lock',()=>{if(OS.settings.clipboardClearOnLock){C.setCurrent(null);C.target=null;C.model.clear();C.save().catch(console.warn);}});
})();
/* Optional guest clipboard channel: every request is separately approved by the user. */
(() => {
    const OS=Aster,C=OS.clipboardTools,M=AsterInputModels;let activeRequest=null;
    C.attachFrame=(frame,owner)=>{
        let alive=true,port=null,pending=null,used=new Set();
        const focused=()=>alive&&!owner.closed&&!owner.minimized&&owner.desktop===OS.activeDesktop&&frame.isConnected&&!frame.closest('[hidden]')&&document.activeElement===frame&&OS.focused===owner.id&&!OS.$('.lock-screen');
        const reset=()=>{pending?.abort();pending=null;try{port?.postMessage({type:'aster.clipboard.closed'});}catch{}port?.close();port=null;used.clear();};
        const connect=()=>{
            reset();if(!alive||!frame.isConnected||owner.closed||!OS.settings.clipboardBridge||OS.$('.lock-screen'))return;
            const pair=new MessageChannel();port=pair.port1;const channel=port;
            const origin=frame.hasAttribute('srcdoc')?'null':(()=>{try{return new URL(frame.src).origin;}catch{return 'null';}})();
            port.onmessage=async event=>{
                const msg=event.data;if(!msg||typeof msg.id!=='string'||msg.id.length>80||used.has(msg.id))return;
                if(used.size>=128){channel.postMessage({id:msg.id,error:'Clipboard channel request limit reached. Reload this app.'});return;}used.add(msg.id);
                const reply=data=>{if(alive&&port===channel)channel.postMessage({id:msg.id,...data});};
                if(!OS.settings.clipboardBridge||!focused()||activeRequest||OS.$('#dialog-layer').children.length){reply({error:'Click the app first and close other dialogs. Clipboard helpers must be enabled in Settings.'});return;}
                if(!['readText','writeText'].includes(msg.method)||msg.method==='writeText'&&(typeof msg.text!=='string'||msg.text.length>M.LIMITS.text)){reply({error:'Invalid clipboard request.'});return;}
                const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),85000);pending=controller;activeRequest=controller;
                try {
                    const box=OS.el('textarea',{'aria-label':msg.method==='writeText'?'Text requested for copying':'Paste text to share','data-private':'true',rows:5});box.value=msg.method==='writeText'?msg.text:'';box.readOnly=msg.method==='writeText';
                    const status=OS.el('p',{role:'status',text:'Only this text is shared. Your history and files are never exposed.'});
                    const read=OS.el('button',{class:'secondary',text:'Read system clipboard',onclick:OS.guard(async()=>{try{const text=await C.readText();if(!controller.signal.aborted)box.value=text;}catch{status.textContent='Browser read was denied. Paste into the box using your keyboard or browser menu.';box.focus();}})});
                    const extra=OS.el('div',{'data-clipboard-ui':'true'},box,status);if(msg.method==='readText')extra.prepend(read);
                    const approved=await OS.dialog({title:msg.method==='readText'?'Share clipboard text with '+owner.title+'?':'Copy text from '+owner.title+'?',message:'Requested by '+(origin==='null'?'an isolated HTML app':origin)+'. This approval applies to one request only.',extra,confirm:msg.method==='readText'?'Share text':'Copy text',signal:controller.signal});
                    if(!approved||controller.signal.aborted||!alive||!frame.isConnected||owner.closed||owner.minimized||owner.desktop!==OS.activeDesktop||frame.closest('[hidden]')||OS.$('.lock-screen')||!OS.settings.clipboardBridge||port!==channel){reply({error:'Clipboard request cancelled.'});return;}
                    // Copy occurs on a new explicit dialog action. writeText may still be
                    // denied by the browser; never report success until it actually succeeds.
                    if(msg.method==='writeText')await C.copyText(msg.text,{history:false});
                    reply({value:msg.method==='readText'?M.transform(box.value):true});
                }catch(error){reply({error:error.message});}finally{clearTimeout(timer);if(activeRequest===controller)activeRequest=null;if(pending===controller)pending=null;}
            };port.start();frame.contentWindow?.postMessage({type:'aster.clipboard.host'},'*',[pair.port2]);
        };
        frame.addEventListener('load',connect);
        const cancel=()=>{if(!OS.settings.clipboardBridge)reset();else if(!port)connect();};const off=OS.on('settings',cancel),lock=OS.on('clipboard-lock',reset),unlock=OS.on('clipboard-unlock',cancel);
        const dispose=()=>{if(!alive)return;alive=false;reset();off();lock();unlock();frame.removeEventListener('load',connect);};owner.addCleanup(dispose);return dispose;
    };
})();
