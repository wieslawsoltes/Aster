"""Native Windows format oracle; does not install or activate OS-wide themes.
CAB files from Aster are expanded by Windows; makecab-generated MSZIP blocks are
read by Aster. Original CUR/ANI resources are loaded by USER32 and PCM WAV by wave.
"""
import ctypes, hashlib, json, os, subprocess, sys, wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tests/themes/artifacts/native'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def main():
    if sys.platform!='win32':raise SystemExit('This oracle requires actual Windows; it is not skipped as a pass.')
    OUT.mkdir(parents=True,exist_ok=True)
    fixtures=OUT/'fixtures';subprocess.run(['node','tests/themes/fixtures.cjs',str(fixtures)],cwd=ROOT,check=True)
    report={'platform':sys.platform,'tests':[]}
    def check(name,fn):
        detail=fn();report['tests'].append({'name':name,'status':'PASS','detail':detail});print('PASS',name,flush=True)
    try:
        def extract():
            dest=OUT/'expanded';dest.mkdir(exist_ok=True)
            subprocess.run(['expand.exe','-F:*',str(fixtures/'test.themepack'),str(dest)],check=True,capture_output=True,text=True)
            for name in ['test.theme','background.png','pointer.cur','wait.ani','notify.wav']:
                assert (dest/name).read_bytes()==(fixtures/name).read_bytes(),name
            return {'files':5,'cabSHA256':digest(fixtures/'test.themepack')}
        check('Native expand.exe extracts the exact Aster CAB payloads',extract)
        def mszip():
            # Single 100KB member ensures multiple MSZIP blocks and history reuse.
            cab=OUT/'native.cab'
            subprocess.run(['makecab.exe','/D','CompressionType=MSZIP',str(fixtures/'large.bin'),str(cab)],check=True,capture_output=True,text=True)
            command="const f=require('fs'),a=require('assert/strict'),p=require('./src/theme-packs.js');const rows=p.unpack(f.readFileSync(process.argv[1]));a.equal(rows.length,1);a.deepEqual(Buffer.from(rows[0].bytes),f.readFileSync(process.argv[2]));console.log(JSON.stringify({name:rows[0].name,bytes:rows[0].bytes.length}));"
            result=subprocess.run(['node','-e',command,str(cab),str(fixtures/'large.bin')],cwd=ROOT,check=True,capture_output=True,text=True)
            return {'nativeCABSHA256':digest(cab),'result':json.loads(result.stdout)}
        check('Aster decodes native makecab MSZIP across multiple dictionary blocks',mszip)
        def cursors():
            user32=ctypes.WinDLL('user32',use_last_error=True)
            user32.LoadCursorFromFileW.argtypes=[ctypes.c_wchar_p];user32.LoadCursorFromFileW.restype=ctypes.c_void_p
            user32.DestroyCursor.argtypes=[ctypes.c_void_p];user32.DestroyCursor.restype=ctypes.c_int
            for name in ['pointer.cur','wait.ani']:
                handle=user32.LoadCursorFromFileW(str(fixtures/name))
                assert handle,f'{name}: LoadCursorFromFileW failed with {ctypes.get_last_error()}'
                assert user32.DestroyCursor(handle),name
            return ['pointer.cur','wait.ani']
        check('Native USER32 loads the original static and animated cursor fixtures',cursors)
        def audio():
            with wave.open(str(fixtures/'notify.wav'),'rb') as stream:
                assert stream.getnchannels()==1 and stream.getsampwidth()==2 and stream.getframerate()==8000 and stream.getnframes()==800
                assert len(stream.readframes(800))==1600
            return 'PCM mono, 8kHz, 100ms, 1600 bytes'
        check('Independent PCM WAV parser verifies the browser sound fixture',audio)
        report['status']='PASS'
    except Exception as exc:report['status']='FAIL';report['error']=str(exc);raise
    finally:(OUT/'results.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
if __name__=='__main__':main()
