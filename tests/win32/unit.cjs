'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');require(root+'/src/win32/pe.js');const {Runtime,Memory,RETURN,HOOK}=require(root+'/src/win32/runtime.js');
require(root+'/src/win32/compat.js');
const wasm=fs.readFileSync(root+'/src/win32/x86.wasm'),report={tests:[],benchmarks:{},environment:{node:process.version,platform:process.platform,arch:process.arch}};
let moduleCache;
async function runtime(host,options){moduleCache||=await WebAssembly.compile(wasm);return Runtime.create(moduleCache,host,options);}
const exe=name=>fs.readFileSync(root+'/src/win32/examples/'+name+'.exe');
async function check(name,fn){const t=performance.now();try{const detail=await fn();report.tests.push({name,status:'PASS',ms:performance.now()-t,detail});console.log('PASS',name);}catch(e){report.tests.push({name,status:'FAIL',error:e.stack});console.error('FAIL',name,e);process.exitCode=1;}}
async function cpu(bytes,setup=()=>{}){const r=await runtime();r.mem.copy(0x401000,Uint8Array.from(bytes));r.cpu.mark_executable(0x401000,4096);r.cpu.set_reg(4,0x3e00000);r.mem.w32(0x3e00000,RETURN);r.cpu.set_reg(8,0x401000);setup(r);const status=r.cpu.run(10000);return {r,c:r.cpu,m:r.mem,status};}
const u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
const mutate=(name,fn)=>{const b=Uint8Array.from(exe(name)),v=new DataView(b.buffer);const pe=v.getUint32(60,true),opt=pe+24;fn(b,v,pe,opt);return b;};
(async()=>{
await check('Wasm has no WASI, network or other imported host functions',async()=>{const module=await WebAssembly.compile(wasm);assert.equal(WebAssembly.Module.imports(module).length,0);});
await check('x86 MOV, IMUL and RET execute machine code',async()=>{const {c,status}=await cpu([0xb8,7,0,0,0,0x6b,0xc0,6,0xc3]);assert.equal(status,2);assert.equal(c.get_reg(0),42);});
await check('8-bit high registers and carry overflow',async()=>{const{c}=await cpu([0xb8,0x7f,0x12,0x34,0x56,0x04,1,0x0f,0x90,0xc1,0xb4,0xaa,0xc3]);assert.equal(c.get_reg(0)>>>0,0x5634aa80);assert.equal(c.get_reg(1)&255,1);});
await check('16-bit arithmetic preserves upper register bits',async()=>{const{c}=await cpu([0xb8,...u32(0x1234ffff),0x66,0x05,1,0,0xc3]);assert.equal(c.get_reg(0)>>>0,0x12340000);assert.equal(c.get_reg(9)&65,65);});
await check('ADC and SBB handle carry-in',async()=>{const{c}=await cpu([0xb8,...u32(0xffffffff),0xf9,0x83,0xd0,0,0x83,0xd8,0,0xc3]);assert.equal(c.get_reg(0)>>>0,0xffffffff);assert.equal(c.get_reg(9)&1,1);});
await check('SIB addressing and LEA do not confuse displacement and registers',async()=>{const{c}=await cpu([0xbb,...u32(0x900000),0xb9,3,0,0,0,0xc7,0x44,0x8b,8,0x42,0,0,0,0x8b,0x44,0x8b,8,0x8d,0x54,0x8b,8,0xc3]);assert.equal(c.get_reg(0),66);assert.equal(c.get_reg(2),0x900014);});
await check('POP [ESP] uses the incremented stack pointer',async()=>{const{m,status}=await cpu([0x68,0x12,0,0,0,0x8f,0x04,0x24,0xb8,...u32(RETURN),0x89,0x04,0x24,0xc3]);assert.equal(status,2);assert.equal(m.u32(0x3e00000),RETURN);});
await check('MOVSX and MOVZX use source width',async()=>{const{c}=await cpu([0xb8,0x80,0,0,0,0x0f,0xbe,0xc8,0x0f,0xb6,0xd0,0xc3]);assert.equal(c.get_reg(1),-128);assert.equal(c.get_reg(2),128);});
await check('Signed division preserves quotient and remainder',async()=>{const{c}=await cpu([0xb8,...u32(-101),0x99,0xbb,7,0,0,0,0xf7,0xfb,0xc3]);assert.equal(c.get_reg(0),-14);assert.equal(c.get_reg(2),-3);});
await check('Division by zero is a guest fault, not success',async()=>{const{c,status}=await cpu([0x31,0xdb,0xf7,0xf3,0xc3]);assert.equal(status,3);assert.equal(c.get_fault(),5);});
await check('REP MOVSB copies and advances registers',async()=>{const{c,m}=await cpu([0xbe,...u32(0x900000),0xbf,...u32(0x910000),0xb9,3,0,0,0,0xf3,0xa4,0xc3],r=>r.mem.copy(0x900000,new Uint8Array([7,8,9])));assert.deepEqual([...m.bytes.slice(0x910000,0x910003)],[7,8,9]);assert.equal(c.get_reg(1),0);assert.equal(c.get_reg(6),0x900003);});
await check('Direction flag controls backwards string operations',async()=>{const{m,c}=await cpu([0xbe,...u32(0x900002),0xbf,...u32(0x910002),0xb9,3,0,0,0,0xfd,0xf3,0xa4,0xfc,0xc3],r=>r.mem.copy(0x900000,new Uint8Array([7,8,9])));assert.deepEqual([...m.bytes.slice(0x910000,0x910003)],[7,8,9]);assert.equal(c.get_reg(9)&1024,0);});
await check('FS loads use the emulated TEB, not host memory',async()=>{const{c}=await cpu([0x64,0xa1,0x18,0,0,0,0xc3],r=>{r.cpu.set_fs(0x10000);r.mem.w32(0x10018,0x10000);});assert.equal(c.get_reg(0),0x10000);});
await check('Decoder cache invalidates when code is patched',async()=>{const{r,c,m}=await cpu([0xb8,1,0,0,0,0xc3]);assert.equal(c.get_reg(0),1);m.w32(0x401001,2);c.set_reg(8,0x401000);c.set_reg(4,0x3e00000);assert.equal(c.run(100),2);assert.equal(c.get_reg(0),2);});
await check('Unsupported x87 transcendental instruction fails with an address',async()=>{const{c,status}=await cpu([0xd9,0xf2,0xc3]);assert.equal(status,3);assert.equal(c.get_fault(),3);assert.equal(c.get_fault_pc(),0x401000);});
await check('Out-of-bounds guest stores cannot overwrite emulator state',async()=>{const{c,status}=await cpu([0xa3,...u32(0xfffffffc),0xc3]);assert.equal(status,3);assert.equal(c.get_fault(),1);});
await check('Unmapped executable page is not executable',async()=>{const{c,status}=await cpu([0xb8,...u32(0x900000),0xff,0xe0]);assert.equal(status,3);assert.equal(c.get_fault(),2);});
await check('Busy guest returns at the instruction budget',async()=>{const{c,status}=await cpu([0xeb,0xfe]);assert.equal(status,0);assert.equal(c.instruction_count(),10000);});
await check('JavaScript API memory access has the same hard bounds',async()=>{const r=await runtime();for(const [p,n]of[[0,1],[0xffffffff,4],[0x3fffffe,4],[4096,-1]])assert.throws(()=>r.mem.check(p,n));assert.throws(()=>r.mem.alloc(17*1024*1024));});
await check('PE32 import metadata resolves actual Windows DLL exports',async()=>{const r=await runtime();const image=r.load(exe('pad'),'pad.exe');assert.equal(image.machine,'i386');assert.equal(image.missing.length,0);assert(image.imports.some(x=>x.name==='WriteFile'&&x.dll==='kernel32.dll'));});
await check('PE HIGHLOW relocation executes the same program at another base',async()=>{let r;r=await runtime(e=>{if(e.type==='messagebox')r.event({type:'response',id:e.id,value:1});},{base:0x800000});r.load(exe('hello'));assert.equal(r.image.relocated,true);await r.run();assert.equal(r.exitCode,0);});
for(const[name,change,pattern]of[
 ['Bad MZ',(b,v)=>v.setUint16(0,0,true),/MZ/],
 ['Bad machine x64',(b,v,pe)=>v.setUint16(pe+4,0x8664,true),/Unsupported CPU/],
 ['DLL',(b,v,pe)=>v.setUint16(pe+22,0x2102,true),/DLL/],
 ['CLR image',(b,v,pe,opt)=>v.setUint32(opt+96+14*8,0x2000,true),/CLR/],
 ['TLS callbacks',(b,v,pe,opt)=>v.setUint32(opt+96+9*8,0x2000,true),/TLS/],
 ['Excessive image size',(b,v,pe,opt)=>v.setUint32(opt+56,0x70000000,true),/image/],
 ['Entry outside executable section',(b,v,pe,opt)=>v.setUint32(opt+16,0x3000,true),/Entry/],
 ['Truncated headers',(b,v,pe,opt)=>v.setUint16(pe+20,0xffff,true),/Truncated/]
])await check('PE rejection: '+name,async()=>{const r=await runtime();assert.throws(()=>r.load(mutate('hello',change)),pattern);});
await check('Unknown import is listed and prevents any guest execution',async()=>{const b=Uint8Array.from(exe('hello')),needle=Buffer.from('MessageBoxW');const at=Buffer.from(b).indexOf(needle);assert(at>0);b.set(Buffer.from('MissingCall'),at);const r=await runtime();assert.throws(()=>r.load(b),/Unsupported imports/);assert(r.image.missing.includes('user32.dll!MissingCall'));assert.equal(r.cpu.instruction_count(),0);});
await check('Worker publishes a real loader failure before its exit notification',async()=>{
 const vm=require('node:vm'),events=[],bad=Uint8Array.from(exe('hello'));
 const at=Buffer.from(bad).indexOf(Buffer.from('MessageBoxW'));assert(at>0);bad.set(Buffer.from('MissingCall'),at);
 const sandbox={AsterWin32:{Runtime},Uint8Array,postMessage:e=>events.push(e),setInterval:()=>0,onmessage:null};
 vm.createContext(sandbox);vm.runInContext(fs.readFileSync(root+'/src/win32/worker.js','utf8'),sandbox);
 await sandbox.onmessage({data:{type:'start',wasm:moduleCache,exe:bad.buffer,name:'invalid.exe',files:[]}});
 const error=events.findIndex(e=>e.type==='error'),exit=events.findIndex(e=>e.type==='exit');
 assert(error>=0);assert(exit>error);assert.match(events[error].message,/MissingCall/);assert.equal(events[error].stats.instructions,0);
 return {order:events.map(e=>e.type),executedInstructions:0};
});
await check('Path traversal, UNC, device and alternate-drive paths are denied',async()=>{const r=await runtime();for(const p of['../secret','C:\\..\\secret','D:\\x','\\\\host\\share','NUL','folder/COM1.txt','a:b','x.','a\0b'])assert.throws(()=>r.path(p),p);assert.equal(r.path('C:\\Data\\Note.txt'),'data/note.txt');});
await check('File budgets and private-drive isolation',async()=>{const r=await runtime(),other=await runtime();r.addFile('note.txt',new Uint8Array([1,2]));assert.equal(other.files.size,0);assert.throws(()=>r.addFile('big.bin',new Uint8Array(8*1024*1024+1)),/quota/);});
await check('Unicode MessageBoxW resumes x86 code with the selected result',async()=>{let r,title;r=await runtime(e=>{if(e.type==='messagebox'){title=e.text;r.event({type:'response',id:e.id,value:2});}});r.load(exe('hello'));await r.run();assert.equal(r.exitCode,2);assert(title.includes('Zażółć'));});
await check('Compiled Pad handles WM_COMMAND and executes UTF-16 WriteFile/ReadFile',async()=>{
 let r,stage=0;const phrase='Aster zażółć — user input',events=[];
 r=await runtime(e=>{events.push(e);if(e.type==='idle')setTimeout(()=>{
  const controls=events.filter(x=>x.type==='window'),edit=controls.find(x=>x.className==='EDIT'),button=text=>controls.find(x=>x.title===text);
  if(stage===0){stage++;r.event({type:'text',hwnd:edit.hwnd,text:phrase});r.event({type:'button',hwnd:button('Save note').hwnd});}
  else if(stage===1){stage++;r.event({type:'button',hwnd:button('Clear').hwnd});r.event({type:'button',hwnd:button('Load note').hwnd});}
  else r.event({type:'message',hwnd:r.mainWindow,message:16});
 },0);});r.load(exe('pad'));await r.run();assert.equal(Buffer.from(r.files.get('note.txt')).toString('utf16le'),phrase);assert(events.some(e=>e.type==='text'&&e.text===phrase));assert.equal(r.exitCode,0);assert(r.apiCounts['kernel32.dll!ReadFile']>=1);assert.equal(r.handles.size,[...r.handles.values()].filter(h=>h.type!=='window'&&h.type!=='dc').length);
});
await check('Compiled GDI app responds to pointer messages and emits draw commands',async()=>{
 let r,stage=0,clicked=false;r=await runtime(e=>{if(e.type==='draw'&&stage>0)clicked||=e.commands.some(c=>c.op==='ellipse'&&c.x===172&&c.y===152);if(e.type==='idle')setTimeout(()=>{if(stage++===0){r.event({type:'message',hwnd:r.mainWindow,message:513,wParam:1,lParam:200|(180<<16)});}else r.event({type:'message',hwnd:r.mainWindow,message:16});},0);});r.load(exe('gdi'));await r.run();assert(clicked);assert.equal(r.exitCode,0);assert.equal(r.timers.size,0);
});
await check('GDI drains do not retain a growing history of completed batch results',async()=>{
 const batches=[],r=await runtime(e=>{if(e.type==='draw'){batches.push(e.commands.length);return Promise.resolve({discardedHostResult:true});}});
 for(let n=0;n<40;n++){r.draw(1,{op:'rect',x:0,y:0,w:1,h:1,color:[1,2,3,255]});assert.equal(await r.flush(),undefined);}
 assert.equal(batches.length,40);assert.equal(r.pendingDraws.size,0);assert.equal(r.drawCount,0);
 return {completedBatches:40,retainedResult:typeof await r.graphicsReady};
});
await check('GDI batches enforce the 4096-command ceiling',async()=>{
 const batches=[],r=await runtime(e=>{if(e.type==='draw')batches.push(e.commands.length);});
 for(let n=0;n<4096;n++)r.draw(1,{op:'rect',x:n,y:0,w:1,h:1,color:[1,2,3,255]});
 await r.flush();assert.deepEqual(batches,[4096]);assert.equal(r.drawCount,0);
 r.draw(1,{op:'rect',x:0,y:0,w:1,h:1,color:[1,2,3,255]});await r.flush();assert.deepEqual(batches,[4096,1]);
});
await check('No host process, network, COM or Windows installer APIs exist',async()=>{const r=await runtime();for(const[dll,name]of[['kernel32.dll','CreateProcessA'],['shell32.dll','ShellExecuteW'],['ws2_32.dll','connect'],['ole32.dll','CoCreateInstance'],['msi.dll','MsiInstallProductW']])assert.equal(r.resolve(dll,name),0);return r.apis.size+' named exports, each with documented subset semantics';});
await check('Cached and uncached x86 produce identical results; measure both',async()=>{
 let expected=2166136261;for(let i=0;i<200000;i++){expected=Math.imul(expected^i,16777619)>>>0;expected=((expected<<5)|(expected>>>27))>>>0;}const samples={cached:[],uncached:[]};let stats;
 for(let repeat=0;repeat<4;repeat++)for(const cached of[true,false]){const r=await runtime(()=>{},{cache:cached});r.load(exe('compute'));const t=performance.now();await r.run();const ms=performance.now()-t;assert.equal(Buffer.from(r.files.get('checksum.txt')).toString(),expected+'\n');assert.equal(r.exitCode,0);if(repeat)samples[cached?'cached':'uncached'].push(ms);if(cached)stats=r.stats();}
 const median=a=>a.slice().sort((a,b)=>a-b)[1];report.benchmarks={...samples,cachedMedianMs:median(samples.cached),uncachedMedianMs:median(samples.uncached),ratio:median(samples.uncached)/median(samples.cached),instructions:stats.instructions,cacheHits:stats.cacheHits,checksum:expected,note:'Node software-emulator microbenchmark; not native Windows speed, GPU FPS or a general application benchmark.'};return report.benchmarks;
});
const dir=path.join(__dirname,'artifacts');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'unit-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.tests.filter(t=>t.status==='PASS').length,failed:report.tests.filter(t=>t.status==='FAIL').length,benchmark:report.benchmarks},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
