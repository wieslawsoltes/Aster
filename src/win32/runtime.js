/* Aster Win32 API facade, process state and cooperative scheduler. MIT. */
'use strict';
(() => {
const {Memory,loadPE,HOOK,RETURN,hex}=globalThis.AsterWin32;
const WM={CREATE:1,DESTROY:2,SIZE:5,PAINT:15,CLOSE:16,QUIT:18,COMMAND:273,TIMER:275};
const color=n=>[n&255,(n>>>8)&255,(n>>>16)&255,255];
class Runtime {
    static async create(wasm,host=()=>{},options={}) {
        const result=await WebAssembly.instantiate(wasm,{}),instance=result.instance||result;
        return new Runtime(instance.exports,host,options);
    }
    constructor(cpu,host,options) {
        this.cpu=cpu;this.mem=new Memory(cpu);this.host=host;this.options=options;
        this.modules=new Map();this.loadingModules=new Set();this.nextImageBase=0x800000;this.tlsImages=[];this.apis=new Map();this.hooks=new Map();this.nextThunk=HOOK;this.aliases=new Map();this.dataImports=new Map();this.handles=new Map();this.nextHandle=256;
        this.classes=new Map();this.messages=[];this.waiters=[];this.timers=new Map();this.requests=new Map();
        this.files=new Map();this.dirtyFiles=new Set();this.lastError=0;this.exitCode=null;this.stopped=false;
        this.pendingDraws=new Map();this.drawCount=0;this.started=performance.now();this.calls=0;this.depth=0;
        this.graphicsReady=Promise.resolve();this.drawBackpressure=false;this.nextRequest=1;this.logBytes=0;this.apiCounts=Object.create(null);this.mainWindow=0;this.fileRevision=0;
        this.registerAPIs();globalThis.AsterWin32.installCompat?.(this);cpu.set_cache(options.cache===false?0:1);
    }
    handle(value) {if(this.handles.size>=4096)throw Error('Guest handle quota exceeded');const id=this.nextHandle++;this.handles.set(id,value);return id;}
    get(id,type) {const h=this.handles.get(id);if(!h||(type&&h.type!==type))throw Error(`Invalid ${type||'object'} handle ${hex(id)}`);return h;}
    register(dll,name,argc,fn,cdecl=false) {const key=dll.toLowerCase()+'!'+name,existing=this.apis.get(key),address=existing?.address??this.nextThunk; if(!existing)this.nextThunk+=16; const api={dll:dll.toLowerCase(),name,argc,fn,cdecl,address};this.apis.set(key,api);this.hooks.set(address,api);}
    resolve(dll,name) {let key=dll.toLowerCase()+'!'+name;key=this.aliases.get(key)||key;const data=this.dataImports.get(key);if(data){data.address??=data.create();return data.address;}const api=this.apis.get(key)?.address;if(api)return api;const image=this.modules.get(dll.toLowerCase())||this.loadPrivateLibrary(dll);return image?.exports[name]||0;}
    loadPrivateLibrary(name) {
        name=String(name).toLowerCase();if(!/^[a-z0-9_.-]+\.dll$/.test(name))return null;
        if(this.modules.has(name))return this.modules.get(name);const bytes=this.files.get(name);if(!bytes)return null;
        if(this.loadingModules.has(name))throw Error('Cyclic DLL imports unsupported');if(this.modules.size+this.loadingModules.size>=4)throw Error('Private DLL limit: four');
        this.loadingModules.add(name);try{const base=this.nextImageBase;this.nextImageBase+=0x200000;if(this.nextImageBase>0x1000000)throw Error('Private DLL image budget exceeded');
        const image=loadPE(bytes,this.mem,this.resolve.bind(this),{base,dll:true,tls:true,maxImageSize:0x200000});if(image.imageSize>0x200000)throw Error('Private DLL exceeds 2 MiB image limit');image.name=name;if(image.missing.length)throw Error('Unsupported DLL imports: '+image.missing.join(', '));this.modules.set(name,image);return image;}finally{this.loadingModules.delete(name);}
    }
    prepareTLS(image) {
        if(!image.tls||image.tlsPrepared)return;image.tlsPrepared=true;const m=this.mem,t=image.tls,index=this.tlsImages.length;if(index>=64)throw Error('Static TLS slot limit');
        this.tlsVector??=m.alloc(64*4);m.w32(0x1002c,this.tlsVector);const raw=m.alloc(t.size+t.zero+t.alignment-1),data=Math.ceil(raw/t.alignment)*t.alignment;if(t.size)m.copy(data,m.bytes.slice(t.start,t.start+t.size));m.w32(t.index,index);m.w32(this.tlsVector+index*4,data);this.tlsImages.push(image);
    }
    async initializeImage(image) {
        if(image.initialized)return;if(image.initializing)throw Error('Recursive DLL initialization is unsupported');image.initializing=true;this.prepareTLS(image);for(const callback of image.tls?.callbacks||[])await this.invoke(callback,[image.base,1,0]);
        if(image.isDLL&&image.entry){const success=await this.invoke(image.entry,[image.base,1,0]);if(!success)throw Error('DLL_PROCESS_ATTACH failed: '+image.name);}image.initialized=true;image.initializing=false;
    }
    emit(type,value={}) {return this.host({type,...value});}
    log(text) {text=String(text).slice(0,8192);this.logBytes+=text.length;if(this.logBytes>1048576)throw Error('Guest output quota exceeded');this.emit('stdout',{text});}
    draw(hwnd,command) {if(++this.drawCount>4096)throw Error('GDI batch quota exceeded');let list=this.pendingDraws.get(hwnd);if(!list)this.pendingDraws.set(hwnd,list=[]);list.push(command);}
    flush() {const jobs=[];for(const [hwnd,commands]of this.pendingDraws){const job=this.emit('draw',{hwnd,commands});if(job&&typeof job.then==='function')jobs.push(job);}this.pendingDraws.clear();this.drawCount=0;if(jobs.length){this.graphicsReady=Promise.all([this.graphicsReady,...jobs]).then(()=>undefined);this.drawBackpressure=true;}return this.graphicsReady;}
    path(name) {
        name=String(name).replace(/\\/g,'/');if(name.startsWith('//'))throw Error('UNC and device paths are not available');
        if(/^[a-z]:/i.test(name)){if(!/^c:/i.test(name))throw Error('Only the private C: drive is available');name=name.slice(2);}
        const parts=name.split('/').filter(x=>x&&x!=='.');
        if(parts.length>32||parts.some(x=>x==='..'||/[\x00-\x1f:*?"<>|]/.test(x)||/[. ]$/.test(x)||/^(con|nul|prn|aux|com\d|lpt\d)(\.|$)/i.test(x))||name.length>260)throw Error('Unsafe or unsupported guest file path');
        if(!parts.length)throw Error('Empty guest file path');return parts.join('/').toLowerCase();
    }
    addFile(name,data) {
        const path=this.path(name),bytes=data instanceof Uint8Array?data:new Uint8Array(data);
        const total=[...this.files.values()].reduce((n,v)=>n+v.length,0)-(this.files.get(path)?.length||0)+bytes.length;
        if((this.files.size>=512&&!this.files.has(path))||bytes.length>8*1024*1024||total>32*1024*1024)throw Error('Guest file quota: 512 files, 8 MiB/file, 32 MiB total');
        this.files.set(path,bytes.slice());return path;
    }
    changed(path) {this.dirtyFiles.add(path);this.fileRevision++;}
    load(bytes,name='application.exe') {
        if(this.image)throw Error('Create a fresh process to load another executable');
        this.name=String(name).replace(/[\\/]/g,'_').slice(0,128);this.image=loadPE(bytes,this.mem,this.resolve.bind(this),{...this.options,tls:!!globalThis.AsterWin32.installCompat});
        this.image.deferred=this.image.imports.filter(i=>this.apis.get(i.dll+'!'+i.name)?.unsupported).map(i=>i.dll+'!'+i.name);
        this.emit('loaded',{name:this.name,image:this.image,supportedAPIs:this.apis.size});
        if(this.image.missing.length)throw Error('Unsupported imports: '+this.image.missing.slice(0,30).join(', ')+(this.image.missing.length>30?' …':''));
        const c=this.cpu,m=this.mem;c.set_reg(4,0x3effff0);c.set_reg(8,this.image.entry);c.set_fs(0x10000);
        m.w32(0x10000,0xffffffff);m.w32(0x10004,0x3f00000);m.w32(0x10008,0x3c00000);m.w32(0x10018,0x10000);m.w32(0x10030,0x11000);m.w32(0x11008,this.image.base);
        const command='"C:\\'+this.name+'"'+(this.options.args?' '+String(this.options.args).slice(0,8192):'');this.commandA=m.str(command);this.commandW=m.str(command,true);this.prepareCompat?.();for(const image of this.modules.values())this.prepareTLS(image);this.prepareTLS(this.image);this.push(RETURN);return this.image;
    }
    push(n) {this.cpu.set_reg(4,this.cpu.get_reg(4)-4);this.mem.w32(this.cpu.get_reg(4)>>>0,n);}
    async dispatch() {
        const c=this.cpu,address=c.get_reg(8)>>>0,api=this.hooks.get(address);if(!api)throw Error('Unknown Win32 thunk: '+hex(address));
        const sp=c.get_reg(4)>>>0,ret=this.mem.u32(sp),args=[];for(let i=0;i<api.argc;i++)args.push(this.mem.u32(sp+4+i*4));
        this.calls++;this.apiCounts[api.dll+'!'+api.name]=(this.apiCounts[api.dll+'!'+api.name]||0)+1;
        let value;try{value=api.fn(...args);if(value&&typeof value.then==='function')value=await value;}catch(error){throw Error(`${api.dll}!${api.name}: ${error.message}`);}
        if(this.drawCount>=4096)this.flush();
        if(value?.jump){value.jump.regs.forEach((v,i)=>c.set_reg(i,v));c.set_reg(0,value.jump.value);return;}
        if(this.drawBackpressure){await this.graphicsReady;this.drawBackpressure=false;}
        c.set_reg(0,(value??0)>>>0);c.set_reg(4,sp+4+(api.cdecl?0:api.argc*4));c.set_reg(8,ret);
    }
    fault() {const code=this.cpu.get_fault();throw Error(`x86 fault ${code} at ${hex(this.cpu.get_fault_pc())}: ${({1:'out-of-bounds memory',2:'execution outside mapped code',3:'unsupported instruction',4:'invalid operand',5:'integer divide error',6:'x87 stack fault',7:'unmasked x87 exception'})[code]||'CPU error'}`);}
    async invoke(address,args,cdecl=false) {
        if(!address)return 0;if(++this.depth>32)throw Error('Win32 callback recursion limit');
        const c=this.cpu,oldPC=c.get_reg(8),oldSP=c.get_reg(4);for(let i=args.length-1;i>=0;i--)this.push(args[i]);this.push(RETURN);c.set_reg(8,address);
        const start=c.instruction_count();let yielded=performance.now();
        try {
            while(!this.stopped){const code=c.run(20000);if(code===2)break;if(code===3)this.fault();if(code===1)await this.dispatch();if(c.instruction_count()-start>10000000)throw Error('Window callback instruction budget exceeded');if(performance.now()-yielded>8){await this.flush();await new Promise(r=>setTimeout(r,0));yielded=performance.now();}}
            if(!this.stopped&&c.get_reg(4)!==(cdecl?oldSP-args.length*4:oldSP))throw Error('Callback did not preserve its '+(cdecl?'cdecl':'stdcall')+' stack');return c.get_reg(0)>>>0;
        } finally {c.set_reg(8,oldPC);c.set_reg(4,oldSP);this.depth--;}
    }
    async run() {
        if(!this.image||this.image.missing.length)throw Error('No compatible executable loaded');for(const image of this.modules.values())await this.initializeImage(image);await this.initializeImage(this.image);let lastYield=performance.now(),lastStats=lastYield;
        while(!this.stopped){const code=this.cpu.run(10000);if(code===3)this.fault();if(code===2){this.exit(this.cpu.get_reg(0));break;}if(code===1)await this.dispatch();const now=performance.now();
            if(now-lastYield>=8){await this.flush();await new Promise(r=>setTimeout(r,0));lastYield=performance.now();}
            if(now-lastStats>=500){this.emit('stats',this.stats());lastStats=now;}
        }
        await this.flush();return this.exitCode;
    }
    stats() {return {instructions:this.cpu.instruction_count(),cacheHits:this.cpu.hit_count(),cacheMisses:this.cpu.miss_count(),apiCalls:this.calls,apiCounts:{...this.apiCounts},elapsedMs:performance.now()-this.started,guestMemoryMiB:64,queuedMessages:this.messages.length,fileRevision:this.fileRevision};}
    exit(code) {if(this.stopped)return;this.exitCode=code>>>0;this.stopped=true;this.flush();for(const t of this.timers.values())clearInterval(t.timer);this.timers.clear();this.wake();for(const resolve of this.requests.values())resolve(0);this.requests.clear();this.emit('exit',{code:this.exitCode,stats:this.stats()});}
    async request(type,fields={}) {await this.flush();const id=this.nextRequest++;if(this.requests.size>=16)throw Error('Too many browser requests');const promise=new Promise(resolve=>this.requests.set(id,resolve));this.emit(type,{id,...fields});return promise;}
    event(event) {
        if(event.type==='response'){const fn=this.requests.get(event.id);if(fn){this.requests.delete(event.id);fn(event.value);}return;}
        if(event.type==='text'){const control=this.get(event.hwnd,'window');control.text=String(event.text).slice(0,32767);this.post(control.parent,WM.COMMAND,(0x300<<16)|control.id,event.hwnd);return;}
        if(event.type==='button'){const control=this.get(event.hwnd,'window');this.post(control.parent,WM.COMMAND,control.id,event.hwnd);return;}
        if(event.type==='message'){if(![WM.CLOSE,WM.PAINT,0x100,0x101,0x102,0x200,0x201,0x202,0x204,0x205].includes(event.message))throw Error('Unsupported browser input message');this.get(event.hwnd,'window');this.post(event.hwnd,event.message,event.wParam>>>0,event.lParam>>>0);}
    }
    post(hwnd,message,wParam=0,lParam=0) {
        if([WM.PAINT,WM.TIMER,0x200].includes(message)){const found=this.messages.find(m=>m.hwnd===hwnd&&m.message===message&&(message!==WM.TIMER||m.wParam===wParam));if(found){Object.assign(found,{wParam,lParam});this.wake();return 1;}}
        if(this.messages.length>=1024)throw Error('Guest message queue quota exceeded');this.messages.push({hwnd,message,wParam,lParam,time:(performance.now()-this.started)>>>0});this.wake();return 1;
    }
    wake() {for(const fn of this.waiters.splice(0))fn();}
    async getMessage(ptr,hwnd,min,max,remove,wait) {
        if(hwnd===0xffffffff)throw Error('Thread-only message filtering unsupported');
        for(;;){const index=this.messages.findIndex(m=>m.message===WM.QUIT||((!hwnd||m.hwnd===hwnd)&&((!min&&!max)||(m.message>=min&&m.message<=max))));
            if(index>=0){const msg=this.messages[index];if(remove)this.messages.splice(index,1);this.mem.zero(ptr,28);[msg.hwnd,msg.message,msg.wParam,msg.lParam,msg.time].forEach((v,i)=>this.mem.w32(ptr+i*4,v));return wait&&msg.message===WM.QUIT?0:1;}
            if(!wait||this.stopped)return 0;await this.flush();this.emit('idle',this.stats());await new Promise(r=>this.waiters.push(r));
        }
    }
    async windowProc(hwnd,message,wp=0,lp=0) {const w=this.get(hwnd,'window');return w.proc?this.invoke(w.proc,[hwnd,message,wp,lp]):this.defaultProc(hwnd,message,wp,lp);}
    async defaultProc(hwnd,message,wp,lp) {if(message===WM.CLOSE)return this.destroyWindow(hwnd);if(message===0x81)return 1;if(message===WM.PAINT)this.messages=this.messages.filter(m=>m.hwnd!==hwnd||m.message!==WM.PAINT);return 0;}
    async destroyWindow(hwnd) {
        const w=this.get(hwnd,'window');if(w.destroying)return 0;w.destroying=true;
        for(const [id,child]of [...this.handles])if(child.type==='window'&&child.parent===hwnd)await this.destroyWindow(id);
        if(w.proc)await this.invoke(w.proc,[hwnd,WM.DESTROY,0,0]);this.emit('destroy',{hwnd});this.messages=this.messages.filter(x=>x.hwnd!==hwnd);
        for(const [id,t]of this.timers)if(t.hwnd===hwnd){clearInterval(t.timer);this.timers.delete(id);}if(w.dc)this.handles.delete(w.dc);this.handles.delete(hwnd);return 1;
    }
    dc(hwnd) {const w=this.get(hwnd,'window');if(!w.dc)w.dc=this.handle({type:'dc',hwnd,pen:{type:'pen',color:color(0),width:1},brush:{type:'brush',color:color(0xffffff)},font:{type:'font',size:16},text:color(0),background:color(0xffffff),bkMode:2,x:0,y:0});return w.dc;}
    registerAPIs() {
        const m=this.mem,k=(name,count,fn)=>this.register('kernel32.dll',name,count,fn),u=(name,count,fn)=>this.register('user32.dll',name,count,fn),g=(name,count,fn)=>this.register('gdi32.dll',name,count,fn);
        const pair=(register,name,count,fn)=>{register(name+'A',count,(...args)=>fn(false,...args));register(name+'W',count,(...args)=>fn(true,...args));};
        k('ExitProcess',1,code=>{this.exit(code);return 0;});k('GetLastError',0,()=>this.lastError);k('SetLastError',1,n=>{this.lastError=n;});
        k('GetTickCount',0,()=>performance.now()-this.started);k('QueryPerformanceFrequency',1,p=>{m.w32(p,1000000);m.w32(p+4,0);return 1;});
        k('QueryPerformanceCounter',1,p=>{const n=Math.floor(performance.now()*1000);m.w32(p,n);m.w32(p+4,Math.floor(n/4294967296));return 1;});
        k('Sleep',1,n=>{if(n===0xffffffff)throw Error('Infinite Sleep unsupported');this.flush();return new Promise(r=>setTimeout(()=>r(0),Math.min(n,60000)));});
        k('GetCurrentProcessId',0,()=>1);k('GetCurrentThreadId',0,()=>1);k('IsDebuggerPresent',0,()=>0);k('GetProcessHeap',0,()=>0x60000001);
        k('HeapAlloc',3,(heap,flags,n)=>{if(heap!==0x60000001||flags&~8)throw Error('Unsupported heap or flags');return m.alloc(n,!!(flags&8));});
        k('HeapFree',3,(heap,flags,p)=>heap===0x60000001&&m.free(p)?1:0);k('HeapSize',3,(heap,flags,p)=>m.allocations.get(p)??0xffffffff);
        for(const prefix of ['Global','Local']){k(prefix+'Alloc',2,(flags,n)=>{if(flags&2)throw Error('Movable memory unsupported');return m.alloc(n,!!(flags&0x40));});k(prefix+'Free',1,p=>m.free(p)?0:p);k(prefix+'Lock',1,p=>m.allocations.has(p)?p:0);k(prefix+'Unlock',1,()=>0);}
        const modules=['kernel32.dll','user32.dll','gdi32.dll','msvcrt.dll'];
        pair(k,'GetModuleHandle',1,(wide,p)=>{if(!p)return this.image.base;const name=m.string(p,wide).toLowerCase();if(name===this.name.toLowerCase())return this.image.base;const index=modules.indexOf(name);return index<0?0:0xe0000000+index*65536;});
        pair(k,'LoadLibrary',1,(wide,p)=>{const index=modules.indexOf(m.string(p,wide).toLowerCase());if(index<0){this.lastError=126;return 0;}return 0xe0000000+index*65536;});
        k('GetProcAddress',2,(module,p)=>{const dll=modules[(module-0xe0000000)/65536],address=dll?this.resolve(dll,p<=65535?'#'+p:m.string(p)):0;if(!address)this.lastError=127;return address;});
        k('GetCommandLineA',0,()=>this.commandA);k('GetCommandLineW',0,()=>this.commandW);
        pair(k,'GetModuleFileName',3,(wide,h,p,n)=>m.putString(p,'C:\\'+this.name,wide,n));pair(k,'OutputDebugString',1,(wide,p)=>this.log(m.string(p,wide)));
        pair(k,'lstrlen',1,(wide,p)=>m.string(p,wide).length);pair(k,'lstrcpy',2,(wide,to,from)=>{m.putString(to,m.string(from,wide),wide);return to;});
        pair(k,'lstrcmp',2,(wide,a,b)=>{a=m.string(a,wide);b=m.string(b,wide);return a===b?0:a<b?-1:1;});
        pair(k,'CreateFile',7,(wide,p,access,share,security,disposition,flags,template)=>{
            if(security||template||flags&0x40000000)throw Error('Only synchronous private-file IO supported');
            const path=this.path(m.string(p,wide)),exists=this.files.has(path);if(![1,2,3,4,5].includes(disposition))throw Error('Invalid creation disposition');
            if(disposition===1&&exists){this.lastError=80;return 0xffffffff;}if([3,5].includes(disposition)&&!exists){this.lastError=2;return 0xffffffff;}
            if([2,5].includes(disposition)&&!(access&0x40000000)){this.lastError=5;return 0xffffffff;}
            if(!exists||[2,5].includes(disposition)){this.addFile(path,new Uint8Array());this.changed(path);}this.lastError=exists&&[2,4].includes(disposition)?183:0;
            return this.handle({type:'file',path,offset:0,access});
        });
        k('ReadFile',5,(h,p,n,read,overlap)=>{const f=this.get(h,'file');if(overlap)throw Error('Overlapped IO unsupported');if(!(f.access&0x80000000)){this.lastError=5;return 0;}const b=this.files.get(f.path),len=Math.min(n,Math.max(0,b.length-f.offset));m.copy(p,b.subarray(f.offset,f.offset+len));f.offset+=len;if(read)m.w32(read,len);return 1;});
        k('WriteFile',5,(h,p,n,written,overlap)=>{if(overlap)throw Error('Overlapped IO unsupported');m.check(p,n);if(h===0xfffffff5||h===0xfffffff4){this.log(m.string(p,false,n));if(written)m.w32(written,n);return 1;}const f=this.get(h,'file');if(!(f.access&0x40000000)){this.lastError=5;return 0;}const old=this.files.get(f.path);if(n>8*1024*1024||f.offset+n>8*1024*1024)throw Error('Guest file exceeds 8 MiB');const b=new Uint8Array(Math.max(old.length,f.offset+n));b.set(old);b.set(m.bytes.subarray(p,p+n),f.offset);this.addFile(f.path,b);f.offset+=n;this.changed(f.path);if(written)m.w32(written,n);return 1;});
        k('GetStdHandle',1,n=>n);k('CloseHandle',1,h=>{if(this.handles.get(h)?.type!=='file'){this.lastError=6;return 0;}this.handles.delete(h);return 1;});
        k('GetFileSize',2,(h,high)=>{if(high)m.w32(high,0);return this.files.get(this.get(h,'file').path).length;});
        k('SetFilePointer',4,(h,low,high,method)=>{if(high&&m.i32(high)!==0)throw Error('64-bit offsets unsupported');const f=this.get(h,'file');if(method>2)throw Error('Invalid seek mode');const at=(method===0?0:method===1?f.offset:this.files.get(f.path).length)+(low|0);if(at<0||at>8*1024*1024){this.lastError=131;return 0xffffffff;}f.offset=at;if(high)m.w32(high,0);return at;});
        pair(u,'RegisterClass',1,(wide,p)=>{if(this.classes.size>=128)throw Error('Class quota exceeded');const name=m.string(m.u32(p+36),wide);this.classes.set(name,{proc:m.u32(p+4),background:m.u32(p+28),wide});return this.classes.size;});
        pair(u,'RegisterClassEx',1,(wide,p)=>{if(m.u32(p)!==48||this.classes.size>=128)throw Error('Invalid WNDCLASSEX or class quota');const name=m.string(m.u32(p+40),wide);this.classes.set(name,{proc:m.u32(p+8),background:m.u32(p+32),wide});return this.classes.size;});
        pair(u,'CreateWindowEx',12,async(wide,ex,pClass,pTitle,style,x,y,width,height,parent,id,instance,param)=>{
            if(pClass<=65535)throw Error('Class atoms unsupported');const name=m.string(pClass,wide),cls=this.classes.get(name),child=!!(style&0x40000000),text=m.string(pTitle,wide);
            if(!cls&&!['EDIT','BUTTON','STATIC'].includes(name.toUpperCase()))throw Error('Unsupported window class: '+name);
            if(!child&&this.mainWindow)throw Error('One top-level guest window per process currently supported');if(child)this.get(parent,'window');
            if([...this.handles.values()].filter(h=>h.type==='window').length>=128)throw Error('Window quota exceeded');
            width=(width|0)<=0?640:Math.min(width,2048);height=(height|0)<=0?420:Math.min(height,2048);
            const hwnd=this.handle({type:'window',className:name,text,width,height,parent:child?parent:0,id,style,wide,proc:cls?.proc||0,visible:!!(style&0x10000000)});
            if(!child)this.mainWindow=hwnd;await this.emit('window',{hwnd,parent:child?parent:0,className:name,title:text,width,height,x:x|0,y:y|0,style,ex});
            if(cls?.proc){const p=m.alloc(48);[param,instance,id,parent,height,width,y,x,style,pTitle,pClass,ex].forEach((v,i)=>m.w32(p+i*4,v));try{await this.invoke(cls.proc,[hwnd,0x81,0,p]);const result=await this.invoke(cls.proc,[hwnd,WM.CREATE,0,p]);if((result|0)===-1){await this.destroyWindow(hwnd);return 0;}}finally{m.free(p);}}
            return hwnd;
        });
        u('ShowWindow',2,(hwnd,cmd)=>{const w=this.get(hwnd,'window'),previous=w.visible;w.visible=cmd!==0;this.emit('show',{hwnd,visible:w.visible});if(w.visible)this.post(hwnd,WM.PAINT);return previous?1:0;});
        u('UpdateWindow',1,hwnd=>{this.messages=this.messages.filter(x=>x.hwnd!==hwnd||x.message!==WM.PAINT);return this.windowProc(hwnd,WM.PAINT).then(()=>1);});
        u('DestroyWindow',1,h=>this.destroyWindow(h));u('PostQuitMessage',1,code=>this.post(0,WM.QUIT,code));
        for(const suffix of ['A','W']){u('DefWindowProc'+suffix,4,(...a)=>this.defaultProc(...a));u('GetMessage'+suffix,4,(p,h,min,max)=>this.getMessage(p,h,min,max,true,true));u('PeekMessage'+suffix,5,(p,h,min,max,remove)=>this.getMessage(p,h,min,max,!!(remove&1),false));
            u('DispatchMessage'+suffix,1,p=>{const hwnd=m.u32(p),msg=m.u32(p+4);if(!hwnd)return 0;return this.windowProc(hwnd,msg,m.u32(p+8),m.u32(p+12));});u('PostMessage'+suffix,4,(h,msg,wp,lp)=>this.post(h,msg,wp,lp));}
        u('TranslateMessage',1,()=>0); // Browser-generated text input provides WM_CHAR; see compatibility notes.
        pair(u,'SetWindowText',2,(wide,h,p)=>{const w=this.get(h,'window');w.text=m.string(p,wide);this.emit('text',{hwnd:h,text:w.text});return 1;});
        pair(u,'GetWindowText',3,(wide,h,p,n)=>m.putString(p,this.get(h,'window').text,wide,n));pair(u,'GetWindowTextLength',1,(wide,h)=>this.get(h,'window').text.length);
        pair(u,'MessageBox',4,(wide,h,pText,pTitle,flags)=>{if((flags&15)>1)throw Error('MessageBox supports OK and OK/Cancel');return this.request('messagebox',{title:m.string(pTitle,wide),text:m.string(pText,wide),cancel:!!(flags&1)});});
        u('GetClientRect',2,(h,p)=>{const w=this.get(h,'window');[0,0,w.width,w.height].forEach((v,i)=>m.w32(p+i*4,v));return 1;});
        u('InvalidateRect',3,(h,p,erase)=>{this.get(h,'window');return this.post(h,WM.PAINT);});u('ValidateRect',2,h=>{this.messages=this.messages.filter(x=>x.hwnd!==h||x.message!==WM.PAINT);return 1;});
        u('SetTimer',4,(h,id,ms,callback)=>{this.get(h,'window');if(callback)throw Error('Timer callbacks unsupported; use WM_TIMER');id=id||this.timers.size+1;const key=h+':'+id,old=this.timers.get(key);if(old)clearInterval(old.timer);if(this.timers.size>=64&&!old)throw Error('Timer quota exceeded');this.timers.set(key,{hwnd:h,timer:setInterval(()=>{try{this.post(h,WM.TIMER,id);}catch(error){this.emit('error',{message:error.message});this.exit(1);}},Math.max(16,Math.min(ms,60000)))});return id;});
        u('KillTimer',2,(h,id)=>{const key=h+':'+id,t=this.timers.get(key);if(!t)return 0;clearInterval(t.timer);this.timers.delete(key);return 1;});
        u('GetDC',1,h=>this.dc(h));u('ReleaseDC',2,(h,dc)=>this.get(dc,'dc').hwnd===h?1:0);
        u('BeginPaint',2,(h,p)=>{const w=this.get(h,'window'),dc=this.dc(h);m.zero(p,64);m.w32(p,dc);m.w32(p+4,1);m.w32(p+16,w.width);m.w32(p+20,w.height);this.messages=this.messages.filter(x=>x.hwnd!==h||x.message!==WM.PAINT);return dc;});
        u('EndPaint',2,()=>{this.flush();return 1;});
        u('FillRect',3,(dc,p,brush)=>{const d=this.get(dc,'dc'),b=brush<=31?{color:color(0xf0f0f0)}:this.get(brush,'brush');this.draw(d.hwnd,{op:'rect',x:m.i32(p),y:m.i32(p+4),w:m.i32(p+8)-m.i32(p),h:m.i32(p+12)-m.i32(p+4),color:b.color});return 1;});
        g('CreateSolidBrush',1,c=>this.handle({type:'brush',color:color(c)}));
        g('CreatePen',3,(style,width,c)=>{if((style&15)!==0&&(style&15)!==5)throw Error('Only solid/null pens supported');return this.handle({type:'pen',color:color(c),width:Math.max(1,Math.min(width,128)),null:(style&15)===5});});
        const stock=new Map();g('GetStockObject',1,id=>{if(stock.has(id))return stock.get(id);let obj;if(id<=5)obj={type:'brush',color:color([0xffffff,0xc0c0c0,0x808080,0x404040,0,0][id]),null:id===5};else if(id>=6&&id<=8)obj={type:'pen',color:color(id===6?0xffffff:0),width:1,null:id===8};else if([10,11,12,13,14,16,17].includes(id))obj={type:'font',size:16};else throw Error('Unsupported stock object '+id);const h=this.handle({...obj,stock:true});stock.set(id,h);return h;});
        g('SelectObject',2,(dc,h)=>{const d=this.get(dc,'dc'),object=this.get(h);if(!['pen','brush','font'].includes(object.type))throw Error('Unsupported GDI object');let previous=d[object.type+'Handle'];if(!previous){previous=this.handle({...d[object.type],stock:true});}d[object.type]=object;d[object.type+'Handle']=h;return previous;});
        g('DeleteObject',1,h=>{const object=this.handles.get(h);if(!object||object.stock||!['pen','brush','font'].includes(object.type)||[...this.handles.values()].some(d=>d.type==='dc'&&d[object.type+'Handle']===h))return 0;this.handles.delete(h);return 1;});
        g('SetTextColor',2,(dc,c)=>{const d=this.get(dc,'dc'),old=d.text;d.text=color(c);return old[0]|old[1]<<8|old[2]<<16;});g('SetBkColor',2,(dc,c)=>{const d=this.get(dc,'dc'),old=d.background;d.background=color(c);return old[0]|old[1]<<8|old[2]<<16;});
        g('SetBkMode',2,(dc,mode)=>{if(![1,2].includes(mode))return 0;const d=this.get(dc,'dc'),old=d.bkMode;d.bkMode=mode;return old;});
        pair(g,'TextOut',5,(wide,dc,x,y,p,n)=>{if(n>4096)throw Error('TextOut length exceeds 4096');const d=this.get(dc,'dc');this.draw(d.hwnd,{op:'text',x:x|0,y:y|0,text:m.string(p,wide,n),color:d.text,background:d.bkMode===2?d.background:null,size:d.font.size});return 1;});
        pair(g,'GetTextExtentPoint32',4,async(wide,dc,p,n,size)=>{if(n>4096)throw Error('Text measurement too long');const d=this.get(dc,'dc'),result=await this.request('measure',{text:m.string(p,wide,n),size:d.font.size});m.w32(size,result.width);m.w32(size+4,result.height);return 1;});
        pair(g,'CreateFont',14,(wide,height,width,esc,orientation,weight,italic,underline,strike,charset,out,clip,quality,pitch,face)=>{if(esc||orientation||width||italic||underline||strike)throw Error('Only unrotated regular fonts supported');return this.handle({type:'font',size:Math.max(8,Math.min(Math.abs(height|0)||16,128))});});
        g('MoveToEx',4,(dc,x,y,p)=>{const d=this.get(dc,'dc');if(p){m.w32(p,d.x);m.w32(p+4,d.y);}d.x=x|0;d.y=y|0;return 1;});
        g('LineTo',3,(dc,x,y)=>{const d=this.get(dc,'dc');if(!d.pen.null)this.draw(d.hwnd,{op:'line',x:d.x,y:d.y,x2:x|0,y2:y|0,color:d.pen.color,width:d.pen.width});d.x=x|0;d.y=y|0;return 1;});
        for(const[name,op]of[['Rectangle','rect'],['Ellipse','ellipse']])g(name,5,(dc,l,t,r,b)=>{const d=this.get(dc,'dc');this.draw(d.hwnd,{op,x:l|0,y:t|0,w:(r-l)|0,h:(b-t)|0,color:d.brush.null?null:d.brush.color,stroke:d.pen.null?null:d.pen.color,width:d.pen.width});return 1;});
        g('SetPixel',4,(dc,x,y,c)=>{this.draw(this.get(dc,'dc').hwnd,{op:'rect',x:x|0,y:y|0,w:1,h:1,color:color(c)});return c;});g('GdiFlush',0,()=>{this.flush();return 1;});
        const crt=(name,n,fn)=>this.register('msvcrt.dll',name,n,fn,true);
        crt('strlen',1,p=>m.string(p).length);crt('strcmp',2,(a,b)=>{a=m.string(a);b=m.string(b);return a===b?0:a<b?-1:1;});
        for(const name of['memcpy','memmove'])crt(name,3,(to,from,n)=>{m.check(from,n);m.copy(to,m.bytes.slice(from,from+n));return to;});
        crt('memset',3,(p,c,n)=>{m.check(p,n);m.bytes.fill(c&255,p,p+n);this.cpu.touch(p,n);return p;});crt('malloc',1,n=>m.alloc(n,false));crt('free',1,p=>{m.free(p);return 0;});crt('puts',1,p=>{this.log(m.string(p)+'\n');return 0;});crt('exit',1,n=>this.exit(n));
    }
}
Object.assign(globalThis.AsterWin32,{Runtime,WM,color});
if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.AsterWin32;
})();
