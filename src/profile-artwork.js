/* Original vector app artwork; no platform logos, proprietary icons or fonts. MIT. */
'use strict';
(() => {
    const OS=Aster;
    const glyph={
        files:`<g class="art-windows"><path fill="#cf8c13" d="M5 17a4 4 0 0 1 4-4h18l6 6h23a4 4 0 0 1 4 4v29H5z"/><path fill="#ffe18c" d="M8 23h47v27H8z"/><path fill="#ffd052" d="M4 28a3 3 0 0 1 3-3h51a3 3 0 0 1 3 4l-5 24H8z"/><path fill="#ffbe32" d="m4 29 4 24h48l3-14z"/></g><g class="art-macos"><rect x="3" y="3" width="58" height="58" rx="14" fill="#218afb"/><path fill="#9bd5ff" d="M34 3h13a14 14 0 0 1 14 14v30a14 14 0 0 1-14 14H33l-4-18h8l-4-16z"/><path d="M20 22v6m25-6v6M17 40q15 14 31 0M33 17l-5 19h9l-1 15" fill="none" stroke="#163e66" stroke-width="2.1" stroke-linecap="round"/></g><g class="art-ubuntu"><path fill="#923817" d="M4 18a5 5 0 0 1 5-5h18l7 7h20a5 5 0 0 1 5 5v28H4z"/><path fill="#f2be91" d="M8 23h46v26H8z"/><rect x="4" y="27" width="56" height="29" rx="4" fill="#eb955e"/><path fill="#ffffff25" d="M7 27h50v2H7z"/></g>`,
        browser:`<circle cx="32" cy="32" r="28" fill="#29b8ec"/><circle cx="32" cy="32" r="23" fill="#167ad5"/><g stroke="#c9f5ff" fill="none" stroke-width="1.2"><circle cx="32" cy="32" r="19"/><path d="M13 32h38M32 13v38"/></g><path fill="#ff6156" d="m39 15-2 20-10-6z"/><path fill="white" d="m25 49 2-20 10 6z"/><circle cx="32" cy="32" r="3" fill="#164c7c"/>`,
        notepad:`<rect x="10" y="7" width="44" height="51" rx="5" fill="#4c9bd1"/><rect x="14" y="6" width="40" height="49" rx="3" fill="#fcfdff"/><path fill="#fbdc68" d="M14 6h40v12H14z"/><path stroke="#a7c5d9" stroke-width="1.5" d="M22 25h24M22 32h24M22 39h24M22 46h17"/><path stroke="#486b8d" stroke-width="2" d="M22 4v7m9-7v7m9-7v7m9-7v7"/>`,
        settings:`<rect x="3" y="3" width="58" height="58" rx="13" fill="#bcc1c6"/><path fill="#848c96" d="m26 7 12 0 2 8 7-3 7 9-5 6 8 4-2 11-8 0-1 8-11 4-4-7-8 3-7-9 5-6-8-4 2-11 8 0z"/><circle cx="32" cy="32" r="16" fill="#e8ebef"/><circle cx="32" cy="32" r="11" fill="#697686"/><circle cx="32" cy="32" r="6" fill="#bfc7d1"/>`,
        terminal:`<rect x="3" y="6" width="58" height="52" rx="9" fill="#212329" stroke="#676a73" stroke-width="2"/><path d="m14 21 11 10-11 10m18 0h17" stroke="#eff4fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
        calculator:`<rect x="10" y="3" width="45" height="58" rx="10" fill="#444851"/><rect x="15" y="9" width="35" height="15" rx="3" fill="#c5d6ce"/><path d="M20 33h4m13 0h6M22 31v4m-2 9h4m13-2 6 4m-6 0 6-4m-23 9h4" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="34" y="49" width="12" height="7" rx="2" fill="#f39c4b"/>`,
        photos:`<rect x="3" y="3" width="58" height="58" rx="14" fill="#fbfbfd"/><g transform="translate(32 32)" opacity=".9"><ellipse rx="10" ry="21" cy="-7" fill="#f9b700"/><ellipse rx="10" ry="21" cy="-7" fill="#e04e5a" transform="rotate(60)"/><ellipse rx="10" ry="21" cy="-7" fill="#9c5fc8" transform="rotate(120)"/><ellipse rx="10" ry="21" cy="-7" fill="#40a4df" transform="rotate(180)"/><ellipse rx="10" ry="21" cy="-7" fill="#52ac82" transform="rotate(240)"/><ellipse rx="10" ry="21" cy="-7" fill="#a3ca40" transform="rotate(300)"/></g><circle cx="32" cy="32" r="6" fill="#fff9"/>`,
        calendar:`<rect x="5" y="5" width="54" height="54" rx="10" fill="#fff"/><path fill="#f3564e" d="M5 17V15A10 10 0 0 1 15 5h34a10 10 0 0 1 10 10v7H5z"/><g stroke="#353c47" stroke-width="4" fill="none"><path d="M19 32h10l-7 18m13-18h9v18"/></g>`,
        clock:`<circle cx="32" cy="32" r="28" fill="#fafafa" stroke="#c6cad0" stroke-width="2"/><g stroke="#454951" stroke-width="2"><path d="M32 7v4m0 42v4M7 32h4m42 0h4"/><path d="M32 17v16l10 7" fill="none" stroke-width="3" stroke-linecap="round"/></g><path stroke="#f55a51" stroke-width="1.5" d="M32 35V12"/><circle cx="32" cy="32" r="3" fill="#f55a51"/>`,
        store:`<rect x="3" y="3" width="58" height="58" rx="14" fill="#168fea"/><path d="m19 47 15-28m-8 0 16 28M15 39h35" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M18 39h7" stroke="#9edaff" stroke-width="5" stroke-linecap="round"/>`,
        trash:`<path d="m14 19 4 39h28l4-39" fill="#cdd6dc" stroke="#8e9fab" stroke-width="2"/><path d="M11 18h42M24 13V8h16v5M25 26l2 24m12-24-2 24" fill="none" stroke="#8b9aa8" stroke-width="3" stroke-linecap="round"/>`,
        code:`<rect x="4" y="4" width="56" height="56" rx="12" fill="#7262cb"/><path d="m22 20-11 12 11 12m20-24 11 12-11 12M36 17l-9 30" fill="none" stroke="#f7f3ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    };
    const cache=new Map();
    OS.visualIcon=(id,size)=>{
        if(!glyph[id])return null;
        const key=id+':'+size;if(cache.has(key))return cache.get(key);
        const result=`<span class="app-icon themed-app-icon" data-icon-id="${id}" style="--icon-size:${Math.max(8,Math.min(128,Number(size)||32))}px"><svg width="100%" height="100%" viewBox="0 0 64 64" fill="none" aria-hidden="true">${glyph[id]}</svg></span>`;
        if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
    };
})();
