/* Loaded ONLY in the local shell's isolated main frame; never in websites. MIT. */
'use strict';
const {contextBridge,ipcRenderer} = require('electron');
if (process.isMainFrame && location.href === 'aster-app://desktop/index.html') {
    const call = (method, data) => ipcRenderer.invoke('aster-native-browser', {method,data});
    contextBridge.exposeInMainWorld('AsterNativeBrowser', Object.freeze({
        version:1, engine:'Chromium',
        create: data => call('create',data),
        navigate: (id,url) => call('navigate',{id,url}),
        command: (id,action,value) => call('command',{id,action,value}),
        layout: data => ipcRenderer.send('aster-native-layout',data),
        destroy: id => call('destroy',{id}),
        clearSession: () => call('clearSession'),
        subscribe: callback => {
            if (typeof callback !== 'function') throw Error('A callback is required.');
            const listener = (_event,data) => callback(data);
            ipcRenderer.on('aster-native-event',listener);
            return () => ipcRenderer.removeListener('aster-native-event',listener);
        }
    }));
}
