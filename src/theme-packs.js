/* Bounded Microsoft CAB theme-pack reader/writer. Stored and MSZIP folders.
 * Original RFC1951 decoder retains the 32 KiB dictionary across MSZIP blocks.
 * LZX, Quantum, spanning cabinets and executable payloads are never guessed.
 * Codec work runs in a disposable Worker. MIT.
 */
'use strict';
(function(root,factory){
    const api=factory();let active=0;
    api.run=(op,input)=>{
        if(!['pack','unpack'].includes(op))return Promise.reject(Error('Invalid theme pack operation.'));
        if(typeof Worker==='undefined')return Promise.resolve().then(()=>api[op](input));
        if(active>=2)return Promise.reject(Error('Two theme pack jobs are already running.'));
        active++;
        return new Promise((resolve,reject)=>{
            const url=URL.createObjectURL(new Blob([`const codec=(${factory.toString()})();onmessage=({data})=>{try{postMessage({result:codec[data.op](data.input)});}catch(e){postMessage({error:e.message});}};`],{type:'text/javascript'}));
            let worker,timer,done=false;const finish=(err,result)=>{if(done)return;done=true;active--;clearTimeout(timer);worker?.terminate();URL.revokeObjectURL(url);err?reject(err):resolve(result);};
            try{worker=new Worker(url);worker.onmessage=({data})=>finish(data.error?Error(data.error):null,data.result);worker.onerror=e=>finish(Error(e.message));timer=setTimeout(()=>finish(Error('Theme pack exceeded 30 seconds.')),30000);worker.postMessage({op,input});}catch(e){finish(e);}
        });
    };
    if(typeof module==='object'&&module.exports)module.exports=api;else root.AsterThemePacks=api;
})(globalThis,()=>{
    const LIMIT=32*1024*1024, encoder=new TextEncoder();
    function path(name){if(typeof name!=='string')throw Error('Invalid CAB filename.');name=name.replace(/\\/g,'/');if(name.length>240||!name||/[\x00-\x1f\x7f:]/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')||/[. ]$/.test(p)))throw Error('Unsafe CAB path.');return name;}
    function noParents(names){for(const name of names){const parts=name.split('/');parts.pop();while(parts.length){if(names.has(parts.join('/')))throw Error('CAB file conflicts with a folder.');parts.pop();}}}
    function checksum(bytes, seed=0){let c=seed>>>0,i=0;for(;i+4<=bytes.length;i+=4)c^=(bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16|bytes[i+3]<<24);let tail=0;for(;i<bytes.length;i++)tail=tail<<8|bytes[i];return(c^tail)>>>0;}
    function inflate(input, expected, dictionary=new Uint8Array()){
        if(!Number.isInteger(expected)||expected<0||expected>32768||dictionary.length>32768)throw Error('Invalid MSZIP block size.');
        let pos=0,bits=0,hold=0,at=0;
        const out=new Uint8Array(expected);
        const read=n=>{while(bits<n){if(pos>=input.length)throw Error('Truncated DEFLATE bits.');hold|=input[pos++]<<bits;bits+=8;}const v=hold&((1<<n)-1);hold>>>=n;bits-=n;return v;};
        function tree(lengths){
            const counts=new Uint16Array(16),next=new Uint16Array(16),tables=Array.from({length:16},()=>new Map());
            for(const n of lengths){if(n>15)throw Error('Invalid Huffman length.');if(n)counts[n]++;}
            let code=0,remaining=1;for(let n=1;n<=15;n++){remaining=remaining*2-counts[n];if(remaining<0)throw Error('Oversubscribed Huffman tree.');code=(code+counts[n-1])<<1;next[n]=code;}
            for(let sym=0;sym<lengths.length;sym++){const n=lengths[sym];if(!n)continue;let k=next[n]++,rev=0;for(let j=0;j<n;j++){rev=rev<<1|k&1;k>>>=1;}tables[n].set(rev,sym);}
            return tables;
        }
        const symbol=t=>{let code=0;for(let n=1;n<=15;n++){code|=read(1)<<(n-1);const s=t[n].get(code);if(s!==undefined)return s;}throw Error('Invalid Huffman symbol.');};
        const lb=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
        const le=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
        const db=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
        const de=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
        let last=0,blocks=0;
        while(!last){if(++blocks>65536)throw Error('DEFLATE block limit.');last=read(1);const kind=read(2);
            if(kind===0){read(bits%8);const len=read(16),nlen=read(16);if((len^nlen)!==65535||at+len>expected)throw Error('Invalid stored block.');for(let i=0;i<len;i++)out[at++]=read(8);continue;}
            if(kind===3)throw Error('Reserved DEFLATE block.');
            let lt,dt;
            if(kind===1){lt=tree(Array.from({length:288},(_,i)=>i<144?8:i<256?9:i<280?7:8));dt=tree(new Array(32).fill(5));}
            else{const nl=read(5)+257,nd=read(5)+1,nc=read(4)+4;if(nl>286||nd>32)throw Error('Invalid dynamic tree count.');
                const order=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],cl=new Array(19).fill(0);for(let i=0;i<nc;i++)cl[order[i]]=read(3);
                const ct=tree(cl),lens=[];
                while(lens.length<nl+nd){const s=symbol(ct);if(s<16)lens.push(s);else{let repeat,value=0;if(s===16){if(!lens.length)throw Error('Missing repeated code.');repeat=read(2)+3;value=lens.at(-1);}else if(s===17)repeat=read(3)+3;else if(s===18)repeat=read(7)+11;else throw Error('Invalid repeat.');if(lens.length+repeat>nl+nd)throw Error('Code-length overflow.');while(repeat--)lens.push(value);}}
                if(!lens[256])throw Error('Missing end code.');lt=tree(lens.slice(0,nl));dt=tree(lens.slice(nl));}
            while(true){const s=symbol(lt);if(s===256)break;if(s<256){if(at>=expected)throw Error('MSZIP expansion exceeds block size.');out[at++]=s;continue;}
                if(s>285)throw Error('Reserved length code.');const len=lb[s-257]+read(le[s-257]),d=symbol(dt);if(d>29)throw Error('Reserved distance code.');const distance=db[d]+read(de[d]);
                if(distance>at+dictionary.length||at+len>expected)throw Error('DEFLATE history or output bound.');for(let i=0;i<len;i++){const index=at-distance;out[at++]=index<0?dictionary[dictionary.length+index]:out[index];}}
        }
        if(at!==expected||pos!==input.length)throw Error('MSZIP output size or trailing data mismatch.');return out;
    }
    function unpack(input){
        const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
        if(bytes.length<44||bytes.length>LIMIT)throw Error('Invalid or oversized CAB.');
        const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
        const check=(at,n)=>{if(!Number.isSafeInteger(at)||at<0||n<0||at+n>bytes.length)throw Error('Truncated CAB.');};
        const u16=at=>{check(at,2);return v.getUint16(at,true);},u32=at=>{check(at,4);return v.getUint32(at,true);};
        if(u32(0)!==0x4643534d||u32(8)!==bytes.length||bytes[24]!==3||bytes[25]!==1)throw Error('Invalid CAB header or version.');
        const nf=u16(26),nc=u16(28),flags=u16(30);if(nf<1||nf>32||nc<1||nc>65||flags&~4)throw Error('CAB spanning or entry count unsupported.');
        let cursor=36,resFolder=0,resData=0;
        if(flags&4){const reserve=u16(cursor);resFolder=bytes[cursor+2];resData=bytes[cursor+3];cursor+=4+reserve;check(cursor,0);}
        const folders=[];
        for(let i=0;i<nf;i++){check(cursor,8+resFolder);const method=u16(cursor+6);if(![0,1].includes(method))throw Error('Unsupported CAB compression '+method+' (LZX/Quantum). Supply an extracted .theme and its assets or a stored/MSZIP CAB.');folders.push({offset:u32(cursor),blocks:u16(cursor+4),method});cursor+=8+resFolder;}
        const table=u32(16);if(table<cursor)throw Error('CAB file table overlaps folders.');cursor=table;const files=[],seen=new Set();let fileBytes=0;
        for(let i=0;i<nc;i++){check(cursor,16);const length=u32(cursor),offset=u32(cursor+4),folder=u16(cursor+8),attrs=u16(cursor+14);cursor+=16;const start=cursor;while(cursor<bytes.length&&bytes[cursor]&&cursor-start<=240)cursor++;check(cursor,1);if(cursor-start>240)throw Error('CAB name too long.');
            const name=path(new TextDecoder(attrs&128?'utf-8':'windows-1252',{fatal:true}).decode(bytes.subarray(start,cursor++)));
            if(seen.has(name.toLowerCase())||folder>=nf)throw Error('Duplicate path or spanning file.');seen.add(name.toLowerCase());fileBytes+=length;if(fileBytes>LIMIT)throw Error('CAB expansion exceeds 32 MiB.');files.push({name,length,offset,folder});}
        noParents(seen);
        const payloadStart=cursor,intervals=[],results=[];let expanded=0;
        for(let fi=0;fi<nf;fi++){const f=folders[fi];if(f.blocks>2048||f.offset<payloadStart)throw Error('Invalid CAB folder location or block count.');let at=f.offset;const chunks=[];let total=0,history=new Uint8Array();
            for(let i=0;i<f.blocks;i++){check(at,8+resData);const crc=u32(at),packed=u16(at+4),length=u16(at+6),start=at+8+resData;check(start,packed);if(!length||length>32768||!packed||packed>38912)throw Error('Invalid CAB block sizes.');
                const payload=bytes.subarray(start,start+packed);if(crc&&checksum(payload,checksum(bytes.subarray(at+4,at+8+resData)))!==crc)throw Error('CAB checksum mismatch.');
                let out;if(f.method===0){if(packed!==length)throw Error('Stored CAB length mismatch.');out=payload.slice();}else{if(payload[0]!==67||payload[1]!==75)throw Error('Missing MSZIP CK header.');out=inflate(payload.subarray(2),length,history);}
                total+=length;expanded+=length;if(expanded>LIMIT)throw Error('CAB folder expansion exceeds 32 MiB.');chunks.push(out);const next=new Uint8Array(Math.min(32768,history.length+out.length));if(out.length>=32768)next.set(out.subarray(out.length-32768));else{const keep=next.length-out.length;next.set(history.subarray(history.length-keep));next.set(out,keep);}history=next;at=start+packed;}
            intervals.push([f.offset,at]);const folder=new Uint8Array(total);let p=0;for(const c of chunks){folder.set(c,p);p+=c.length;}
            const ranges=[];for(const file of files.filter(e=>e.folder===fi)){if(file.offset+file.length>total)throw Error('CAB file is outside its folder.');ranges.push([file.offset,file.offset+file.length]);results.push({name:file.name,bytes:folder.slice(file.offset,file.offset+file.length)});}ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)if(ranges[i][0]<ranges[i-1][1])throw Error('Overlapping CAB files.');}
        intervals.sort((a,b)=>a[0]-b[0]);for(let i=1;i<intervals.length;i++)if(intervals[i][0]<intervals[i-1][1])throw Error('Overlapping CAB folders.');return results;
    }
    function pack(entries){
        if(!Array.isArray(entries)||!entries.length||entries.length>65)throw Error('CAB supports 1–65 theme files.');
        const files=[],seen=new Set();let total=0,tableSize=0;
        for(const e of entries){const name=path(e.name);if(seen.has(name.toLowerCase()))throw Error('Duplicate CAB file.');seen.add(name.toLowerCase());const filename=encoder.encode(name.replace(/\//g,'\\'));const data=e.bytes instanceof Uint8Array?e.bytes:new Uint8Array(e.bytes);if(total+data.length>LIMIT-65536)throw Error('CAB export too large.');files.push({filename,data,offset:total});total+=data.length;tableSize+=17+filename.length;}
        noParents(seen);
        const blocks=Math.ceil(total/32768),dataStart=44+tableSize,out=new Uint8Array(dataStart+total+blocks*8),v=new DataView(out.buffer);
        v.setUint32(0,0x4643534d,true);v.setUint32(8,out.length,true);v.setUint32(16,44,true);out[24]=3;out[25]=1;v.setUint16(26,1,true);v.setUint16(28,files.length,true);v.setUint32(36,dataStart,true);v.setUint16(40,blocks,true);
        const payload=new Uint8Array(total);let at=44;
        for(const f of files){v.setUint32(at,f.data.length,true);v.setUint32(at+4,f.offset,true);v.setUint16(at+10,33,true);v.setUint16(at+14,0x80,true);out.set(f.filename,at+16);at+=17+f.filename.length;payload.set(f.data,f.offset);}
        at=dataStart;for(let offset=0;offset<total;offset+=32768){const data=payload.subarray(offset,offset+32768);v.setUint16(at+4,data.length,true);v.setUint16(at+6,data.length,true);out.set(data,at+8);v.setUint32(at,checksum(data,checksum(out.subarray(at+4,at+8))),true);at+=8+data.length;}
        return out;
    }
    return {pack,unpack,inflate,checksum};
});
