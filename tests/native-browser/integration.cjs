/* Real Electron runtime test. No header removal, TLS exceptions or mocked engine. MIT. */
'use strict';
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{execFileSync}=require('node:child_process');
const {registerScheme,createDesktop}=require('../../desktop/runtime.cjs');
const P=require('../../desktop/policy.cjs');
const out=path.resolve(process.env.NATIVE_ARTIFACTS||path.join(__dirname,'artifacts'));
app.setPath('userData',require('node:fs').mkdtempSync(path.join(os.tmpdir(),'aster-native-test-')));
registerScheme();app.enableSandbox();
const report={platform:process.platform,electron:process.versions.electron,chromium:process.versions.chrome,tests:[],live:null};
let runtime,server,unprivileged,origin;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label,timeout=15000){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const r=await fn();if(r)return r;}catch(e){last=e;}await delay(80);}throw Error('Timed out: '+label+(last?' ('+last.message+')':''));}
const evaluate=(wc,body)=>wc.executeJavaScript('(async()=>{'+body+'})()',true);
const host=body=>evaluate(runtime.window.webContents,body);
async function check(name,fn){console.log('START',name);await fn();report.tests.push({name,passed:true});console.log('PASS',name);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
async function nativePage(){return wait(async()=>{const id=await host('return b.getWebview()?.native?.id');return runtime.views.get(id);},'native surface');}
async function loaded(r,url){await wait(()=>!r.view.webContents.isLoading()&&r.view.webContents.getURL()===url,'native URL '+url);await wait(()=>r.visible,'native slot shown');}
async function click(wc,selector){const r=await evaluate(wc,`const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('Missing click target');const r=n.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};`);wc.focus();wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...r});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...r});await delay(100);}
async function chord(wc,key){const modifiers=[process.platform==='darwin'?'meta':'control'];wc.focus();wc.sendInputEvent({type:'keyDown',keyCode:key,modifiers});wc.sendInputEvent({type:'keyUp',keyCode:key,modifiers});await delay(160);}
async function start(){
    await fs.mkdir(out,{recursive:true});
    server=http.createServer((req,res)=>{
        const pathname=new URL(req.url,'http://localhost').pathname;
        if(pathname==='/redirect'){res.writeHead(302,{Location:'/next'});res.end();return;}
        const headers={'Content-Type':'text/html; charset=utf-8','Set-Cookie':'aster-test=native; SameSite=Lax'};
        if(pathname==='/csp')headers['Content-Security-Policy']="frame-ancestors 'none'";
        if(pathname==='/xfo')headers['X-Frame-Options']='DENY';
        res.writeHead(200,headers);
        res.end(`<!doctype html><html><head><meta charset=utf-8><title>Native fixture ${pathname}</title></head><body style="font:20px system-ui;padding:30px;background:#f3f8ff"><h1 id=proof>Actual Chromium page ${pathname}</h1><p>This response forbids framing on /csp and /xfo.</p><button id=count onclick="this.textContent=String(Number(this.textContent)+1)">0</button><p><textarea id=draft aria-label=Draft></textarea><input id=paste aria-label=Paste></p><a id=next href=/next>Next page</a> <a id=redirect href=/redirect>Redirect</a> <a id=popup href=/popup target=_blank>New tab</a><form action=/result><input name=q id=query><button id=submit>Submit</button></form><div style="height:1200px">Scroll target</div><p id=bottom>Bottom of genuine page</p></body></html>`);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
    runtime=await createDesktop();
    const shell=runtime.window.webContents,headers=new Map();
    runtime.guestSession.webRequest.onHeadersReceived((details,callback)=>{if(details.resourceType==='mainFrame')headers.set(details.url,details.responseHeaders);callback({});});
    await wait(()=>host('return Aster.booted&&!document.querySelector("#boot")'),'desktop boot',30000);
    await host('await Aster.ready;await Aster.orbit.initialize();await Aster.orbit.preferences({confirmLeave:false,restoreTabs:false});Aster.closePanels();for(const w of [...Aster.windows.values()])await w.close(true);');
    // Wait for the ordinary first-run toast to finish, rather than removing UI in production.
    await delay(1800);await host('for(const n of document.querySelectorAll(".toast button[aria-label]"))n.click();');
    await check('Local shell is sandboxed and bridge is main-frame-only',async()=>{
        assert.equal(await host('return Aster.nativeBrowser.available'),true);
        assert.equal(await host('return typeof process'), 'undefined');
        assert.equal(shell.getLastWebPreferences().sandbox,true);
        await host('const f=document.createElement("iframe");f.id="local-frame";f.src="about:blank";document.body.append(f);');
        assert.equal(await host('return typeof document.getElementById("local-frame").contentWindow.AsterNativeBrowser'),'undefined');
        await host('document.getElementById("local-frame").remove();');
    });
    await host(`window.b=Aster.launch('browser',{url:${JSON.stringify(origin+'/csp')},mode:'auto'});await b.ready;`);
    let r=await nativePage(),wc=r.view.webContents;
    await loaded(r,origin+'/csp');
    await check('CSP-protected page is a real top-level view inside Orbit, not an iframe or popup',async()=>{
        assert.equal(await evaluate(wc,'return window===window.top&&window===window.parent'),true);
        assert.equal(await evaluate(wc,'return document.getElementById("proof").textContent'),'Actual Chromium page /csp');
        assert.equal(await host('return !!b.getWebview().frame'),false);
        assert.equal(await host('return b.getWebview().snapshot.engine'),'native');
        assert.equal(BrowserWindow.getAllWindows().length,1);
        assert.match(JSON.stringify(headers.get(origin+'/csp')),/frame-ancestors/);
        await fs.writeFile(path.join(out,'csp-native.png'),(await wc.capturePage()).toPNG());
    });
    await check('Guest has no Node, desktop bridge or local-shell resource authority',async()=>{
        assert.equal(await evaluate(wc,'return typeof require+":"+typeof process+":"+typeof AsterNativeBrowser'),'undefined:undefined:undefined');
        for(const [key,value]of Object.entries(P.GUEST))assert.equal(wc.getLastWebPreferences()[key],value,key);
        assert.equal(await evaluate(wc,'return fetch("aster-app://desktop/src/core.js").then(()=>false,()=>true)'),true);
        await assert.rejects(runtime.handle({sender:wc,senderFrame:wc.mainFrame},{method:'create',data:{id:'forged'}}));
        assert.match(await host(`try{await AsterNativeBrowser.navigate(${JSON.stringify(r.id)},'file:///etc/passwd');return 'allowed'}catch(e){return e.message}`),/HTTP|allowed/);
    });
    await check('Unchanged CSP and XFO block iframe controls but load natively',async()=>{
        for(const endpoint of ['/csp','/xfo']){
            const url=origin+endpoint;
            const refusal=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('No iframe refusal')),10000);const listener=(_e,code,description,failedURL,isMain)=>{if(failedURL===url&&!isMain){shell.off('did-fail-load',listener);clearTimeout(timer);resolve({code,description});}};shell.on('did-fail-load',listener);});
            await host(`const f=document.createElement('iframe');f.id='denied-control';f.src=${JSON.stringify(url)};document.body.append(f);`);
            const failure=await refusal;assert.ok(failure.code<0);await host('document.getElementById("denied-control").remove();');
            await host(`await b.navigate(${JSON.stringify(url)});`);await loaded(r,url);
            assert.equal(await evaluate(wc,'return document.getElementById("proof").textContent'),'Actual Chromium page '+endpoint);
            assert.match(JSON.stringify(headers.get(url)),endpoint==='/csp'?/frame-ancestors/:/DENY/);
        }
    });
    await check('Native pointer input and real clipboard shortcuts preserve Unicode text',async()=>{
        await click(wc,'#count');assert.equal(await evaluate(wc,'return document.getElementById("count").textContent'),'1');
        await click(wc,'#draft');await wc.insertText('Native clipboard Ω — żółć');await chord(wc,'A');await chord(wc,'C');
        await click(wc,'#paste');await chord(wc,'V');
        assert.equal(await evaluate(wc,'return document.getElementById("paste").value'),'Native clipboard Ω — żółć');
        await chord(wc,'L');assert.equal(await host('return document.activeElement.getAttribute("aria-label")'),'Address or search');
    });
    await check('Links, redirects and browser history update the actual Orbit address',async()=>{
        const identity=wc.id;await click(wc,'#redirect');await loaded(r,origin+'/next');
        await wait(()=>host(`return b.getWebview().snapshot.reportedURL===${JSON.stringify(origin+'/next')}`),'reported redirect');
        await click(shell,'button[aria-label="Back"]');await loaded(r,origin+'/xfo');
        await click(shell,'button[aria-label="Forward"]');await loaded(r,origin+'/next');assert.equal(wc.id,identity);
        await click(wc,'#query');await wc.insertText('real form');await click(wc,'#submit');
        await wait(()=>wc.getURL().includes('/result?q=real+form'),'native form submission');
    });
    await check('Switching tabs retains actual native documents and page drafts',async()=>{
        await click(wc,'#draft');await wc.insertText('Retained native draft');
        const first=await host('return b.getTabs()[0].id');
        await click(wc,'#popup');await wait(()=>host('return b.getTabs().length===2'),'native new tab');
        const other=await nativePage();await loaded(other,origin+'/popup');assert.equal(r.visible,false);
        await click(shell,`[aria-controls="${first}"]`);await wait(()=>r.visible,'first tab shown');
        assert.equal(await evaluate(wc,'return document.getElementById("draft").value'),'Retained native draft');
        assert.equal(other.visible,false);
    });
    await check('Shell menus, visual lock, background windows and minimization hide native surfaces',async()=>{
        await click(shell,'button[aria-label="Browser menu"]');await wait(()=>!r.visible,'menu above guest');
        shell.sendInputEvent({type:'keyDown',keyCode:'Escape'});shell.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(()=>r.visible,'resume after menu');
        await host('b.minimize();');await wait(()=>!r.visible,'minimized guest hidden');await host('b.restore();');await wait(()=>r.visible,'restored guest');
        await host('window.n=Aster.launch("notepad");await n.ready;');await wait(()=>!r.visible,'background guest hidden');await host('await n.close(true);b.focus(false);');await wait(()=>r.visible,'owner focused');
        await host('Aster.lock();');await wait(()=>!r.visible,'locked guest hidden');await click(shell,'.lock-screen button');await wait(()=>r.visible,'unlocked guest shown');
    });
    await check('Zoom, find, mute and actual page reload use the native engine',async()=>{
        await host('b.getWebview().setZoom(1.4);');await wait(()=>Math.abs(wc.getZoomFactor()-1.4)<.01,'native zoom');
        await host('await b.getWebview().native.command("mute",true);');assert.equal(wc.isAudioMuted(),true);
        const found=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Find timed out')),10000);const listener=(_e,result)=>{if(result.finalUpdate){clearTimeout(timer);wc.off('found-in-page',listener);resolve(result);}};wc.on('found-in-page',listener);});
        await host('await b.getWebview().native.command("find","Actual Chromium");');assert.ok((await found).matches>0);
        await host('await b.getWebview().native.command("stopFind");b.getWebview().setZoom(1);');
        await click(shell,'button[aria-label="Reload"]');await wait(()=>!wc.isLoading(),'reload finished');
        assert.equal(await evaluate(wc,'return document.getElementById("draft").value'),'');
    });
    await check('Browser-hosted edition shows an actionable engine requirement for the reported Google page',async()=>{
        unprivileged=new BrowserWindow({show:false,webPreferences:{...P.GUEST}});await unprivileged.loadURL(P.SHELL_URL);
        await wait(()=>evaluate(unprivileged.webContents,'return Aster.booted'),'web edition boot');
        await evaluate(unprivileged.webContents,'await Aster.ready;window.b=Aster.launch("browser",{url:"https://www.google.pl/",mode:"webview"});await b.ready;');
        assert.equal(await evaluate(unprivileged.webContents,'return Aster.nativeBrowser.available'),false);
        assert.equal(await evaluate(unprivileged.webContents,'return b.getWebview().snapshot.route'),'native-required');
        assert.equal(await evaluate(unprivileged.webContents,'return b.body.querySelectorAll("iframe").length'),0);
        assert.match(await evaluate(unprivileged.webContents,'return b.body.textContent'),/Get Aster Desktop/);
        unprivileged.destroy();unprivileged=null;runtime.window.focus();await host('b.focus(false);');
    });
    if(process.env.ASTER_LIVE==='1')await check('Actual Google Poland homepage renders in an internal Chromium view',async()=>{
        await host('await b.navigate("https://www.google.pl/",false,{mode:"native"});');
        await wait(async()=>!wc.isLoading()&&/google\./.test(new URL(wc.getURL()).hostname)&&/Google/i.test(wc.getTitle()),'real Google homepage',45000);
        await wait(()=>r.visible,'Google in Aster foreground');
        const contents=await evaluate(wc,'return {top:window===top,title:document.title,url:location.href,body:document.body.innerText.slice(0,2000),form:!!document.querySelector("textarea[name=q],input[name=q]")}');
        assert.equal(contents.top,true);assert.ok(contents.body.length>30);assert.ok(contents.form||/consent|privacy|cookies/i.test(contents.body));
        assert.equal(BrowserWindow.getAllWindows().length,1);
        report.live=contents;await fs.writeFile(path.join(out,'google-native.png'),(await wc.capturePage()).toPNG());
        if(process.platform==='linux')execFileSync('import',['-window','root',path.join(out,'google-inside-aster.png')],{timeout:10000});
    });
    await check('Closing the Orbit owner disposes every associated native view',async()=>{
        await host('await b.close(true);');await wait(()=>runtime.views.size===0,'all native pages disposed');
    });
}
app.whenReady().then(start).then(async()=>{await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,passed:true},null,2));console.log('All native browser tests passed.');runtime?.window.destroy();server?.close();app.exit(0);}).catch(async error=>{
    console.error(error);await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,passed:false,error:error.stack},null,2));
    try{await fs.writeFile(path.join(out,'failure-shell.png'),(await runtime.window.webContents.capturePage()).toPNG());await fs.writeFile(path.join(out,'failure-dom.html'),await host('return document.documentElement.outerHTML'));}catch{}
    unprivileged?.destroy();runtime?.window.destroy();server?.close();app.exit(1);
});
setTimeout(()=>{console.error('Native integration process exceeded its deadline');app.exit(2);},180000).unref();
