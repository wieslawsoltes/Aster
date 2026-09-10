/* Pure validators used by the native main process. No renderer-provided code. MIT. */
'use strict';
const path = require('node:path');
const SHELL_URL = 'aster-app://desktop/index.html';
function webURL(value) {
    if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x20\x7f]/.test(value)) throw Error('Enter a valid HTTP(S) URL.');
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname || u.username || u.password) throw Error('Only HTTP(S) websites without embedded credentials are allowed.');
    return u.href;
}
function shellURL(value) { return value === SHELL_URL; }
function resourcePath(url, root) {
    const u = new URL(url);
    if (u.protocol !== 'aster-app:' || u.hostname !== 'desktop' || u.port || u.username || u.password) throw Error('Invalid application resource.');
    const relative = decodeURIComponent(u.pathname).replace(/^\//, '');
    if (!relative || /[\\\x00]/.test(relative) || relative.split('/').some(s => !s || s === '.' || s === '..' || s.startsWith('.'))) throw Error('Invalid application path.');
    if (!['index.html','Aster.html','sw.js','manifest.webmanifest','LICENSE'].includes(relative) && !/^(src|assets|sdk|third-party)\//.test(relative)) throw Error('Resource is not part of the public runtime.');
    const result = path.resolve(root, relative);
    if (!result.startsWith(path.resolve(root) + path.sep)) throw Error('Invalid application path.');
    return result;
}
function bounds(raw, width, height) {
    if (!raw || !['x','y','width','height'].every(k => Number.isFinite(raw[k]))) throw Error('Invalid native view bounds.');
    const r = Object.fromEntries(['x','y','width','height'].map(k => [k, Math.round(raw[k])]));
    if (r.x < 0 || r.y < 0 || r.width < 1 || r.height < 1 || r.x+r.width>width || r.y+r.height>height) throw Error('Native views must stay inside the Aster content area.');
    return r;
}
function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(value)) throw Error('Invalid view identity.'); return value; }
const GUEST = Object.freeze({nodeIntegration:false,nodeIntegrationInSubFrames:false,nodeIntegrationInWorker:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,spellcheck:true});
module.exports = {SHELL_URL,webURL,shellURL,resourcePath,bounds,id,GUEST};
