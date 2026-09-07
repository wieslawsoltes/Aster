#include "miniwin.h"
static HWND edit,status;
static WCHAR text[16384];
static HBRUSH background;
static LRESULT __stdcall proc(HWND h,UINT msg,WPARAM wp,LPARAM lp) {
    if(msg==WM_CREATE){
        HINSTANCE instance=GetModuleHandleA(0);
        edit=CreateWindowExW(0,L"EDIT",L"This editor is controlled by a Windows executable.\r\nType here, save, and restart the EXE to load your note.",WS_CHILD_VISIBLE|0x00800000u|0x4|0x1000|0x40,20,70,630,270,h,100,instance,0);
        CreateWindowExW(0,L"BUTTON",L"Save note",WS_CHILD_VISIBLE,20,360,135,36,h,101,instance,0);
        CreateWindowExW(0,L"BUTTON",L"Load note",WS_CHILD_VISIBLE,170,360,135,36,h,102,instance,0);
        CreateWindowExW(0,L"BUTTON",L"Clear",WS_CHILD_VISIBLE,320,360,110,36,h,103,instance,0);
        status=CreateWindowExW(0,L"STATIC",L"Private C:\\note.txt — UTF-16",WS_CHILD_VISIBLE,20,418,630,24,h,104,instance,0);
        background=CreateSolidBrush(RGB(246,249,255));return 0;
    }
    if(msg==WM_COMMAND){
        if((wp&65535)==101){DWORD written=0;int n=GetWindowTextW(edit,text,16384);HANDLE file=CreateFileW(L"note.txt",0x40000000,0,0,2,0,0);
            if(file!=INVALID_HANDLE){BOOL ok=WriteFile(file,text,n*2,&written,0);CloseHandle(file);SetWindowTextW(status,ok&&written==n*2?L"Saved by Win32 WriteFile. Your note stays in this browser.":L"Save failed.");}return 0;}
        if((wp&65535)==102){DWORD read=0;HANDLE file=CreateFileW(L"note.txt",0x80000000,0,0,3,0,0);
            if(file!=INVALID_HANDLE){BOOL ok=ReadFile(file,text,sizeof(text)-2,&read,0);CloseHandle(file);text[read/2]=0;if(ok){SetWindowTextW(edit,text);SetWindowTextW(status,L"Loaded by Win32 ReadFile.");}}
            else SetWindowTextW(status,L"No saved note yet. Write something and press Save note.");return 0;}
        if((wp&65535)==103){SetWindowTextW(edit,L"");return 0;}
    }
    if(msg==WM_PAINT){PAINTSTRUCT ps;RECT r;HDC dc=BeginPaint(h,&ps);GetClientRect(h,&r);FillRect(dc,&r,background);SetBkMode(dc,1);SetTextColor(dc,RGB(32,53,90));const char *title="Aster Win32 Pad / original PE32 executable";TextOutA(dc,20,24,title,lstrlenA(title));EndPaint(h,&ps);return 0;}
    if(msg==WM_DESTROY){PostQuitMessage(0);return 0;}return DefWindowProcW(h,msg,wp,lp);
}
void entry(void){HINSTANCE instance=GetModuleHandleA(0);WNDCLASSW cls={0};MSG msg;cls.proc=proc;cls.instance=instance;cls.name=L"AsterPadClass";RegisterClassW(&cls);HWND h=CreateWindowExW(0,cls.name,L"Win32 Pad",WS_OVERLAPPEDWINDOW,0,0,680,470,0,0,instance,0);ShowWindow(h,5);UpdateWindow(h);while(GetMessageW(&msg,0,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}ExitProcess(msg.wParam);}
