/* Aster's bounded guest memory and PE32 loader. No host-native DLLs are loaded. MIT. */
'use strict';
(() => {
const RAM = 64 * 1024 * 1024, HOOK = 0xf0000000, RETURN = 0xfffffff0;
const hex = n => '0x' + (n >>> 0).toString(16).padStart(8, '0');
class Memory {
    constructor(cpu) {
        this.cpu = cpu; this.bytes = new Uint8Array(cpu.memory.buffer, cpu.guest_base(), RAM);
        this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, RAM);
        this.regions = []; this.next = 0x1000000; this.allocations = new Map(); this.freeList = [];
        this.decoder = new TextDecoder('windows-1252');
        this.encoder = new Map(); for (let i = 0; i < 256; i++) this.encoder.set(this.decoder.decode(new Uint8Array([i])), i);
    }
    check(p, n = 1) { if (!Number.isInteger(p) || !Number.isInteger(n) || p < 4096 || n < 0 || p > RAM || n > RAM - p) throw Error(`Guest memory outside 64 MiB: ${hex(p)} + ${n}`); return p; }
    u8(p) { return this.view.getUint8(this.check(p)); }
    u16(p) { return this.view.getUint16(this.check(p, 2), true); }
    u32(p) { return this.view.getUint32(this.check(p, 4), true); }
    i32(p) { return this.u32(p) | 0; }
    w8(p, v) { this.view.setUint8(this.check(p), v); this.cpu.touch(p, 1); }
    w16(p, v) { this.view.setUint16(this.check(p, 2), v, true); this.cpu.touch(p, 2); }
    w32(p, v) { this.view.setUint32(this.check(p, 4), v >>> 0, true); this.cpu.touch(p, 4); }
    copy(p, bytes) { this.check(p, bytes.length); this.bytes.set(bytes, p); this.cpu.touch(p, bytes.length); }
    zero(p, n) { this.check(p, n); this.bytes.fill(0, p, p + n); this.cpu.touch(p, n); }
    string(p, wide = false, count = null) {
        if (!p && count === null) return ''; const width = wide ? 2 : 1, max = count === null ? 32768 : count;
        if (!Number.isInteger(max) || max < 0 || max > 1048576) throw Error('Guest string exceeds limit');
        let end = p, length = 0;
        if (count !== null) { this.check(p, max * width); end = p + max * width; }
        else { for (; length < max; length++, end += width) if (!(wide ? this.u16(end) : this.u8(end))) break; if (length === max) throw Error('Unterminated guest string'); }
        this.check(p, end - p);
        if (!wide) return this.decoder.decode(this.bytes.subarray(p, end));
        let result = ''; for (let at = p; at < end; at += 2) result += String.fromCharCode(this.u16(at)); return result;
    }
    putString(p, text, wide = false, capacity = text.length + 1) {
        if (!capacity) return 0; const n = Math.min(text.length, capacity - 1), width = wide ? 2 : 1;
        this.check(p, (n + 1) * width);
        for (let i = 0; i < n; i++) wide ? this.w16(p + i * 2, text.charCodeAt(i)) : this.w8(p + i, this.encoder.get(text[i]) ?? 63);
        wide ? this.w16(p + n * 2, 0) : this.w8(p + n, 0); return n;
    }
    alloc(n, zero = true) {
        if (!Number.isInteger(n) || n < 0 || n > 16 * 1024 * 1024 + 65536 || this.allocations.size > 65536) throw Error('Guest allocation quota exceeded');
        n = Math.max(16, Math.ceil(n / 16) * 16); let p, index = this.freeList.findIndex(x => x.size >= n);
        if (index >= 0) { const item = this.freeList.splice(index, 1)[0]; p = item.p; if (item.size > n) this.freeList.push({ p: p + n, size: item.size - n }); }
        else { p = this.next; if (p + n > 0x3c00000) throw Error('Guest heap exhausted'); this.next += n; }
        this.allocations.set(p, n); if (zero) this.zero(p, n); return p;
    }
    free(p) { if (!p) return true; const size = this.allocations.get(p); if (!size) return false; this.allocations.delete(p); this.freeList.push({p, size}); return true; }
    str(text, wide = false) { const p = this.alloc((text.length + 1) * (wide ? 2 : 1)); this.putString(p, text, wide); return p; }
}
function loadPE(data, mem, resolve, options = {}) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length < 128 || bytes.length > 16 * 1024 * 1024) throw Error('Select a PE32 executable between 128 bytes and 16 MiB');
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const range = (p, n) => { if (!Number.isInteger(p) || p < 0 || n < 0 || p > bytes.length || n > bytes.length - p) throw Error('Truncated or malformed PE file'); };
    const u16 = p => { range(p, 2); return v.getUint16(p, true); }, u32 = p => { range(p, 4); return v.getUint32(p, true); };
    if (u16(0) !== 0x5a4d) throw Error('Not an MZ/PE Windows executable');
    const pe = u32(0x3c); range(pe, 24); if (u32(pe) !== 0x4550) throw Error('Not a PE Windows executable (DOS and Win16 unsupported)');
    const machine = u16(pe + 4), sections = u16(pe + 6), optSize = u16(pe + 20), opt = pe + 24;
    if (machine !== 0x14c) throw Error(`Unsupported CPU ${hex(machine)}: accepts 32-bit x86, not x64 or ARM`);
    const isDLL = !!(u16(pe + 22) & 0x2000);
    if (u16(pe + 22) & 0x1000 || isDLL !== !!options.dll) throw Error('Load a user-mode EXE, not a DLL or system image');
    if (!(u16(pe + 22) & 2)) throw Error('PE image is not marked executable');
    if (!sections || sections > 96 || optSize < 96) throw Error('Invalid PE section/optional header');
    range(opt, optSize + sections * 40); if (u16(opt) !== 0x10b) throw Error('Only PE32 optional headers are supported');
    const preferred = u32(opt + 28), imageSize = u32(opt + 56), headerSize = u32(opt + 60), entryRva = u32(opt + 16), subsystem = u16(opt + 68);
    if (![2, 3].includes(subsystem)) throw Error('Only Windows GUI and console applications are supported');
    if (!imageSize || imageSize > (options.maxImageSize ?? 24 * 1024 * 1024) || headerSize > imageSize || headerSize < opt + optSize + sections * 40) throw Error('Invalid PE image/header size');
    const base = options.base ?? (preferred >= 0x20000 && preferred % 65536 === 0 && preferred + imageSize <= 0x3000000 ? preferred : 0x400000);
    if (base < 0x20000 || base % 65536 || base + imageSize > 0x3000000) throw Error('Unsupported PE load address');
    range(0, headerSize);
    const mapped = [{start:0,end:headerSize}], sectionInfo = [];
    const imageRange = (rva, n = 1, mappedOnly = false) => { if (!Number.isInteger(rva) || rva < 0 || n < 0 || rva > imageSize || n > imageSize - rva || (mappedOnly && !mapped.some(s => rva >= s.start && rva + n <= s.end))) throw Error('PE directory points outside mapped image'); return base + rva; };
    const directoryCount = u32(opt + 92); if (directoryCount > 16 || 96 + directoryCount * 8 > optSize) throw Error('Invalid PE directory count');
    const dir = n => n < directoryCount ? [u32(opt + 96 + n * 8), u32(opt + 100 + n * 8)] : [0, 0];
    if (dir(14)[0]) throw Error('.NET/CLR executables are unsupported');
    if (dir(9)[0] && !options.tls) throw Error('Static TLS and TLS callbacks require the compatibility runtime');
    if (dir(13)[0]) throw Error('Delay-loaded imports are not implemented');
    if (mem.regions.some(r => base < r.base + r.imageSize && base + imageSize > r.base)) throw Error('PE image overlaps another loaded image');
    mem.regions.push({base, imageSize, sections:sectionInfo});
    mem.copy(base, bytes.subarray(0, headerSize));
    for (let i = 0; i < sections; i++) {
        const s = opt + optSize + i * 40, virtualSize = u32(s + 8), rva = u32(s + 12), rawSize = u32(s + 16), raw = u32(s + 20), flags = u32(s + 36), size = Math.max(virtualSize, rawSize);
        imageRange(rva, size); if (size && mapped.some(x => rva < x.end && rva + size > x.start)) throw Error('Overlapping PE sections/headers');
        mapped.push({ start: rva, end: rva + size });
        if (rawSize) { range(raw, rawSize); mem.copy(base + rva, bytes.subarray(raw, raw + rawSize)); }
        if (size > rawSize) mem.zero(base + rva + rawSize, size - rawSize);
        if (flags & 0x20000000) mem.cpu.mark_executable(base + rva, size);
        sectionInfo.push({ rva, size, executable: !!(flags & 0x20000000), writable: !!(flags & 0x80000000) });
    }
    if (!(isDLL && entryRva === 0) && !sectionInfo.some(s => s.executable && entryRva >= s.rva && entryRva < s.rva + s.size)) throw Error('Entry point is not in executable code');
    const delta = (base - preferred) >>> 0;
    if (delta) {
        const [rva, size] = dir(5); if (!rva || !size || (u16(pe+22)&1)) throw Error('Image requires relocation, but relocations are absent'); imageRange(rva, size, true);
        for (let offset = 0; offset < size;) {
            if (size - offset < 8) throw Error('Truncated relocation block');
            const p = base + rva + offset, page = mem.u32(p), length = mem.u32(p + 4);
            if (length < 8 || length % 2 || length > size - offset) throw Error('Invalid relocation block');
            for (let j = 8; j < length; j += 2) { const value = mem.u16(p + j), type = value >>> 12; if (!type) continue; if (type !== 3) throw Error('Only HIGHLOW PE32 relocations supported'); const at = imageRange(page + (value & 4095), 4, true); mem.w32(at, mem.u32(at) + delta); }
            offset += length;
        }
    }
    mem.next = Math.max(mem.next, 0x1000000, Math.ceil((base + imageSize) / 65536) * 65536);
    const imports = [], missing = [], [importRva, importSize] = dir(1);
    const imageString = rva => { imageRange(rva,1,true); const s = mem.string(base + rva); imageRange(rva,s.length+1,true); return s; };
    if (importRva) {
        if (importSize < 20) throw Error('Invalid import directory'); imageRange(importRva, importSize, true); let ended = false;
        for (let offset = 0; offset + 20 <= importSize; offset += 20) {
            const p = base + importRva + offset, lookup = mem.u32(p), nameRva = mem.u32(p + 12), iat = mem.u32(p + 16);
            if (!lookup && !nameRva && !iat) { ended = true; break; }
            if (!nameRva || !iat) throw Error('Invalid import descriptor');
            const dll = imageString(nameRva).toLowerCase(); let terminated = false;
            for (let j = 0; j < 2048; j++) {
                const ref = mem.u32(imageRange((lookup || iat) + j * 4,4,true)); if (!ref) { terminated = true; break; }
                const name = ref & 0x80000000 ? '#' + (ref & 65535) : imageString(ref + 2), address = resolve(dll, name);
                imports.push({dll,name,supported:!!address}); if (!address) missing.push(dll+'!'+name);
                mem.w32(imageRange(iat+j*4,4,true),address||0); if (imports.length>2048) throw Error('Too many imported functions');
            }
            if (!terminated) throw Error('Unterminated import lookup table');
        }
        if (!ended) throw Error('Unterminated import directory');
    }
    const exports = Object.create(null), [exportRva, exportSize] = dir(0);
    if (exportRva) {
        const p = imageRange(exportRva, 40, true), ordinalBase = mem.u32(p+16), count = mem.u32(p+20), names = mem.u32(p+24);
        if (count>16384 || names>count) throw Error('PE export quota exceeded');
        const functions=imageRange(mem.u32(p+28),count*4,true), nameTable=names?imageRange(mem.u32(p+32),names*4,true):0, ordinals=names?imageRange(mem.u32(p+36),names*2,true):0;
        for(let i=0;i<count;i++) {const rva=mem.u32(functions+i*4);if(!rva)continue;if(rva>=exportRva && rva<exportRva+exportSize)throw Error('Forwarded PE DLL exports are unsupported');exports['#'+(ordinalBase+i)]=imageRange(rva,1,true);}
        for(let i=0;i<names;i++) {const index=mem.u16(ordinals+i*2);if(index>=count)throw Error('Export ordinal outside table');const name=imageString(mem.u32(nameTable+i*4));exports[name]=exports['#'+(ordinalBase+index)]||0;}
    }
    let tls=null; const [tlsRva,tlsSize]=dir(9);
    if(tlsRva) {
        if(tlsSize<24)throw Error('Invalid TLS directory');const p=imageRange(tlsRva,24,true),start=mem.u32(p),end=mem.u32(p+4),index=mem.u32(p+8),array=mem.u32(p+12),zero=mem.u32(p+16),characteristics=mem.u32(p+20);
        if(end<start || end-start+zero>1048576 || !index || characteristics&~0xf00000)throw Error('Invalid TLS template or flags');
        if(end>start)imageRange(start-base,end-start,true);imageRange(index-base,4,true);
        const callbacks=[];if(array){let terminated=false;for(let i=0;i<64;i++){const address=mem.u32(imageRange(array-base+i*4,4,true));if(!address){terminated=true;break;}if(!sectionInfo.some(s=>s.executable&&address>=base+s.rva&&address<base+s.rva+s.size))throw Error('TLS callback outside executable section');callbacks.push(address);}if(!terminated)throw Error('TLS callback quota exceeded');}
        const alignmentCode=(characteristics>>>20)&15;if(alignmentCode===15)throw Error('Invalid TLS alignment');tls={start,size:end-start,zero,index,callbacks,alignment:alignmentCode?2**(alignmentCode-1):16};
    }
    return {machine:'i386',format:'PE32',base,preferred,imageSize,entry:entryRva?base+entryRva:0,subsystem,imports,missing,relocated:!!delta,isDLL,exports,tls,sections:sectionInfo};
}
globalThis.AsterWin32 = {Memory,loadPE,RAM,HOOK,RETURN,hex};
if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.AsterWin32;
})();
