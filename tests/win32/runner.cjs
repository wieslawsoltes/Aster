'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
require(root+'/src/win32/pe.js');require(root+'/src/win32/runtime.js');require(root+'/src/win32/compat.js');
const wasm=fs.readFileSync(root+'/src/win32/x86.wasm');
const {Runtime,RETURN}=globalThis.AsterWin32;
const tccFiles=()=>JSON.parse(fs.readFileSync(root+'/src/win32/third-party/tcc-files.json')).map(f=>({path:f.path,bytes:Buffer.from(f.base64,'base64')}));
async function runGuest(bytes,name,args='',files=[],options={}){
 let output='',timer;const r=await Runtime.create(wasm,e=>{if(e.type==='stdout')output+=e.text;options.host?.(e,r);},{args,...options});
 try{for(const f of files)r.addFile(f.path,f.bytes);r.load(bytes,name);const begin=performance.now();timer=setTimeout(()=>r.exit(124),options.timeout||15000);await r.run();return {r,output,exitCode:r.exitCode,ms:performance.now()-begin,files:[...r.files].map(([path,bytes])=>({path,bytes})),stats:r.stats()};}finally{clearTimeout(timer);if(!r.stopped)r.exit(125);}
}
async function machine(code,setup=()=>{}){
 const r=await Runtime.create(wasm);r.mem.copy(0x401000,Uint8Array.from(code));r.cpu.mark_executable(0x401000,code.length);r.cpu.set_reg(8,0x401000);r.cpu.set_reg(4,0x3e00000);r.mem.w32(0x3e00000,RETURN);setup(r);return {r,c:r.cpu,m:r.mem,status:r.cpu.run(10000)};
}
const u32=n=>[n&255,(n>>>8)&255,(n>>>16)&255,n>>>24];
module.exports={root,wasm,Runtime,runGuest,tccFiles,machine,u32};
