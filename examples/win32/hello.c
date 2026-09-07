#include "miniwin.h"
void entry(void) {
    int answer=MessageBoxW(0,L"Hello from real x86 Windows machine code.\nZażółć gęślą jaźń.\n\nNo Wine, server or Windows image is involved.",L"Aster • Win32 hello",1);
    ExitProcess(answer==1?0:2);
}
