/* Browser-only PE32 launcher. All guest execution is isolated in a Worker. MIT. */
'use strict';
(() => {
const OS=Aster,activeSessions=new Map(),assetCache=new Map(),allowed=new Set(['src/win32/pe.js','src/win32/runtime.js','src/win32/compat.js','src/win32/worker.js','src/win32/x86.wasm','src/win32/third-party/7zr.exe','src/win32/third-party/tcc.exe','src/win32/third-party/tcc-files.json','src/win32/third-party/NOTICE.txt','third-party/tinycc/tcc-0.9.27.tar.bz2',...['hello','pad','gdi','compute'].map(n=>'src/win32/examples/'+n+'.exe')]);
async function asset(path){
    if(!allowed.has(path))throw Error('Unknown runtime asset');
    if(!assetCache.has(path))assetCache.set(path,(async()=>{
        const inline=globalThis.ASTER_WIN32_ASSETS?.[path];if(inline)return Uint8Array.from(atob(inline),c=>c.charCodeAt(0));
        const response=await fetch(new URL(path,document.baseURI));if(!response.ok)throw Error(`Runtime asset ${path}: HTTP ${response.status}`);return new Uint8Array(await response.arrayBuffer());
    })().catch(error=>{assetCache.delete(path);throw error;}));return assetCache.get(path);
}
// SHA-256 fallback keeps the offline single-file edition usable even when the
// browser does not expose SubtleCrypto. Same executable => same private drive.
async function digest(bytes){
    if(globalThis.crypto?.subtle)return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const k=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
    const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]),padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);padded.set(bytes);padded[bytes.length]=128;
    const view=new DataView(padded.buffer);view.setUint32(padded.length-4,bytes.length*8);const words=new Uint32Array(64),rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let off=0;off<padded.length;off+=64){for(let i=0;i<16;i++)words[i]=view.getUint32(off+i*4);for(let i=16;i<64;i++){const a=words[i-15],b=words[i-2];words[i]=words[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+words[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10));}
        let[a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const t1=(j+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+k[i]+words[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}[a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
    }return [...h].map(v=>v.toString(16).padStart(8,'0')).join('');
}
let wasmModule,workerSource;
async function runtimeAssets(){
    wasmModule||=asset('src/win32/x86.wasm').then(b=>WebAssembly.compile(b)).catch(e=>{wasmModule=null;throw e;});
    workerSource||=Promise.all(['pe','runtime','compat','worker'].map(n=>asset('src/win32/'+n+'.js'))).then(list=>list.map(b=>new TextDecoder().decode(b)).join('\n')).catch(e=>{workerSource=null;throw e;});
    return {wasm:await wasmModule,source:await workerSource};
}
class Session {
    constructor(w,nodes){this.w=w;this.nodes=nodes;this.files=new Map();this.controls=new Map();this.stats={};this.persist=Promise.resolve();this.closed=false;this.halted=false;this.exitCode=null;this.sequence=Promise.resolve();this.started=performance.now();}
    send(event){this.worker?.postMessage(event);}
    async start(bytes,name,options={}){
        this.name=name;this.key=await digest(bytes);if(activeSessions.has(this.key))throw Error('This executable is already running in another Win32 Lab window');if(activeSessions.size>=4)throw Error('Four guest processes are already running');activeSessions.set(this.key,this);const saved=await OS.db.get('win32-files:'+this.key)||[];
        for(const file of saved){if(typeof file.path==='string'&&file.bytes instanceof Uint8Array)this.files.set(file.path,file.bytes);}
        this.seedPaths=new Set((options.files||[]).map(f=>f.path));for(const file of options.files||[]){if(!this.files.has(file.path))this.files.set(file.path,file.bytes);}
        const {wasm,source}=await runtimeAssets();if(this.closed)return;
        const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));this.worker=new Worker(url,{name:'Aster Win32: '+name});URL.revokeObjectURL(url);
        this.worker.onerror=e=>this.error(Error(e.message||'Worker failed'));
        this.worker.onmessage=({data})=>{
            if(['files','stopped','stats'].includes(data.type))this.receive(data).catch(error=>this.error(error));
            else this.sequence=this.sequence.then(()=>this.receive(data)).catch(error=>this.error(error));
        };
        const exe=bytes.slice().buffer;this.send({type:'start',wasm,exe,name,files:[...this.files].map(([path,bytes])=>({path,bytes})),options:{cache:true,args:options.args||'',stdin:options.stdin||''}});
        this.nodes.stage.replaceChildren();this.nodes.log.textContent='';this.output='';this.nodes.phase.textContent='Loading '+name+'…';this.nodes.stop.disabled=false;this.nodes.run.disabled=true;this.nodes.sampleRun.disabled=true;
        this.renderFiles();
    }
    error(error){if(this.failed||this.closed||this.halted)return;console.error('Win32 runtime:',error);this.failed=true;this.nodes.phase.textContent='Stopped: '+error.message;this.nodes.log.textContent+='\n'+error.message;this.nodes.details.open=true;this.nodes.run.disabled=false;this.nodes.sampleRun.disabled=false;this.nodes.stop.disabled=true;this.worker?.terminate();this.worker=null;if(activeSessions.get(this.key)===this)activeSessions.delete(this.key);this.renderer?.destroy();}
    async receive(e){
        if((this.closed||this.failed||this.halted)&&!['files','stopped','error'].includes(e.type))return;
        if(e.type==='loaded'){this.image=e.image;this.nodes.log.textContent=JSON.stringify({name:e.name,...e.image,supportedAPIs:e.supportedAPIs},null,2);this.nodes.phase.textContent='Running '+e.name;if(e.image.subsystem===3){this.console=OS.el('pre',{class:'win32-console','aria-label':'Windows console output'});this.nodes.stage.replaceChildren(this.console);}}
        else if(e.type==='window'){
            if(!e.parent){
                this.hwnd=e.hwnd;this.width=e.width;this.height=e.height;this.nodes.stage.replaceChildren();this.board=OS.el('div',{class:'win32-board'});this.nodes.stage.append(this.board);this.board.style.width=e.width+'px';this.board.style.height=e.height+'px';
                this.renderer=await new AsterGDI(this.board,e.width,e.height,{requireGPU:!!globalThis.ASTER_WIN32_REQUIRE_GPU,onError:error=>this.error(error),onFrame:()=>this.metrics()}).init();
                if(this.closed||this.halted){this.renderer.destroy();return;}
                this.w.setTitle?.(e.title+' · Win32');this.bindInput(this.renderer.canvas);this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(this.nodes.stage);this.fit();this.renderer.canvas.focus();if(e.credit)this.send({type:'ack',credit:e.credit});
            }else{
                if(e.parent!==this.hwnd)throw Error('Nested child controls unsupported');
                const type=e.className.toUpperCase();let control;
                if(type==='EDIT'){control=OS.el((e.style&4)?'textarea':'input',{class:'win32-edit','aria-label':'Windows edit control',maxlength:32767,spellcheck:'false'});control.value=e.title;control.addEventListener('input',()=>this.send({type:'text',hwnd:e.hwnd,text:control.value.replace(/\r?\n/g,'\r\n')}));}
                else if(type==='BUTTON'){if((e.style&15)>1)throw Error('Only push buttons supported');control=OS.el('button',{class:'win32-button',text:e.title.replace(/&/g,''),onclick:()=>this.send({type:'button',hwnd:e.hwnd})});}
                else if(type==='STATIC')control=OS.el('div',{class:'win32-static',text:e.title});
                else throw Error('No browser control for '+type);
                control.style.cssText+=`;left:${e.x}px;top:${e.y}px;width:${e.width}px;height:${e.height}px`;control.hidden=!(e.style&0x10000000);control.dataset.hwnd=e.hwnd;this.controls.set(e.hwnd,control);this.board.append(control);
            }
        }else if(e.type==='draw'){if(e.hwnd!==this.hwnd)throw Error('Drawing to child DC unsupported');await this.renderer.submit(e.commands);if(e.credit)this.send({type:'ack',credit:e.credit});}
        else if(e.type==='text'){const c=this.controls.get(e.hwnd);if(c){if(c.matches('input,textarea'))c.value=e.text;else c.textContent=e.text;}else if(e.hwnd===this.hwnd)this.w.setTitle?.(e.text+' · Win32');}
        else if(e.type==='show'){const c=this.controls.get(e.hwnd);if(c)c.hidden=!e.visible;else if(this.board)this.board.hidden=!e.visible;}
        else if(e.type==='destroy'){const c=this.controls.get(e.hwnd);if(c){c.remove();this.controls.delete(e.hwnd);}}
        else if(e.type==='messagebox'){
            const body=OS.el('div',{class:'win32-messagebox'},OS.el('h2',{text:e.title||'Windows application'}),OS.el('p',{text:e.text}));
            const answer=()=>{this.send({type:'response',id:e.id,value:1});body.remove();};body.append(OS.el('button',{class:'primary',text:'OK',onclick:answer}));
            if(e.cancel)body.append(OS.el('button',{class:'secondary',text:'Cancel',onclick:()=>{this.send({type:'response',id:e.id,value:2});body.remove();}}));this.nodes.stage.append(body);
        }else if(e.type==='measure'){const measure=this.renderer?.measure(e.text,e.size);if(!measure)throw Error('No window for text measurement');this.send({type:'response',id:e.id,value:measure});}
        else if(e.type==='stdout'){
            // Console chunks are bytes decoded by the facade, not HTML. Preserve
            // line breaks and overwrite progress lines on carriage return.
            this.rawOutput=((this.rawOutput||'')+e.text).slice(-1048576);
            for(const ch of e.text){if(ch==='\r'){this.consoleCR=true;continue;}if(this.consoleCR&&ch!=='\n')this.output=this.output.slice(0,this.output.lastIndexOf('\n')+1);this.consoleCR=false;if(ch==='\b')this.output=this.output.slice(0,-1);else this.output+=ch;}
            this.output=this.output.slice(-131072);if(this.console){this.console.textContent=this.output;this.nodes.stage.scrollTop=this.nodes.stage.scrollHeight;}else{this.nodes.details.open=true;this.nodes.log.textContent+=e.text;}
        }
        else if(e.type==='files'){
            if(!Array.isArray(e.files)||e.files.length>512)throw Error('Invalid guest file response');for(const f of e.files){if(typeof f.path!=='string'||f.path.length>260||f.path.split('/').some(p=>!p||p==='.'||p==='..'||/[\\\x00]/.test(p)))throw Error('Invalid guest path');if(f.bytes===null){this.files.delete(f.path);continue;}if(!(f.bytes instanceof Uint8Array)||f.bytes.length>8*1024*1024)throw Error('Invalid guest file');this.files.set(f.path,f.bytes);}
            const snapshot=[...this.files].map(([path,bytes])=>({path,bytes}));if(snapshot.reduce((n,f)=>n+f.bytes.length,0)>32*1024*1024)throw Error('Saved drive quota exceeded');
            this.persist=this.persist.then(()=>OS.db.set('win32-files:'+this.key,snapshot)).then(()=>{this.persisted=true;this.metrics();}).catch(error=>{this.nodes.phase.textContent='Storage failed: '+error.message;});this.renderFiles();
        }else if(e.type==='stats'||e.type==='idle'){this.stats=e;this.metrics();if(e.type==='idle'&&!this.readyMs){this.readyMs=performance.now()-this.started;this.nodes.phase.textContent='Running locally · '+this.name;}}
        else if(e.type==='exit'){this.stats=e.stats;this.exitCode=e.code;this.nodes.phase.textContent='Exited with code '+e.code;this.nodes.stop.disabled=true;this.nodes.run.disabled=false;this.nodes.sampleRun.disabled=false;this.metrics();setTimeout(()=>this.stop(),0);}
        else if(e.type==='stopped'){this.stopAck?.();}
        else if(e.type==='error'){this.stats=e.stats||this.stats;this.error(Error(e.message));}
    }
    fit(){if(!this.board)return;const rect=this.nodes.stage.getBoundingClientRect(),scale=Math.min(1,(rect.width-24)/this.width,(rect.height-24)/this.height);this.board.style.transform=`translate(-50%,-50%) scale(${Math.max(.2,scale)})`;}
    bindInput(canvas){
        const message=(type,wp=0,lp=0)=>this.send({type:'message',hwnd:this.hwnd,message:type,wParam:wp,lParam:lp});
        const point=e=>{const rect=canvas.getBoundingClientRect(),x=Math.round((e.clientX-rect.left)*this.width/rect.width),y=Math.round((e.clientY-rect.top)*this.height/rect.height);return (x&65535)|((y&65535)<<16);};
        canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);message(e.button===2?0x204:0x201,e.buttons,point(e));});
        canvas.addEventListener('pointerup',e=>{e.preventDefault();message(e.button===2?0x205:0x202,e.buttons,point(e));});
        let latest,scheduled=0;canvas.addEventListener('pointermove',e=>{latest={buttons:e.buttons,point:point(e)};if(!scheduled)scheduled=requestAnimationFrame(()=>{scheduled=0;if(this.worker)message(0x200,latest.buttons,latest.point);});});
        canvas.addEventListener('contextmenu',e=>e.preventDefault());
        canvas.addEventListener('keydown',e=>{if(e.metaKey||e.altKey)return;e.preventDefault();e.stopPropagation();message(0x100,e.keyCode||e.which,1);if(e.key.length===1&&!e.ctrlKey)for(let i=0;i<e.key.length;i++)message(0x102,e.key.charCodeAt(i),1);});
        canvas.addEventListener('keyup',e=>{if(e.metaKey||e.altKey)return;e.preventDefault();e.stopPropagation();message(0x101,e.keyCode||e.which,0xc0000001);});
    }
    metrics(){const s=this.stats,g=this.renderer?.stats(),hit=s.instructions?100*(s.cacheHits||0)/s.instructions:0;this.nodes.metrics.textContent=[g?.mode||'WebAssembly',s.instructions?Math.round(s.instructions).toLocaleString()+' x86 instructions':'',s.instructions?hit.toFixed(1)+'% decode-cache hits':'',g?g.frames+' presented frames':'',this.persisted?'C: saved ('+OS.db.mode+')':'C: private to this EXE'].filter(Boolean).join(' · ');}
    renderFiles(){
        const panel=this.nodes.files;panel.replaceChildren(OS.el('h3',{text:'Private C: drive'}),OS.el('p',{text:'Saved in this browser, separately for each executable. No host folders are mounted.'}));
        if(!this.files.size)panel.append(OS.el('p',{text:'No files created yet.'}));
        for(const [path,bytes]of [...this.files].sort((a,b)=>(this.seedPaths?.has(a[0])?1:0)-(this.seedPaths?.has(b[0])?1:0)||a[0].localeCompare(b[0]))){const row=OS.el('div',{class:'win32-file-row'},OS.el('span',{text:path+' · '+OS.formatBytes(bytes.length)}));row.append(OS.el('button',{class:'secondary',text:'Download',onclick:()=>OS.download(new Blob([bytes]),path.split('/').pop())}),OS.el('button',{class:'secondary',text:'Copy to Aster',onclick:OS.guard(async()=>{
            const safe=path.split('/');if(safe.some(x=>!x||x==='.'||x==='..'||/[\\\x00]/.test(x)))throw Error('Invalid guest path');
            const root='/Documents/Win32/'+this.key.slice(0,16);
            const destination=root+'/'+safe.join('/'),parents=destination.split('/').slice(1,-1);let dir='';for(const p of parents){dir+='/'+p;if(!await OS.fs.stat(dir))await OS.fs.mkdir(dir);}await OS.fs.write(destination,new Blob([bytes]));OS.notify('Copied from Windows app',destination);
        })}));if(path.toLowerCase().endsWith('.exe'))row.append(OS.el('button',{class:'primary',text:'Run EXE',onclick:()=>OS.launch('win32',{executable:{bytes:bytes.slice(),name:path.split('/').pop()},autorun:true})}));panel.append(row);}
    }
    async stop(){
        if(this.stopping)return this.stopping;this.halted=true;
        this.stopping=(async()=>{if(!this.worker){if(activeSessions.get(this.key)===this)activeSessions.delete(this.key);return;}const worker=this.worker;await new Promise(resolve=>{this.stopAck=resolve;worker.postMessage({type:'stop'});setTimeout(resolve,500);});worker.terminate();await this.persist;this.nodes.stop.disabled=true;this.nodes.run.disabled=false;this.nodes.sampleRun.disabled=false;if(!this.failed&&this.exitCode===null)this.nodes.phase.textContent='Stopped';if(this.worker===worker)this.worker=null;if(activeSessions.get(this.key)===this)activeSessions.delete(this.key);})();return this.stopping;
    }
    async close(){if(this.closed)return;this.closed=true;this.resize?.disconnect();this.renderer?.destroy();await this.stop();}
}
OS.win32={asset,digest,Session};
OS.register('win32',{title:'Win32 Lab',description:'Run a limited set of real x86 Windows executables entirely in this browser.',category:'Development',width:1000,height:750,minWidth:360,minHeight:420,
    mount:async(w,options)=>{
        let selected=null,session=null,launching=false;w.body.classList.add('win32-app');
        const header=OS.el('div',{class:'win32-header'},OS.el('div',{},OS.el('strong',{text:'Windows apps. Inside your browser.'}),OS.el('small',{text:'Experimental PE32 compatibility · No companion or Windows installation'})),OS.el('span',{class:'pill',text:'x86 → Wasm · GDI → WebGPU'}));
        const open=OS.el('button',{class:'secondary',text:'Open .exe'}),name=OS.el('span',{class:'win32-filename',text:'No executable selected'}),run=OS.el('button',{class:'primary',text:'Run selected',disabled:true}),stop=OS.el('button',{class:'secondary',text:'Stop',disabled:true}),filesButton=OS.el('button',{class:'secondary',text:'Files'}),importFiles=OS.el('button',{class:'secondary',text:'Import files'});
        const select=OS.el('select',{'aria-label':'Win32 sample'});for(const [id,title]of[['gdi','GDI Playground'],['pad','Win32 Pad'],['hello','Hello Win32'],['compute','Integer checksum'],['7zr','7-Zip 26.03 · original EXE'],['tcc','TinyCC 0.9.27 · legacy original EXE']])select.append(OS.el('option',{value:id,text:title}));
        const sampleRun=OS.el('button',{class:'secondary',text:'Run sample'}),stage=OS.el('div',{class:'win32-stage'}),files=OS.el('aside',{class:'win32-files',hidden:true}),details=OS.el('details',{class:'win32-diagnostics'}),log=OS.el('pre'),phase=OS.el('span',{text:'Ready'}),metrics=OS.el('span',{class:'win32-metrics',text:'Select an EXE or run one of the included compiled Windows samples.'});
        details.append(OS.el('summary',{text:'Compatibility and execution diagnostics'}),log);
        stage.append(OS.el('div',{class:'win32-empty'},OS.el('div',{html:OS.icon('gpu',46)}),OS.el('h2',{text:'The executable stays here.'}),OS.el('p',{text:'Aster loads the PE file, executes its x86 instructions in a dedicated WebAssembly worker, and maps supported Windows calls to browser controls and GPU drawing.'}),OS.el('p',{text:'Run original 7-Zip and TinyCC Windows binaries, or the compiled GUI samples. TinyCC builds hello-aster.exe; open Files and click Run EXE to execute its output. Import files into the private C: drive and pass arguments above. Compatibility is limited; missing APIs and instructions are reported explicitly.'})));
        const argumentsInput=OS.el('input',{class:'win32-arguments','aria-label':'Windows command line arguments',placeholder:'Command line arguments (no shell)',maxlength:8192}),stdinInput=OS.el('input',{class:'win32-stdin','aria-label':'Windows standard input',placeholder:'Optional standard input',maxlength:65536});
        const licenses=OS.el('button',{class:'secondary',text:'Licenses',onclick:OS.guard(async()=>OS.download(new Blob([await asset('src/win32/third-party/NOTICE.txt')]),'Aster-third-party-notices.txt'))}),source=OS.el('button',{class:'secondary',text:'TinyCC source',onclick:OS.guard(async()=>OS.download(new Blob([await asset('third-party/tinycc/tcc-0.9.27.tar.bz2')]),'tcc-0.9.27.tar.bz2'))});details.append(OS.el('div',{},licenses,source));
        const nodes={stage,log,details,phase,metrics,files,run,stop,sampleRun};w.body.append(header,OS.el('div',{class:'win32-toolbar'},open,name,run,stop,filesButton,importFiles),OS.el('div',{class:'win32-samples'},OS.el('span',{text:'Compiled PE32 samples'}),select,sampleRun),OS.el('div',{class:'win32-options'},argumentsInput,stdinInput),OS.el('div',{class:'win32-workspace'},stage,files),details,OS.el('div',{class:'win32-status'},phase,metrics));
        const launch=async(bytes,title,seeds=[])=>{if(launching)return;launching=true;run.disabled=sampleRun.disabled=true;try{if(session)await session.close();session=new Session(w,nodes);w.win32Session=session;await session.start(bytes,title,{args:argumentsInput.value,stdin:stdinInput.value,files:seeds});}catch(error){session?.error(error);throw error;}finally{launching=false;}};
        const choose=async(file)=>{if(!file)return;if(file.size>16*1024*1024)throw Error('Executable exceeds 16 MiB');selected={bytes:new Uint8Array(await file.arrayBuffer()),name:file.name};name.textContent=file.name;run.disabled=false;};
        open.onclick=OS.guard(async()=>{const [f]=await OS.readFile('.exe');await choose(f);});run.onclick=OS.guard(async()=>{if(selected)await launch(selected.bytes,selected.name);});
        sampleRun.onclick=OS.guard(async()=>{
            const sample=select.value,thirdParty=['7zr','tcc'].includes(sample),bytes=await asset(thirdParty?'src/win32/third-party/'+sample+'.exe':'src/win32/examples/'+sample+'.exe');selected={bytes,name:sample+'.exe'};name.textContent=selected.name;let seeds=[];
            if(sample==='7zr')seeds=[{path:'welcome.txt',bytes:new TextEncoder().encode('Created locally in Aster. This file is compressed by the original Windows 7-Zip executable.\n')}];
            if(sample==='tcc'){const packaged=JSON.parse(new TextDecoder().decode(await asset('src/win32/third-party/tcc-files.json')));seeds=packaged.map(f=>({path:f.path,bytes:Uint8Array.from(atob(f.base64),c=>c.charCodeAt(0))}));seeds.push({path:'hello-aster.c',bytes:new TextEncoder().encode("#include <stdio.h>\nint main(void) {\n    unsigned value = 2166136261u;\n    for (int i=0;i<100;i++) value=(value^(unsigned)i)*16777619u;\n    FILE *f = fopen(\"compiled-result.txt\", \"wb\");\n    if (!f) return 2;\n    fprintf(f,\"TCC compiled inside Aster: %u\\n\",value);\n    fclose(f);\n    puts(\"Hello from a real Windows EXE compiled inside Aster!\");\n    return 0;\n}\n")});}
            await launch(bytes,selected.name,seeds);
        });
        select.onchange=()=>{argumentsInput.value=select.value==='7zr'?'a sample.7z welcome.txt -mmt=off -mx=1 -md=1m':select.value==='tcc'?'-o hello-aster.exe hello-aster.c':'';};
        importFiles.onclick=OS.guard(async()=>{if(session?.worker)throw Error('Stop the Windows process before importing files.');if(!selected)throw Error('Choose an executable or run a sample first.');const picked=await OS.readFile('',true);if(!picked.length)return;const key=await digest(selected.bytes),saved=new Map((await OS.db.get('win32-files:'+key)||[]).map(f=>[f.path,f.bytes]));for(const f of picked){if(f.size>8*1024*1024)throw Error('Each guest file is limited to 8 MiB');const path=f.name.toLowerCase();if(!path||/[\\/:*?"<>|\x00-\x1f]/.test(path)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(path)||/[. ]$/.test(path))throw Error('Invalid Windows filename');saved.set(path,new Uint8Array(await f.arrayBuffer()));}if(saved.size>512||[...saved.values()].reduce((n,b)=>n+b.length,0)>32*1024*1024)throw Error('Private drive quota exceeded');await OS.db.set('win32-files:'+key,[...saved].map(([path,bytes])=>({path,bytes})));if(session?.key===key){session.files=saved;session.renderFiles();}files.hidden=false;OS.notify('Files ready',picked.length+' files imported into the selected executable’s private C: drive.');});
        stop.onclick=OS.guard(async()=>session?.stop());filesButton.onclick=()=>{files.hidden=!files.hidden;session?.send({type:'snapshot'});session?.fit();};
        stage.addEventListener('dragover',e=>e.preventDefault());stage.addEventListener('drop',e=>{e.preventDefault();OS.guard(()=>choose(e.dataTransfer.files[0]))();});
        w.beforeClose=async()=>{await session?.close();return true;};w.addCleanup(()=>{session?.close();});
        if(options.executable){const exe=options.executable;if(!(exe.bytes instanceof Uint8Array))throw Error('Invalid executable bytes');await choose(new File([exe.bytes],String(exe.name||'application.exe')));if(options.autorun)await launch(selected.bytes,selected.name);}
        if(options.path){const f=await OS.fs.read(options.path);await choose(new File([f.content],options.path.split('/').pop()));}
    }
});
})();
