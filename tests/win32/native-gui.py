"""Run the committed WineMine PE on Windows; this is a test-only host.

Cross-process EDIT text must use WM_GETTEXT/WM_SETTEXT, not GetWindowText,
which intentionally reads only another process's window captions.
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
    user.SendMessageTimeoutW.argtypes=[HWND,UINT,WPARAM,LPARAM,UINT,UINT,C.POINTER(WPARAM)]
    user.SendMessageTimeoutW.restype=LPARAM
    user.GetDlgItem.argtypes=[HWND,C.c_int];user.GetDlgItem.restype=HWND
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
    process=subprocess.Popen([str(exe)],cwd=out)
    report={'exeSha256':hashlib.sha256(exe.read_bytes()).hexdigest(),'host':'Native Windows; fixture reference only','checks':[]}
    main_window=0
    def send(hwnd,message,wp=0,lp=0):
        result=WPARAM()
        assert hwnd and user.SendMessageTimeoutW(hwnd,message,wp,lp,2,3000,C.byref(result)),f'Message {message:x} failed: {C.get_last_error()}'
        return result.value
    def text(hwnd):
        buffer=C.create_unicode_buffer(128)
        send(hwnd,0x0d,len(buffer),C.addressof(buffer))
        return buffer.value
    def set_text(hwnd,value):
        buffer=C.create_unicode_buffer(value)
        assert send(hwnd,0x0c,0,C.addressof(buffer))
        assert text(hwnd)==value
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
                title=C.create_unicode_buffer(512);user.GetWindowTextW(hwnd,title,512)
                found.append((hwnd,title.value,bool(user.IsWindowVisible(hwnd))))
            return True
        user.EnumWindows(each,0);return found
    def named(title):return next((h for h,t,visible in windows() if t==title and visible),0)
    def size(hwnd):
        rect=T.RECT();assert user.GetClientRect(hwnd,C.byref(rect));return [rect.right-rect.left,rect.bottom-rect.top]
    try:
        main_window=wait(lambda:named('WineMine'))
        assert user.PostMessageW(main_window,0x111,1005,0)
        wait(lambda:size(main_window)==[154,182]);report['checks'].append({'name':'Beginner board','size':size(main_window)})
        assert user.PostMessageW(main_window,0x111,1006,0)
        wait(lambda:size(main_window)==[266,294]);report['checks'].append({'name':'Intermediate menu','size':size(main_window)})
        assert user.PostMessageW(main_window,0x111,1008,0)
        dialog=wait(lambda:named('Custom Game'))
        wait(lambda:all(text(user.GetDlgItem(dialog,id))==value for id,value in [(1032,'16'),(1031,'16'),(1033,'40')]))
        for id,value in [(1032,'12'),(1031,'13'),(1033,'20')]:set_text(user.GetDlgItem(dialog,id),value)
        report['customControls']={str(id):text(user.GetDlgItem(dialog,id)) for id in [1032,1031,1033]}
        send(user.GetDlgItem(dialog,1),0xf5)
        wait(lambda:not named('Custom Game'))
        wait(lambda:size(main_window)==[218,230]);report['checks'].append({'name':'Real Custom Game dialog result','size':size(main_window)})
        assert user.PostMessageW(main_window,0x111,1002,0);assert process.wait(timeout=15)==0
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,keypath,0,access) as key:
            settings={name:winreg.QueryValueEx(key,name)[0] for name in ['Width','Height','Mines','Difficulty']}
        assert settings['Width']==13 and settings['Height']==12 and settings['Mines']==20,settings
        report.update(status='PASS',exitCode=0,registry=settings)
    except Exception as e:
        report.update(status='FAIL',error=str(e),windows=windows(),mainClient=size(main_window) if main_window else None)
        raise
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
