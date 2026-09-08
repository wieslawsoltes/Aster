/* Dedicated worker transport. Render credits provide bounded backpressure. MIT. */
'use strict';
let process=null,started=false,flushing=false,nextCredit=1;
const credits=new Map();
function releaseCredits(){for(const resolve of credits.values())resolve();credits.clear();}
function host(event){
    if(event.type==='draw'||(event.type==='window'&&!event.parent)){
        if(credits.size>=8)throw Error('Unacknowledged graphics batch quota exceeded');
        const credit=nextCredit++,promise=new Promise(resolve=>credits.set(credit,resolve));
        postMessage({...event,credit});return promise;
    }
    postMessage(event);if(event.type==='exit'){releaseCredits();savedFiles();savedRegistry();}
}
function savedFiles(force=false){
    if(!process||flushing||(!force&&!process.dirtyFiles.size))return;flushing=true;
    const files=[];for(const path of (force?process.files.keys():process.dirtyFiles)){const bytes=process.files.has(path)?process.files.get(path).slice():null;files.push({path,bytes});}
    process.dirtyFiles.clear();postMessage({type:'files',files,revision:process.fileRevision},files.filter(f=>f.bytes).map(f=>f.bytes.buffer));flushing=false;
}
function savedRegistry(force=false){
    if(!process?.registry||(!force&&!process.registry.dirty))return;
    const snapshot=process.exportRegistry();process.registry.dirty=false;
    postMessage({type:'registry',snapshot,revision:process.registry.revision});
}
function crash(error){
    releaseCredits();savedFiles();savedRegistry();
    // Preserve the failure diagnostic before exit handling schedules Stop.
    // Otherwise the main thread may mark the session halted and suppress it.
    postMessage({type:'error',message:String(error.message||error),stats:process?.stats()});
    process?.exit(1);
}
onmessage=async({data})=>{
    try{
        if(data.type==='ack'){const resolve=credits.get(data.credit);if(resolve){credits.delete(data.credit);resolve();}return;}
        if(data.type==='start'){
            if(started)throw Error('Worker already owns a process');started=true;
            process=await AsterWin32.Runtime.create(data.wasm,host,data.options||{});
            if(!Array.isArray(data.files)||data.files.length>512)throw Error('Invalid file snapshot');
            for(const file of data.files)process.addFile(file.path,file.bytes);
            process.importRegistry?.(data.registry);
            process.load(new Uint8Array(data.exe),data.name);process.run().catch(crash);
        } else if(data.type==='snapshot'){savedFiles(true);savedRegistry(true);}
        else if(data.type==='stop'){releaseCredits();process?.exit(0);savedFiles(true);savedRegistry(true);postMessage({type:'stopped'});}
        else if(process&&!process.stopped)process.event(data);
    }catch(error){crash(error);}
};
setInterval(()=>{savedFiles();savedRegistry();},500);
