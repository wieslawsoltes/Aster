'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const M=require('../../src/web-navigation.js'),catalog=require('../../src/web-app-catalog.js');
test('Browser inputs normalize HTTPS hosts and preserve full HTTP URLs',()=>{
 assert.equal(M.address('example.com/page?q=a#b'),'https://example.com/page?q=a#b');
 assert.equal(M.address('HTTPS://EXAMPLE.COM/a'),'https://example.com/a');
 assert.equal(M.address('http://127.0.0.1:8765/path'),'http://127.0.0.1:8765/path');
 assert.equal(M.address('localhost:8765/test'),'https://localhost:8765/test');
});
test('Search stays on a validated HTTPS provider URL rather than evaluating text',()=>{
 assert.equal(M.address('a test & query'),'https://duckduckgo.com/?q=a%20test%20%26%20query');
 assert.equal(M.address(''),'aster://home');
});
test('Active, file, opaque and malformed schemes cannot be launched or searched',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,hi','file:///etc/passwd','blob:https://evil.test/x','ftp://x','aster://bad','https://user:pass@example.com','https://','https://test\n.invalid','x'.repeat(4097)]) assert.throws(()=>M.address(value),value);
});
test('Untrusted route cannot promote a search term to an explicit launch',()=>{
 assert.throws(()=>M.address('search text',false));
 assert.throws(()=>M.address(null));
});
test('Local file paths retain reserved characters and reject traversal',()=>{
 for(const input of ['aster://file/Documents/a%20b.html','aster://file/Documents/a%23b%3F.html']) assert.equal(M.address(input),input);
 for(const input of ['aster://file/%2e%2e/foo','aster://file/../foo','aster://file/a%5Cb','aster://file/%00bad']) assert.throws(()=>M.address(input));
});
test('All 74 exact catalog sites retain same-origin execution needed by Workers and storage',()=>{
 for(const app of catalog.apps){assert.equal(M.catalogApp(app.url,catalog.apps).id,app.id);assert.match(M.framePolicy(app.url,catalog.apps).sandbox,/allow-same-origin/);}
});
test('Unreviewed websites, altered paths and the desktop remain opaque-origin',()=>{
 for(const url of ['https://example.com/','https://wieslawsoltes.github.io/Aster/','https://wieslawsoltes.github.io/Forma/other','https://wieslawsoltes.github.io/Forma/?inject=1']) assert.doesNotMatch(M.framePolicy(url,catalog.apps).sandbox,/allow-same-origin/);
});
test('Sensitive media delegation remains narrowly scoped',()=>{
 const yes=M.framePolicy('https://wieslawsoltes.github.io/VeyraWorkspace/',catalog.apps);
 const no=M.framePolicy('https://wieslawsoltes.github.io/AsterionEDA/',catalog.apps);
 assert.match(yes.allow,/microphone/);assert.doesNotMatch(no.allow,/microphone|camera|geolocation/);
 assert.doesNotMatch(M.framePolicy('https://example.com/',catalog.apps).allow,/clipboard|autoplay|camera/);
});
test('New scripts and styles are packaged for normal and offline startup',()=>{
 const index=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),html=fs.readFileSync('Aster.html','utf8');
 for(const f of ['web-navigation.js','web-app-settings.js','web-app-chrome.css']){assert(index.includes('src/'+f));assert(sw.includes('src/'+f));}
 assert(html.includes('OS.applyWebAppChrome'));assert(html.includes('Show web app title bars'));assert(html.includes('Open in Aster Browser'));
 assert(fs.readFileSync('src/core.js','utf8').includes('webAppTitleBars: false, webAppToolbars: false'));
});
