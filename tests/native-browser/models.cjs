'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const P=require('../../desktop/policy.cjs'),M=require('../../src/orbit-models.js');
test('native engine routes ordinary addresses and explicit webviews internally only when installed',()=>{
    for(const mode of ['auto','webview','native'])assert.equal(M.route('https://www.google.pl/',mode,[],[],'aster-app:',true).mode,'native');
    assert.equal(M.route('https://www.google.pl/','webview').mode,'native-required');
    assert.equal(M.route('https://example.com/','native').mode,'native-required');
    assert.equal(M.route('https://example.com/','auto').mode,'browser');
    assert.equal(M.route('https://example.com/','browser',[],[],'aster-app:',true).mode,'browser');
    assert.equal(M.route('aster://file/Documents/a.html','native',[],[],'aster-app:',true).mode,'internal');
});
test('native overrides are data-only, bounded and restored without loading',()=>{
    const d=M.normalize({routes:[{origin:'https://example.com',mode:'native'}]});assert.equal(d.routes[0].mode,'native');
    assert.equal(M.session([{url:'https://example.com',mode:'native'}],0,true).tabs[0].mode,'native');
    assert.equal(M.route('https://example.com','auto',d.routes).mode,'native-required');
});
test('known-denial guidance avoids Maps embeds, lookalikes and arbitrary websites',()=>{
    for(const u of ['https://www.google.pl/','https://google.com/search?q=a','https://accounts.google.com/login'])assert.equal(M.knownFrameRestriction(u),true);
    for(const u of ['https://google.com/maps/embed','https://google.com.evil.test/','https://google.com.example/','https://example.com'])assert.equal(M.knownFrameRestriction(u),false);
});
test('native navigation rejects active, local, credentialed and malformed URLs',()=>{
    for(const u of ['file:///etc/passwd','javascript:alert(1)','data:text/html,x','aster-app://desktop/index.html','https://user:pass@example.com','https://example.com/\nx','https://example.com/a b',null,'x'])assert.throws(()=>P.webURL(u));
    assert.equal(P.webURL('https://www.google.pl/'),'https://www.google.pl/');
});
test('application resource allowlist cannot expose Electron, source-control or sibling files',()=>{
    assert.equal(P.resourcePath('aster-app://desktop/src/core.js','/app'),path.resolve('/app/src/core.js'));
    for(const u of ['aster-app://evil/index.html','aster-app://desktop/desktop/preload.cjs','aster-app://desktop/.git/config','aster-app://desktop/src/%2e%2e%2fdesktop/main.cjs','aster-app://desktop/src/a%5cb','aster-app://desktop/tests/a.js'])assert.throws(()=>P.resourcePath(u,'/app'));
});
test('native bridge accepts only exact local shell URL and bounded rectangles',()=>{
    assert.equal(P.shellURL(P.SHELL_URL),true);for(const u of [P.SHELL_URL+'?x','https://example.com',P.SHELL_URL+'/evil'])assert.equal(P.shellURL(u),false);
    assert.deepEqual(P.bounds({x:5,y:10,width:300,height:200},1000,800),{x:5,y:10,width:300,height:200});
    for(const r of [{x:-1,y:0,width:1,height:1},{x:0,y:0,width:Infinity,height:1},{x:999,y:0,width:10,height:1}])assert.throws(()=>P.bounds(r,1000,800));
});
test('native guests are sandboxed and have no Node or webview privileges',()=>{
    assert.equal(P.GUEST.sandbox,true);assert.equal(P.GUEST.contextIsolation,true);assert.equal(P.GUEST.webSecurity,true);
    for(const key of ['nodeIntegration','nodeIntegrationInSubFrames','nodeIntegrationInWorker','webviewTag','allowRunningInsecureContent'])assert.equal(P.GUEST[key],false);
    assert.equal(P.GUEST.preload,undefined);
});
