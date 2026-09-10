/* Optional Aster text clipboard client. Each request needs a separate host confirmation. MIT. */
'use strict';
(() => {
    if(globalThis.AsterClipboard)return;
    let port=null,serial=0,disposed=false;const requests=new Map();
    const clear=message=>{port?.close();port=null;for(const r of requests.values()){clearTimeout(r.timer);r.reject(Error(message));}requests.clear();};
    addEventListener('message',e=>{
        if(disposed||e.source!==parent||e.data?.type!=='aster.clipboard.host'||!e.ports?.[0])return;
        clear('Clipboard channel replaced.');port=e.ports[0];
        port.onmessage=event=>{if(event.data?.type==='aster.clipboard.closed'){clear('Clipboard access was closed. Use native paste or re-enable helpers in Settings.');return;}const r=requests.get(event.data?.id);if(!r)return;clearTimeout(r.timer);requests.delete(event.data.id);event.data.error?r.reject(Error(event.data.error)):r.resolve(event.data.value);};port.start();
    });
    function request(method,text){if(disposed||top===globalThis||!port)return Promise.reject(Error('Aster clipboard host is unavailable. Use native keyboard paste.'));
        if(requests.size)return Promise.reject(Error('Finish the previous clipboard request first.'));
        const id='clipboard-'+(++serial);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Clipboard approval timed out.'));},90000);requests.set(id,{resolve,reject,timer});port.postMessage({id,method,text});});}
    globalThis.AsterClipboard=Object.freeze({version:1,get connected(){return !!port&&!disposed;},readText:()=>request('readText'),writeText:text=>typeof text==='string'&&text.length<=1048576?request('writeText',text):Promise.reject(Error('Text is limited to 1 Mi characters.'))});
    addEventListener('pagehide',()=>{disposed=true;clear('App page closed.');},{once:true});
})();
