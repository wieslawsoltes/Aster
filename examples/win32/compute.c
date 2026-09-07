#include "miniwin.h"
/* Volatile forces the actual arithmetic loop into the PE32 machine code. */
void entry(void){volatile unsigned hash=2166136261u;for(unsigned i=0;i<200000;i++){hash=(hash^i)*16777619u;hash=(hash<<5)|(hash>>27);}char text[32];int n=decimal(hash,text);text[n++]='\n';DWORD written=0;HANDLE file=CreateFileA("checksum.txt",0x40000000,0,0,2,0,0);if(file==INVALID_HANDLE)ExitProcess(1);WriteFile(file,text,n,&written,0);CloseHandle(file);ExitProcess(written==n?0:2);}
