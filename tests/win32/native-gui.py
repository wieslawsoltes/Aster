"""Run the exact committed WineMine PE on native Windows for GUI equivalence.
This job validates the fixture only; Windows is never an Aster dependency.
"""
from pathlib import Path
import ctypes as C
from ctypes import wintypes as T
import hashlib, json, subprocess, time, sys
ROOT=Path(__file__).resolve().parents[2]

def main():
    if sys.platform!='win32':raise SystemExit('Native Windows reference requires Windows')
    import winreg
    user=C.WinDLL('user32',use_last_error=True)
    HWND=T.HWND;UINT=T.UINT;WPARAM=C.c_size_t;LPARAM=C.c_ssize_t
    callback_type=C.WINFUNCTYPE(T.BOOL,HWND,LPARAM)
    user.EnumWindows.argtypes=[callback_type,LPARAM];user.EnumWindows.restype=T.BOOL
    user.GetWindowThreadProcessId.argtypes=[HWND,C.POINTER(T.DWORD)];user.GetWindowThreadProcessId.restype=T.DWORD
    user.GetWindowTextW.argtypes=[HWND,T.LPWSTR,C.c_int];user.GetWindowTextW.restype=C.c_int
    user.IsWindowVisible.argtypes=[HWND];user.IsWindowVisible.restype=T.BOOL
    user.PostMessageW.argtypes=[HWND,UINT,WPARAM,LPARAM];user.PostMessageW.restype=T.BOOL
    user.SendMessageW.argtypes=[HWND,UINT,WPARAM,LPARAM];user.SendMessageW.restype=LPARAM
    user.GetDlgItem.argtypes=[HWND,C.c_int];user.GetDlgItem.restype=HWND
    user.SetWindowTextW.argtypes=[HWND,T.LPCWSTR];user.SetWindowTextW.restype=T.BOOL
    user.GetClientRect.argtypes=[HWND,C.POINTER(T.RECT)];user.GetClientRect.restype=T.BOOL
    exe=ROOT/'src/win32/third-party/winemine.exe';out=ROOT/'tests/win32/native-artifacts';out.mkdir(parents=True,exist_ok=True)
    keypath=r'Software\Microsoft\WinMine';access=winreg.KEY_READ|winreg.KEY_WRITE|winreg.KEY_WOW64_32KEY
    saved=None
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,keypath,0,access) as key:
            saved=[];i=0
            while True:
                try:saved.append(winreg.EnumValue(key,i));i+=1
                except OSError:break
    except FileNotFoundError:pass
    # Store/restore any existing key on this disposable reference runner. Native
    # WineMine itself uses its fixed upstream registry path; Aster never does.
    process=subprocess.Popen([str(exe)],cwd=out);report={'exeSha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'host':'Native Windows; fixture reference only','checks':[]}
    def wait(fn,seconds=15):
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            value=fn()
            if value:return value
            if process.poll() is not None:raise AssertionError(f'WineMine exited early: {process.returncode}')
            time.sleep(.03)
        raise AssertionError('Native GUI timed out')
    def windows():
        found=[]
        @callback_type
        def each(hwnd,_):
            pid=T.DWORD();user.GetWindowThreadProcessId(hwnd,C.byref(pid))
            if pid.value==process.pid:
                text=C.create_unicode_buffer(512);user.GetWindowTextW(hwnd,text,512)
                found.append((hwnd,text.value,bool(user.IsWindowVisible(hwnd))))
            return True
        user.EnumWindows(each,0);return found
    def named(title):return next((h for h,t,visible in windows() if t==title and visible),0)
    def size(hwnd):
        rect=T.RECT();assert user.GetClientRect(hwnd,C.byref(rect));return [rect.right-rect.left,rect.bottom-rect.top]
    try:
        main=wait(lambda:named('WineMine'));assert user.PostMessageW(main,0x111,1005,0);wait(lambda:size(main)==[154,182]);report['checks'].append({'name':'Beginner board','size':size(main)})
        assert user.PostMessageW(main,0x111,1006,0);wait(lambda:size(main)==[266,294]);report['checks'].append({'name':'Intermediate menu','size':size(main)})
        assert user.PostMessageW(main,0x111,1008,0);dialog=wait(lambda:named('Custom Game'))
        def text(hwnd):
            buffer=C.create_unicode_buffer(128)
            user.GetWindowTextW(hwnd,buffer,128)
            return buffer.value
        # Wait until WM_INITDIALOG has populated all fields.
        wait(lambda: all(text(user.GetDlgItem(dialog,id))==value for id,value in [(1032,'16'),(1031,'16'),(1033,'40')]))
        for id,value in [(1032,'12'),(1031,'13'),(1033,'20')]:
            control=user.GetDlgItem(dialog,id)
            assert control and user.SetWindowTextW(control,value)
            assert text(control)==value
        report['customControls']={str(id):text(user.GetDlgItem(dialog,id)) for id in [1032,1031,1033]}
        user.SendMessageW(user.GetDlgItem(dialog,1),0xf5,0,0);wait(lambda:not named('Custom Game'));wait(lambda:size(main)==[218,230]);report['checks'].append({'name':'Real Custom Game dialog result','size':size(main)})
        assert user.PostMessageW(main,0x111,1002,0);assert process.wait(timeout=15)==0
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,keypath,0,access) as key:
            settings={name:winreg.QueryValueEx(key,name)[0] for name in ['Width','Height','Mines','Difficulty']}
        assert settings['Width']==13 and settings['Height']==12 and settings['Mines']==20,settings
        report.update({'status':'PASS','exitCode':0,'registry':settings})
    except Exception as e:
        report.update({'status':'FAIL','error':str(e),'windows':windows(),'mainClient':size(main) if isinstance(main,int) else None});raise
    finally:
        if process.poll() is None:process.kill();process.wait(timeout=5)
        try:
            if saved is None:winreg.DeleteKeyEx(winreg.HKEY_CURRENT_USER,keypath,winreg.KEY_WOW64_32KEY)
            else:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER,keypath,0,access) as key:
                    while True:
                        try:name=winreg.EnumValue(key,0)[0];winreg.DeleteValue(key,name)
                        except OSError:break
                    for name,value,type in saved:winreg.SetValueEx(key,name,0,type,value)
        except FileNotFoundError:pass
        (out/'native-gui.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
