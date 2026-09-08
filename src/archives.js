/* ZIP32 archive codec. Stored and DEFLATE, UTF-8 names, CRC32, strict bounds. MIT. */
'use strict';
(function(root,factory) {
    const api=factory();let active=0;
    // Long CRC and codec loops run off the desktop thread. This Worker contains
    // only this codec and is terminated on success, failure or the time limit.
    api.run=(operation,input)=>{
        if(!['pack','unpack'].includes(operation))return Promise.reject(Error('Unsupported archive operation'));
        if(typeof Worker==='undefined')return api[operation](input);
        if(active>=2)return Promise.reject(Error('Two archive jobs are already running. Wait for one to finish.'));
        active++;
        return new Promise((resolve,reject)=>{
            const source=`const codec=(${factory.toString()})();onmessage=async({data})=>{try{postMessage({result:await codec[data.operation](data.input)});}catch(error){postMessage({error:error.message});}};`;
            const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));let worker,timer;
            let finished=false;const finish=(error,result)=>{if(finished)return;finished=true;active--;clearTimeout(timer);worker?.terminate();URL.revokeObjectURL(url);error?reject(error):resolve(result);};
            try{worker=new Worker(url);worker.onmessage=({data})=>finish(data.error?Error(data.error):null,data.result);worker.onerror=e=>finish(Error(e.message||'Archive Worker failed'));timer=setTimeout(()=>finish(Error('Archive operation exceeded 60 seconds')),60000);worker.postMessage({operation,input});}
            catch(error){finish(error);}
        });
    };
    if(typeof module==='object'&&module.exports)module.exports=api;else root.AsterZIP=api;
})(globalThis,()=>{
    const LIMIT=64*1024*1024, MAX_ENTRIES=1024, encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
    const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
    function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
    function safeName(name) {
        if(typeof name!=='string'||!name||name.length>1024||/^[\\/]|[\\:\x00-\x1f\x7f]/.test(name))throw Error('Unsafe ZIP path.');
        const directory=name.endsWith('/'), parts=(directory?name.slice(0,-1):name).split('/');
        if(parts.length>32||parts.some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||p.trim()!==p||/[. ]$/.test(p)))throw Error('Unsafe ZIP path.');
        return parts.join('/')+(directory?'/':'');
    }
    const streamTransform=async(bytes,mode,expected=LIMIT)=>{
        const ctor=mode==='compress'?globalThis.CompressionStream:globalThis.DecompressionStream;
        if(!ctor)throw Error('This browser cannot decode DEFLATE ZIP entries. Use a stored ZIP or Win32 7-Zip.');
        let transform;try{transform=new ctor('deflate-raw');}catch{throw Error('DEFLATE ZIP support is unavailable in this browser.');}
        const reader=new Blob([bytes]).stream().pipeThrough(transform).getReader(), chunks=[];let length=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>expected||length>LIMIT)throw Error('ZIP decompression limit exceeded.');chunks.push(value);}}
        catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
        const out=new Uint8Array(length);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;
    };
    async function pack(entries, compress=true) {
        if(!Array.isArray(entries)||entries.length>MAX_ENTRIES)throw Error('ZIP entry limit exceeded (1024).');
        const local=[],central=[],seen=new Set();let offset=0,total=0;
        for(const entry of entries){
            const name=safeName(entry.name), key=name.replace(/\/$/,'').toLowerCase();
            if(seen.has(key))throw Error('Duplicate ZIP path.');seen.add(key);
            const data=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes||0);
            total+=data.length;if(total>LIMIT)throw Error('ZIP input exceeds 64 MiB.');
            if(name.endsWith('/')&&data.length)throw Error('ZIP directory contains data.');
            const filename=encoder.encode(name),crc=crc32(data);let payload=data,method=0;
            if(compress&&data.length>64){try{const zipped=await streamTransform(data,'compress');if(zipped.length<data.length){payload=zipped;method=8;}}catch{/* Stored ZIP is universally readable. */}}
            const header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
            h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(8,method,true);h.setUint16(12,33,true);
            h.setUint32(14,crc,true);h.setUint32(18,payload.length,true);h.setUint32(22,data.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);local.push(header,payload);
            const directory=new Uint8Array(46+filename.length),d=new DataView(directory.buffer);
            d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(10,method,true);d.setUint16(14,33,true);
            d.setUint32(16,crc,true);d.setUint32(20,payload.length,true);d.setUint32(24,data.length,true);d.setUint16(28,filename.length,true);d.setUint32(38,name.endsWith('/')?16:0,true);d.setUint32(42,offset,true);directory.set(filename,46);central.push(directory);offset+=header.length+payload.length;
        }
        const size=central.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
        e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
        return new Blob([...local,...central,end],{type:'application/zip'});
    }
    function inspect(input) {
        const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
        if(bytes.length>LIMIT+1024*1024||bytes.length<22)throw Error('Invalid or oversized ZIP.');
        const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),range=(offset,n)=>{if(!Number.isSafeInteger(offset)||offset<0||n<0||offset+n>bytes.length)throw Error('Truncated ZIP.');};
        let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){end=i;break;}
        if(end<0)throw Error('ZIP directory not found.');
        const count=v.getUint16(end+10,true),size=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
        if(v.getUint16(end+4,true)||v.getUint16(end+6,true)||v.getUint16(end+8,true)!==count||count>MAX_ENTRIES||start+size!==end)throw Error('Multi-disk, ZIP64, or malformed ZIP is unsupported.');
        const entries=[],names=new Map(),intervals=[];let at=start,total=0;
        for(let i=0;i<count;i++){
            range(at,46);if(v.getUint32(at,true)!==0x02014b50)throw Error('Invalid ZIP entry.');
            const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true),crc=v.getUint32(at+16,true),packed=v.getUint32(at+20,true),length=v.getUint32(at+24,true),nameLength=v.getUint16(at+28,true),extra=v.getUint16(at+30,true),comment=v.getUint16(at+32,true),local=v.getUint32(at+42,true);
            if(flags&~0x80e || flags&1 || ![0,8].includes(method)||v.getUint16(at+34,true))throw Error('Encrypted or unsupported ZIP entry.');
            if((v.getUint32(at+38,true)>>>16&0xf000)===0xa000)throw Error('ZIP symbolic links are not allowed.');
            range(at+46,nameLength+extra+comment);let nameBytes=bytes.subarray(at+46,at+46+nameLength);
            if(!(flags&0x800)&&nameBytes.some(b=>b>=128))throw Error('Use UTF-8 ZIP filenames.');
            const name=safeName(decoder.decode(nameBytes)),directory=name.endsWith('/'),key=name.replace(/\/$/,'').toLowerCase();
            if(names.has(key))throw Error('Duplicate ZIP path.');names.set(key,directory);
            if(directory&&length||length>LIMIT||packed>LIMIT||method===0&&packed!==length)throw Error('Invalid ZIP entry size.');
            total+=length;if(total>LIMIT)throw Error('ZIP expanded size exceeds 64 MiB.');
            range(local,30);if(v.getUint32(local,true)!==0x04034b50||v.getUint16(local+6,true)!==flags||v.getUint16(local+8,true)!==method)throw Error('ZIP local and central headers disagree.');
            const nl=v.getUint16(local+26,true),el=v.getUint16(local+28,true),dataAt=local+30+nl+el;
            range(local+30,nl+el);if(decoder.decode(bytes.subarray(local+30,local+30+nl))!==name)throw Error('ZIP filenames disagree.');
            if(!(flags&8)&&(v.getUint32(local+14,true)!==crc||v.getUint32(local+18,true)!==packed||v.getUint32(local+22,true)!==length))throw Error('ZIP sizes or checksums disagree.');
            range(dataAt,packed);if(dataAt+packed>start)throw Error('ZIP data overlaps directory.');intervals.push([local,dataAt+packed]);
            entries.push({name,directory,length,packed,method,crc,dataAt});at+=46+nameLength+extra+comment;
        }
        if(at!==end)throw Error('Invalid central directory length.');
        intervals.sort((a,b)=>a[0]-b[0]);for(let i=1;i<intervals.length;i++)if(intervals[i][0]<intervals[i-1][1])throw Error('Overlapping ZIP entries.');
        for(const [key]of names){const parts=key.split('/');parts.pop();while(parts.length){if(names.get(parts.join('/'))===false)throw Error('ZIP file conflicts with a folder.');parts.pop();}}
        return {entries,total,bytes};
    }
    async function unpack(input) {
        const parsed=inspect(input),result=[];
        for(const entry of parsed.entries){const payload=parsed.bytes.subarray(entry.dataAt,entry.dataAt+entry.packed),data=entry.method===0?payload.slice():await streamTransform(payload,'decompress',entry.length);
            if(data.length!==entry.length||crc32(data)!==entry.crc)throw Error('ZIP checksum or expanded size mismatch: '+entry.name);
            result.push({name:entry.name,bytes:data});
        }
        return result;
    }
    return {pack,unpack,inspect,crc32,safeName,LIMIT,MAX_ENTRIES};
});
