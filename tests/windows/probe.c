/* Original Win32 GUI fixture, compiled by MinGW. This is a real Windows executable. */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
static HWND edit, save_button, label;
static LARGE_INTEGER frequency, started;
static void write_file(const char *name, const char *text) {
    HANDLE file=CreateFileA(name,GENERIC_WRITE,FILE_SHARE_READ,NULL,CREATE_ALWAYS,FILE_ATTRIBUTE_NORMAL,NULL);
    if(file!=INVALID_HANDLE_VALUE){DWORD written;WriteFile(file,text,(DWORD)strlen(text),&written,NULL);FlushFileBuffers(file);CloseHandle(file);}
}
static void ready(void) {
    RECT field,button; char text[512];
    GetWindowRect(edit,&field);GetWindowRect(save_button,&button);
    snprintf(text,sizeof(text),"{\"edit\":[%ld,%ld,%ld,%ld],\"button\":[%ld,%ld,%ld,%ld],\"bits\":%u}",field.left,field.top,field.right,field.bottom,button.left,button.top,button.right,button.bottom,(unsigned)(sizeof(void*)*8));
    write_file("geometry.json",text);
    LARGE_INTEGER now;QueryPerformanceCounter(&now);
    snprintf(text,sizeof(text),"{\"pid\":%lu,\"bits\":%u,\"winmain_to_ready_ms\":%.3f}",GetCurrentProcessId(),(unsigned)(sizeof(void*)*8),(double)(now.QuadPart-started.QuadPart)*1000.0/frequency.QuadPart);
    write_file("ready.json",text);
}
static LRESULT CALLBACK procedure(HWND window,UINT message,WPARAM wp,LPARAM lp) {
    switch(message){
    case WM_CREATE:
        label=CreateWindowA("STATIC","This is a native Win32 executable running in Wine.\r\nType below and save through Aster's live display.",WS_CHILD|WS_VISIBLE,24,24,580,48,window,NULL,NULL,NULL);
        edit=CreateWindowExA(WS_EX_CLIENTEDGE,"EDIT","",WS_CHILD|WS_VISIBLE|WS_TABSTOP|ES_AUTOHSCROLL,24,90,430,32,window,(HMENU)101,NULL,NULL);
        save_button=CreateWindowA("BUTTON","Save proof",WS_CHILD|WS_VISIBLE|WS_TABSTOP|BS_DEFPUSHBUTTON,24,144,140,38,window,(HMENU)102,NULL,NULL);
        SendMessage(edit,WM_SETFONT,(WPARAM)GetStockObject(DEFAULT_GUI_FONT),TRUE);
        SendMessage(save_button,WM_SETFONT,(WPARAM)GetStockObject(DEFAULT_GUI_FONT),TRUE);
        SendMessage(label,WM_SETFONT,(WPARAM)GetStockObject(DEFAULT_GUI_FONT),TRUE);
        SetTimer(window,1,200,NULL);return 0;
    case WM_TIMER: ready();KillTimer(window,1);return 0;
    case WM_COMMAND:
        if(LOWORD(wp)==102 && HIWORD(wp)==BN_CLICKED){char text[512];GetWindowTextA(edit,text,sizeof(text));write_file("result.txt",text);SetWindowTextA(label,"Saved by Win32 WriteFile. The browser did not create this file.");InvalidateRect(window,NULL,TRUE);}
        return 0;
    case WM_CLOSE: DestroyWindow(window);return 0;
    case WM_DESTROY: PostQuitMessage(0);return 0;
    }
    return DefWindowProcA(window,message,wp,lp);
}
int WINAPI WinMain(HINSTANCE instance,HINSTANCE previous,LPSTR command,int show) {
    (void)previous;(void)command;(void)show;
    QueryPerformanceFrequency(&frequency);QueryPerformanceCounter(&started);
    WNDCLASSA cls={0};cls.lpfnWndProc=procedure;cls.hInstance=instance;cls.lpszClassName="AsterWin32Proof";
    cls.hCursor=LoadCursor(NULL,IDC_ARROW);cls.hbrBackground=(HBRUSH)(COLOR_WINDOW+1);
    if(!RegisterClassA(&cls))return 2;
    HWND window=CreateWindowA(cls.lpszClassName,"Aster - Actual Win32 execution proof",WS_OVERLAPPEDWINDOW,70,60,660,330,NULL,NULL,instance,NULL);
    if(!window)return 3;
    ShowWindow(window,SW_SHOW);UpdateWindow(window);
    MSG message;while(GetMessage(&message,NULL,0,0)>0){TranslateMessage(&message);DispatchMessage(&message);}return 0;
}
