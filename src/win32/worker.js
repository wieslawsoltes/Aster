/* Included after pe.js and runtime.js in a dedicated Blob Worker. MIT. */
'use strict';
let process=null,started=false,flushing=false;
function savedFiles(force=false){
    if(!process||flushing||(!force&&!process.dirtyFiles.size))return;flushing=true;
    const files=[];for(const path of (force?process.files.keys():process.dirtyFiles)){const bytes=process.files.get(path).slice();files.push({path,bytes});}
    process.dirtyFiles.clear();postMessage({type:'files',files,revision:process.fileRevision},files.map(f=>f.bytes.buffer));flushing=false;
}
function crash(error){savedFiles();if(process){process.exit(1);}postMessage({type:'error',message:String(error.message||error),stats:process?.stats()});}
onmessage=async({data})=>{
    try{
        if(data.type==='start'){
            if(started)throw Error('Worker already owns a process');started=true;
            process=await AsterWin32.Runtime.create(data.wasm,e=>{postMessage(e);if(e.type==='exit')savedFiles();},data.options||{});
            if(!Array.isArray(data.files)||data.files.length>128)throw Error('Invalid file snapshot');
            for(const file of data.files)process.addFile(file.path,file.bytes);
            process.load(new Uint8Array(data.exe),data.name);process.run().catch(crash);
        } else if(data.type==='snapshot'){savedFiles(true);}
        else if(data.type==='stop'){process?.exit(0);savedFiles(true);postMessage({type:'stopped'});}
        else if(process&&!process.stopped)process.event(data);
    }catch(error){crash(error);}
};
setInterval(()=>savedFiles(),500);
