/* Package only the public runtime and native main/preload. No dev/test artifacts. */
'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
    const {packager}=await import('@electron/packager');
    const root=path.resolve(__dirname,'..'),stage=path.join(__dirname,'.stage'),out=path.join(__dirname,'dist');
    await fs.rm(stage,{recursive:true,force:true});await fs.mkdir(path.join(stage,'runtime'),{recursive:true});
    for(const file of ['main.cjs','runtime.cjs','preload.cjs','policy.cjs'])await fs.copyFile(path.join(__dirname,file),path.join(stage,file));
    const pkg=JSON.parse(await fs.readFile(path.join(__dirname,'package.json'),'utf8'));
    delete pkg.devDependencies;delete pkg.scripts;await fs.writeFile(path.join(stage,'package.json'),JSON.stringify(pkg,null,2));
    for(const file of ['index.html','Aster.html','sw.js','manifest.webmanifest','LICENSE','src','assets','sdk','third-party'])await fs.cp(path.join(root,file),path.join(stage,'runtime',file),{recursive:true});
    const build={commit:process.env.GITHUB_SHA||'local',electron:require('./package.json').devDependencies.electron,standaloneSHA256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,'Aster.html'))).digest('hex')};
    await fs.writeFile(path.join(stage,'build.json'),JSON.stringify(build,null,2)+'\n');
    const packages=await packager({dir:stage,out,name:'Aster Desktop',appBundleId:'org.aster.desktop',executableName:'aster-desktop',electronVersion:build.electron,platform:process.env.TARGET_PLATFORM||process.platform,arch:process.env.TARGET_ARCH||process.arch,overwrite:true,asar:true,prune:true});
    for(const p of packages){await fs.writeFile(path.join(p,'ASTER-BUILD.json'),JSON.stringify(build,null,2)+'\n');console.log(p);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
