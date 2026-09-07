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
    postMessage(event);if(event.type==='exit'){releaseCredits();savedFiles();}
}
function savedFiles(force=false){
    if(!process||flushing||(!force&&!process.dirtyFiles.size))return;flushing=true;
    const files=[];for(const path of (force?process.files.keys():process.dirtyFiles)){const bytes=process.files.get(path).slice();files.push({path,bytes});}
    process.dirtyFiles.clear();postMessage({type:'files',files,revision:process.fileRevision},files.map(f=>f.bytes.buffer));flushing=false;
}
function crash(error){releaseCredits();savedFiles();process?.exit(1);postMessage({type:'error',message:String(error.message||error),stats:process?.stats()});}
onmessage=async({data})=>{
    try{
        if(data.type==='ack'){const resolve=credits.get(data.credit);if(resolve){credits.delete(data.credit);resolve();}return;}
        if(data.type==='start'){
            if(started)throw Error('Worker already owns a process');started=true;
            process=await AsterWin32.Runtime.create(data.wasm,host,data.options||{});
            if(!Array.isArray(data.files)||data.files.length>128)throw Error('Invalid file snapshot');
            for(const file of data.files)process.addFile(file.path,file.bytes);
            process.load(new Uint8Array(data.exe),data.name);process.run().catch(crash);
        } else if(data.type==='snapshot'){savedFiles(true);}
        else if(data.type==='stop'){releaseCredits();process?.exit(0);savedFiles(true);postMessage({type:'stopped'});}
        else if(process&&!process.stopped)process.event(data);
    }catch(error){crash(error);}
};
setInterval(()=>savedFiles(),500);
