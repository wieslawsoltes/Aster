/* Real PE32 integration with deliberately slow display acknowledgements. */
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');require(root+'/src/win32/pe.js');const{Runtime}=require(root+'/src/win32/runtime.js');
(async()=>{
 let runtime,credits=0,peak=0,frames=0,windowReady=false,paintBeforeWindow=false;
 const host=event=>{
  if(event.type==='window'&&!event.parent)return new Promise(resolve=>setTimeout(()=>{windowReady=true;resolve();},120));
  if(event.type==='draw'){
   paintBeforeWindow||=!windowReady;credits++;peak=Math.max(peak,credits);
   return new Promise(resolve=>setTimeout(()=>{credits--;frames++;resolve();if(frames===4)runtime.event({type:'message',hwnd:runtime.mainWindow,message:16});},75));
  }
 };
 runtime=await Runtime.create(fs.readFileSync(root+'/src/win32/x86.wasm'),host);
 runtime.load(fs.readFileSync(root+'/src/win32/examples/gdi.exe'));
 await runtime.run();assert.equal(runtime.exitCode,0);assert.equal(paintBeforeWindow,false);assert(peak<=2);assert(frames>=4);
 const report={status:'PASS',frames,peakOutstandingBatches:peak,windowReadyBeforePainting:!paintBeforeWindow,stats:runtime.stats()};
 fs.mkdirSync(__dirname+'/artifacts',{recursive:true});fs.writeFileSync(__dirname+'/artifacts/backpressure-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
