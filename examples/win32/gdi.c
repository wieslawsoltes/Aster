#include "miniwin.h"
static HBRUSH bg,brushes[5];static HPEN pen;static unsigned frames,clicks;static int paused,px=550,py=325;
static LRESULT __stdcall proc(HWND h,UINT msg,WPARAM wp,LPARAM lp){
    if(msg==WM_CREATE){bg=CreateSolidBrush(RGB(16,23,42));brushes[0]=CreateSolidBrush(RGB(62,132,244));brushes[1]=CreateSolidBrush(RGB(69,203,166));brushes[2]=CreateSolidBrush(RGB(191,135,246));brushes[3]=CreateSolidBrush(RGB(251,185,80));brushes[4]=CreateSolidBrush(RGB(255,105,145));pen=CreatePen(0,2,RGB(164,187,230));SetTimer(h,1,33,0);return 0;}
    if(msg==WM_TIMER){frames++;InvalidateRect(h,0,0);return 0;}
    if(msg==WM_LBUTTONDOWN){clicks++;px=(short)(lp&65535);py=(short)(lp>>16);InvalidateRect(h,0,0);return 0;}
    if(msg==WM_KEYDOWN&&wp==32){paused=!paused;if(paused)KillTimer(h,1);else SetTimer(h,1,33,0);InvalidateRect(h,0,0);return 0;}
    if(msg==WM_PAINT){PAINTSTRUCT ps;RECT rect;HDC dc=BeginPaint(h,&ps);GetClientRect(h,&rect);FillRect(dc,&rect,bg);SetBkMode(dc,1);SetTextColor(dc,RGB(234,242,255));
        const char *title="GDI calls -> WebGPU / x86 logic in WebAssembly";TextOutA(dc,24,22,title,lstrlenA(title));
        const char *hint="Click to move the orb. Press Space to pause / resume.";TextOutA(dc,24,52,hint,lstrlenA(hint));
        HANDLE oldPen=SelectObject(dc,GetStockObject(8));HANDLE oldBrush=SelectObject(dc,brushes[0]);
        for(unsigned i=0;i<240;i++){int col=i%24,row=i/24;SelectObject(dc,brushes[(i+frames/12)%5]);int x=24+col*25,y=100+row*22;Rectangle(dc,x,y,x+19,y+15+(int)((i+frames)%7));}
        SelectObject(dc,brushes[clicks%5]);SelectObject(dc,pen);Ellipse(dc,px-28,py-28,px+28,py+28);MoveToEx(dc,24,348,0);LineTo(dc,630,348);
        SelectObject(dc,oldBrush);SelectObject(dc,oldPen);char buffer[32];int n=decimal(clicks,buffer);TextOutA(dc,24,373,"Native click count:",19);TextOutA(dc,185,373,buffer,n);n=decimal(frames,buffer);TextOutA(dc,280,373,"WM_TIMER frames:",16);TextOutA(dc,435,373,buffer,n);
        if(paused)TextOutA(dc,24,410,"Paused: the guest message loop is sleeping.",42);EndPaint(h,&ps);return 0;}
    if(msg==WM_DESTROY){KillTimer(h,1);PostQuitMessage(0);return 0;}return DefWindowProcA(h,msg,wp,lp);
}
void entry(void){HINSTANCE instance=GetModuleHandleA(0);WNDCLASSA cls={0};MSG msg;cls.proc=proc;cls.instance=instance;cls.name="AsterGDIDemo";RegisterClassA(&cls);HWND h=CreateWindowExA(0,cls.name,"Win32 GDI Playground",WS_OVERLAPPEDWINDOW,0,0,680,460,0,0,instance,0);ShowWindow(h,5);UpdateWindow(h);while(GetMessageA(&msg,0,0,0)>0){TranslateMessage(&msg);DispatchMessageA(&msg);}ExitProcess(0);}
