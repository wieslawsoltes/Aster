/* Theme asset validation and RIFF animated-cursor parsing. No executable assets. MIT. */
'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AsterThemeAssets=api;})(globalThis,()=>{
    const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',ico:'image/x-icon',cur:'image/x-icon',ani:'application/x-navi-animation',wav:'audio/wav'};
    function icon(input){const b=new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(b.length<22||v.getUint16(0,true)!==0||![1,2].includes(v.getUint16(2,true)))throw Error('Invalid ICO/CUR asset.');const count=v.getUint16(4,true);if(!count||count>32||6+count*16>b.length)throw Error('Invalid ICO/CUR directory.');const entries=[];
        for(let i=0;i<count;i++){const at=6+i*16,width=b[at]||256,height=b[at+1]||256,len=v.getUint32(at+8,true),offset=v.getUint32(at+12,true);if(!len||offset<6+count*16||offset+len>b.length)throw Error('Truncated ICO/CUR image.');const cursor=v.getUint16(2,true)===2,x=cursor?v.getUint16(at+4,true):0,y=cursor?v.getUint16(at+6,true):0;if(cursor&&(x>=width||y>=height))throw Error('Invalid CUR hotspot.');entries.push({width,height,x,y,offset,len});}
        return entries.sort((a,b)=>Math.abs(a.width-32)-Math.abs(b.width-32))[0];}
    function ani(input){const b=new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength),tag=at=>String.fromCharCode(...b.subarray(at,at+4));if(b.length<12||tag(0)!=='RIFF'||tag(8)!=='ACON'||v.getUint32(4,true)+8!==b.length)throw Error('Invalid ANI RIFF.');let header=null,seq=null,rates=null;const frames=[];
        const chunks=(start,end,depth)=>{if(depth>1)throw Error('Nested ANI list unsupported.');for(let at=start;at<end;){if(at+8>end)throw Error('Truncated ANI chunk.');const len=v.getUint32(at+4,true),data=at+8,stop=data+len;if(stop>end)throw Error('ANI chunk exceeds container.');const id=tag(at);
            if(id==='anih'){if(len<36||header)throw Error('Invalid ANI header.');header=Array.from({length:9},(_,i)=>v.getUint32(data+i*4,true));}
            else if(id==='icon'){if(frames.length>=64)throw Error('ANI frame limit exceeded.');const bytes=b.slice(data,stop);frames.push({bytes,...icon(bytes)});}
            else if(id==='seq '||id==='rate'){if(len%4||len>512)throw Error('Invalid ANI sequence.');const values=Array.from({length:len/4},(_,i)=>v.getUint32(data+i*4,true));if(id==='seq ')seq=values;else rates=values;}
            else if(id==='LIST'&&len>=4&&tag(data)==='fram')chunks(data+4,stop,depth+1);
            at=stop+(len&1);if(at>end)throw Error('Missing ANI padding.');}};
        chunks(12,b.length,0);if(!header||header[0]!==36||!(header[8]&1)||header[1]!==frames.length||!frames.length||header[2]<1||header[2]>128)throw Error('Unsupported ANI header or frame count.');const order=seq||Array.from({length:header[2]},(_,i)=>i%frames.length);if(order.length!==header[2]||order.some(i=>i>=frames.length))throw Error('Invalid ANI frame sequence.');if(rates&&rates.length!==header[2])throw Error('Invalid ANI rates.');
        return order.map((frame,i)=>({...frames[frame],duration:Math.max(16,Math.min(10000,((rates?.[i]||header[7]||6)*1000/60)))}));}
    function validate(name,bytes){const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);if(!b.length||b.length>8*1024*1024)throw Error('Each theme asset must be 1 byte–8 MiB.');const ext=name.split('.').at(-1).toLowerCase(),mime=MIME[ext];if(!mime)throw Error('Unsupported theme asset: '+name);const v=new DataView(b.buffer,b.byteOffset,b.byteLength),u16=(p)=>p+2<=b.length?v.getUint16(p,true):0,u32=(p)=>p+4<=b.length?v.getUint32(p,true):0,str=(p,n)=>String.fromCharCode(...b.subarray(p,p+n));let width=0,height=0;
        if(['cur','ico'].includes(ext)){icon(b);return mime;}
        if(ext==='ani'){ani(b);return mime;}
        if(ext==='wav'){if(str(0,4)!=='RIFF'||str(8,4)!=='WAVE'||u32(4)+8>b.length)throw Error('Invalid WAV asset.');return mime;}
        if(ext==='png'){if(str(1,3)!=='PNG'||b[0]!==137||b.length<24)throw Error('Invalid PNG.');width=v.getUint32(16);height=v.getUint32(20);}
        if(ext==='gif'){if(!['GIF87a','GIF89a'].includes(str(0,6)))throw Error('Invalid GIF.');width=u16(6);height=u16(8);}
        if(ext==='bmp'){if(str(0,2)!=='BM'||b.length<26)throw Error('Invalid BMP.');if(u32(14)===12){width=u16(18);height=u16(20);}else{width=u32(18);height=Math.abs(v.getInt32(22,true));}}
        if(ext==='jpg'||ext==='jpeg'){if(b[0]!==255||b[1]!==216)throw Error('Invalid JPEG.');let at=2;while(at+4<=b.length){if(b[at++]!==255)throw Error('Invalid JPEG marker.');while(b[at]===255)at++;const m=b[at++];if(m===217||m===218)break;const len=v.getUint16(at);if(len<2||at+len>b.length)throw Error('Truncated JPEG.');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)){if(len<7)throw Error('Invalid JPEG dimensions.');height=v.getUint16(at+3);width=v.getUint16(at+5);break;}at+=len;}}
        if(ext==='webp'){if(str(0,4)!=='RIFF'||str(8,4)!=='WEBP'||b.length<30)throw Error('Invalid WebP.');if(str(12,4)==='VP8X'){width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16);}else if(str(12,4)==='VP8L'&&b[20]===47){const q=u32(21);width=(q&16383)+1;height=(q>>>14&16383)+1;}else if(str(12,4)==='VP8 '){if(str(23,3)!=='\x9d\x01\x2a')throw Error('Invalid VP8 frame.');width=u16(26)&16383;height=u16(28)&16383;}}
        if(width<1||height<1||width>8192||height>8192||width*height>16777216)throw Error('Image dimensions exceed 16 megapixels or are invalid.');return mime;
    }
    return {MIME,validate,icon,ani};
});
