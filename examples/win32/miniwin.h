/* Minimal Windows ABI declarations for the original examples. MIT.
 * These produce standard PE32 programs, not Aster-specific executables. */
#ifndef MINIWIN_H
#define MINIWIN_H
typedef unsigned int UINT, DWORD, HANDLE, HWND, HINSTANCE, HDC, HBRUSH, HPEN, HFONT, WPARAM;
typedef int BOOL, LONG, LPARAM, LRESULT;
typedef unsigned short WORD, WCHAR;
typedef LRESULT (__stdcall *WNDPROC)(HWND,UINT,WPARAM,LPARAM);
typedef struct {LONG left,top,right,bottom;} RECT;
typedef struct {UINT style;WNDPROC proc;int clsExtra,winExtra;HINSTANCE instance;HANDLE icon,cursor;HBRUSH background;const char *menu,*name;} WNDCLASSA;
typedef struct {UINT style;WNDPROC proc;int clsExtra,winExtra;HINSTANCE instance;HANDLE icon,cursor;HBRUSH background;const WCHAR *menu,*name;} WNDCLASSW;
typedef struct {HWND hwnd;UINT message;WPARAM wParam;LPARAM lParam;DWORD time;LONG x,y;} MSG;
typedef struct {HDC dc;BOOL erase;RECT rect;BOOL restore,incUpdate;unsigned char reserved[32];} PAINTSTRUCT;
#define API(dll,ret,name,args,count) __declspec(dllimport) ret __stdcall name args
API(kernel32,void,ExitProcess,(UINT code),1);
API(kernel32,HINSTANCE,GetModuleHandleA,(const char *name),1);
API(kernel32,DWORD,GetTickCount,(void),0);
API(kernel32,int,lstrlenA,(const char *text),1);
API(kernel32,HANDLE,CreateFileA,(const char*,DWORD,DWORD,void*,DWORD,DWORD,HANDLE),7);
API(kernel32,HANDLE,CreateFileW,(const WCHAR*,DWORD,DWORD,void*,DWORD,DWORD,HANDLE),7);
API(kernel32,BOOL,WriteFile,(HANDLE,const void*,DWORD,DWORD*,void*),5);
API(kernel32,BOOL,ReadFile,(HANDLE,void*,DWORD,DWORD*,void*),5);
API(kernel32,BOOL,CloseHandle,(HANDLE),1);
API(user32,int,MessageBoxA,(HWND,const char*,const char*,UINT),4);
API(user32,int,MessageBoxW,(HWND,const WCHAR*,const WCHAR*,UINT),4);
API(user32,WORD,RegisterClassA,(const WNDCLASSA*),1);
API(user32,WORD,RegisterClassW,(const WNDCLASSW*),1);
API(user32,HWND,CreateWindowExA,(DWORD,const char*,const char*,DWORD,int,int,int,int,HWND,HANDLE,HINSTANCE,void*),12);
API(user32,HWND,CreateWindowExW,(DWORD,const WCHAR*,const WCHAR*,DWORD,int,int,int,int,HWND,HANDLE,HINSTANCE,void*),12);
API(user32,LRESULT,DefWindowProcA,(HWND,UINT,WPARAM,LPARAM),4);
API(user32,LRESULT,DefWindowProcW,(HWND,UINT,WPARAM,LPARAM),4);
API(user32,BOOL,ShowWindow,(HWND,int),2);
API(user32,BOOL,UpdateWindow,(HWND),1);
API(user32,BOOL,GetMessageA,(MSG*,HWND,UINT,UINT),4);
API(user32,BOOL,GetMessageW,(MSG*,HWND,UINT,UINT),4);
API(user32,BOOL,TranslateMessage,(const MSG*),1);
API(user32,LRESULT,DispatchMessageA,(const MSG*),1);
API(user32,LRESULT,DispatchMessageW,(const MSG*),1);
API(user32,void,PostQuitMessage,(int),1);
API(user32,int,GetWindowTextW,(HWND,WCHAR*,int),3);
API(user32,BOOL,SetWindowTextW,(HWND,const WCHAR*),2);
API(user32,BOOL,SetWindowTextA,(HWND,const char*),2);
API(user32,BOOL,GetClientRect,(HWND,RECT*),2);
API(user32,BOOL,InvalidateRect,(HWND,const RECT*,BOOL),3);
API(user32,UINT,SetTimer,(HWND,UINT,UINT,void*),4);
API(user32,BOOL,KillTimer,(HWND,UINT),2);
API(user32,HDC,BeginPaint,(HWND,PAINTSTRUCT*),2);
API(user32,BOOL,EndPaint,(HWND,const PAINTSTRUCT*),2);
API(user32,int,FillRect,(HDC,const RECT*,HBRUSH),3);
API(gdi32,HBRUSH,CreateSolidBrush,(DWORD),1);
API(gdi32,HPEN,CreatePen,(int,int,DWORD),3);
API(gdi32,HANDLE,GetStockObject,(int),1);
API(gdi32,HANDLE,SelectObject,(HDC,HANDLE),2);
API(gdi32,BOOL,DeleteObject,(HANDLE),1);
API(gdi32,DWORD,SetTextColor,(HDC,DWORD),2);
API(gdi32,int,SetBkMode,(HDC,int),2);
API(gdi32,BOOL,TextOutA,(HDC,int,int,const char*,int),5);
API(gdi32,BOOL,Rectangle,(HDC,int,int,int,int),5);
API(gdi32,BOOL,Ellipse,(HDC,int,int,int,int),5);
API(gdi32,BOOL,MoveToEx,(HDC,int,int,void*),4);
API(gdi32,BOOL,LineTo,(HDC,int,int),3);
#define RGB(r,g,b) ((DWORD)(r)|((DWORD)(g)<<8)|((DWORD)(b)<<16))
#define WS_OVERLAPPEDWINDOW 0x00cf0000u
#define WS_CHILD_VISIBLE 0x50000000u
#define INVALID_HANDLE 0xffffffffu
#define WM_CREATE 1
#define WM_DESTROY 2
#define WM_PAINT 15
#define WM_COMMAND 273
#define WM_TIMER 275
#define WM_KEYDOWN 256
#define WM_LBUTTONDOWN 513
static int decimal(unsigned n,char *out){char tmp[16];int i=0,j;do{tmp[i++]=(char)('0'+n%10);n/=10;}while(n);for(j=0;j<i;j++)out[j]=tmp[i-j-1];out[i]=0;return i;}
#endif
