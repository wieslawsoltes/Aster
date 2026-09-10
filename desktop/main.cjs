'use strict';
const {app} = require('electron');
const {createDesktop,registerScheme} = require('./runtime.cjs');
app.setName('Aster Desktop');
registerScheme();
app.enableSandbox();
if (!app.requestSingleInstanceLock()) app.quit();
else {
    let runtime;
    app.whenReady().then(async()=>{ runtime = await createDesktop(); }).catch(error=>{console.error(error);app.quit();});
    app.on('second-instance',()=>{if(runtime&&!runtime.window.isDestroyed()){runtime.window.restore();runtime.window.focus();}});
    app.on('window-all-closed',()=>app.quit());
}
