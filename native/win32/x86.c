/* Aster Win32: bounded user-mode IA-32 interpreter, compiled to WebAssembly.
 * MIT, 2026 Aster contributors. Integer subset, not a full x86 implementation.
 * Guest addresses never directly index WebAssembly's host/runtime state.
 */
typedef unsigned char u8; typedef unsigned short u16; typedef unsigned int u32;
typedef signed char i8; typedef signed short i16; typedef signed int i32;
typedef unsigned long long u64; typedef signed long long i64;
#define EXPORT __attribute__((visibility("default")))
#define RAM_SIZE (64u * 1024u * 1024u)
#define CF 1u
#define PF 4u
#define AF 16u
#define ZF 64u
#define SF 128u
#define DF 1024u
#define OF 2048u
#define ID (1u << 21)
#define PERSIST (DF|ID)
#define HOOK 0xf0000000u
#define SENTINEL 0xfffffff0u
static u8 ram[RAM_SIZE], executable[RAM_SIZE / 4096];
static u32 r[8], pc, flags=2, fsbase, fault, faultpc, epoch=1, cache_on=1;
static u64 instructions, cache_hits, cache_misses;
EXPORT u32 guest_base(void) { return (u32)ram; }
EXPORT u32 guest_size(void) { return RAM_SIZE; }
EXPORT u32 get_reg(u32 n) { return n<8?r[n]:n==8?pc:flags; }
EXPORT void set_reg(u32 n,u32 v) { if(n<8)r[n]=v;else if(n==8)pc=v;else flags=v|2; }
EXPORT void set_fs(u32 v) { fsbase=v; }
EXPORT u32 get_fault(void) { return fault; }
EXPORT u32 get_fault_pc(void) { return faultpc; }
EXPORT double instruction_count(void) { return (double)instructions; }
EXPORT double hit_count(void) { return (double)cache_hits; }
EXPORT double miss_count(void) { return (double)cache_misses; }
EXPORT void set_cache(u32 enabled) { cache_on=enabled; }
EXPORT void invalidate(void) { ++epoch; if(!epoch)epoch=1; }
EXPORT void touch(u32 addr,u32 size) {
 if(addr>=RAM_SIZE||size>RAM_SIZE-addr||!size)return;
 for(u32 i=addr/4096;i<((addr+size+4095)/4096);i++)if(executable[i]){invalidate();return;}
}
EXPORT void fpu_reset(void);
EXPORT void reset(void) { for(u32 i=0;i<8;i++)r[i]=0; pc=0;flags=2;fault=0;instructions=cache_hits=cache_misses=0;fpu_reset();invalidate(); }
EXPORT void mark_executable(u32 addr,u32 size) { if(addr>=RAM_SIZE||size>RAM_SIZE-addr){fault=1;return;} for(u32 i=addr/4096;i<((addr+size+4095)/4096);i++)executable[i]=1; invalidate(); }
static void fail(u32 code) { if(!fault){fault=code;faultpc=pc;} }
static int bounds(u32 a,u32 n) { if(a<4096||a>RAM_SIZE||n>RAM_SIZE-a){fail(1);return 0;}return 1; }
static u32 mask(int w) { return w==4?0xffffffffu:(1u<<(8*w))-1; }
static u32 rd(u32 a,int w) { if(!bounds(a,w))return 0;u32 v=ram[a];if(w>=2)v|=(u32)ram[a+1]<<8;if(w==4)v|=((u32)ram[a+2]<<16)|((u32)ram[a+3]<<24);return v; }
static void wr(u32 a,u32 v,int w) { if(!bounds(a,w))return;if(executable[a/4096]||executable[(a+w-1)/4096])invalidate(); for(int i=0;i<w;i++)ram[a+i]=(u8)(v>>(i*8)); }
static u32 regread(int n,int w) { if(w==1&&n>=4)return (r[n-4]>>8)&255;return r[n]&mask(w); }
static void regwrite(int n,u32 v,int w) { if(w==4)r[n]=v;else if(w==1&&n>=4)r[n-4]=(r[n-4]&~0xff00u)|((v&255)<<8);else r[n]=(r[n]&~mask(w))|(v&mask(w)); }
static void push(u32 v,int w) { r[4]-=w;wr(r[4],v,w); }
static u32 pop(int w) { u32 v=rd(r[4],w);r[4]+=w;return v; }
static i32 sign(u32 v,int w) { return w==1?(i8)v:w==2?(i16)v:(i32)v; }
static u32 szp(u32 v,int w) { v&=mask(w);u32 b=v&255;b^=b>>4;b&=15;return (!v?ZF:0)|(v&(1u<<(8*w-1))?SF:0)|((0x9669u>>b)&1?PF:0); }
/* add, or, adc, sbb, and, sub, xor, cmp; defined flags match operand width. */
static u32 alu(int op,u32 a,u32 b,int w) {
 u32 m=mask(w),s=1u<<(8*w-1),old=flags,c=(op==2||op==3)?(flags&CF):0,v=0;u64 wide;
 a&=m;b&=m;
 if(op==0||op==2){wide=(u64)a+b+c;v=(u32)wide&m;flags=(old&PERSIST)|szp(v,w)|(wide>m?CF:0)|((~(a^b)&(a^v)&s)?OF:0)|((a^b^v)&AF);}
 else if(op==3||op==5||op==7){wide=(u64)b+c;v=(a-b-c)&m;flags=(old&PERSIST)|szp(v,w)|((u64)a<wide?CF:0)|(((a^b)&(a^v)&s)?OF:0)|((a^b^v)&AF);}
 else {v=op==1?a|b:op==4?a&b:a^b;flags=(old&PERSIST)|szp(v,w);}
 flags|=2;return v;
}
static int condition(int c) { int cf=!!(flags&CF),zf=!!(flags&ZF),sf=!!(flags&SF),of=!!(flags&OF),pf=!!(flags&PF);switch(c){case 0:return of;case 1:return !of;case 2:return cf;case 3:return !cf;case 4:return zf;case 5:return !zf;case 6:return cf||zf;case 7:return !cf&&!zf;case 8:return sf;case 9:return !sf;case 10:return pf;case 11:return !pf;case 12:return sf!=of;case 13:return sf==of;case 14:return zf||sf!=of;default:return !zf&&sf==of;} }
typedef struct {u32 imm; i32 disp; u8 kind,reg,base,index,scale,fs;} Operand;
/* kind: immediate/register/memory. base/index 255 means absent. */
static Operand imm(u32 v){Operand a={0};a.kind=1;a.imm=v;return a;}
static Operand reg(int n){Operand a={0};a.kind=2;a.reg=n;return a;}
static u32 address(Operand a){return (u32)a.disp+(a.base!=255?r[a.base]:0)+(a.index!=255?r[a.index]<<a.scale:0)+(a.fs?fsbase:0);}
static u32 readop(Operand a,int w){return a.kind==1?a.imm&mask(w):a.kind==2?regread(a.reg,w):rd(address(a),w);}
static void writeop(Operand a,u32 v,int w){if(a.kind==2)regwrite(a.reg,v,w);else if(a.kind==3)wr(address(a),v,w);else fail(4);}
enum {BAD=0,MOV,LEA,ALU,TEST,INC,DEC,PUSH,POP,CALL,JMP,JCC,RET,LEAVE,NOP,XCHG,MOVZX,MOVSX,IMUL,MULDIV,SHIFT,SETCC,CMOV,STR,LOOP,SIGNEXT,FLAG,PUSHA,POPA,PUSHF,POPF,BSWAP,SHDOUBLE,CMPXCHG,XADD,CPUID,LAHF,SAHF,BIT,BITSCAN,FPU};
typedef struct {u32 tag,gen,next;Operand a,b;u32 extra;u8 op,w,sub,rep,seg,lock;} Insn;
#define CACHE_SIZE 16384
static Insn cache[CACHE_SIZE];
static u32 cursor;static int segfs;
static u32 fetch(int w){u32 a=cursor;cursor+=w;if(!bounds(a,w)||!executable[a/4096]||!executable[(cursor-1)/4096]){fail(2);return 0;}return rd(a,w);}
static Operand modrm(int code) { Operand a={0};int mod=code>>6,rm=code&7;if(mod==3)return reg(rm);a.kind=3;a.base=rm;a.index=255;a.fs=segfs;
 if(rm==4){int sib=fetch(1);a.scale=sib>>6;a.index=(sib>>3)&7;if(a.index==4)a.index=255;a.base=sib&7;}
 if(mod==0&&a.base==5){a.base=255;a.disp=(i32)fetch(4);}else if(mod==1)a.disp=(i8)fetch(1);else if(mod==2)a.disp=(i32)fetch(4);return a;
}
static Insn decode(u32 at){Insn d={0};d.tag=at;d.gen=epoch;d.w=4;cursor=at;segfs=0;int op=fetch(1),prefix=0;
 while(op==0xf0||op==0x66||op==0xf2||op==0xf3||op==0x64||op==0x2e||op==0x3e||op==0x26||op==0x36){if(++prefix>8){fail(3);break;}if(op==0xf0)d.lock=1;else if(op==0x66)d.w=2;else if(op==0x64)segfs=1;else if(op==0xf2||op==0xf3)d.rep=op;op=fetch(1);}
 d.seg=segfs;int w=d.w,m,g;
 if(op<=0x3d&&(op&7)<=5){d.op=ALU;d.sub=op>>3;int form=op&7;d.w=(form&1)?w:1;if(form<4){m=fetch(1);Operand rm=modrm(m),rg=reg((m>>3)&7);d.a=form&2?rg:rm;d.b=form&2?rm:rg;}else {d.a=reg(0);d.b=imm(fetch(d.w));}}
 else if(op>=0x40&&op<=0x4f){d.op=op<0x48?INC:DEC;d.a=reg(op&7);}
 else if(op>=0x50&&op<=0x5f){d.op=op<0x58?PUSH:POP;d.a=reg(op&7);}
 else if(op>=0x70&&op<=0x7f){d.op=JCC;d.sub=op&15;d.extra=(i8)fetch(1);}
 else if(op>=0xb0&&op<=0xbf){d.op=MOV;d.w=op<0xb8?1:w;d.a=reg(op&7);d.b=imm(fetch(d.w));}
 else if(op>=0x91&&op<=0x97){d.op=XCHG;d.a=reg(0);d.b=reg(op&7);}
 else switch(op){
 case 0x60:d.op=PUSHA;break;case 0x61:d.op=POPA;break;
 case 0x68:case 0x6a:d.op=PUSH;d.a=imm(op==0x68?fetch(w):(u32)(i32)(i8)fetch(1));break;
 case 0x69:case 0x6b:d.op=IMUL;m=fetch(1);d.a=reg((m>>3)&7);d.b=modrm(m);d.extra=op==0x69?fetch(w):(u32)(i32)(i8)fetch(1);d.sub=1;break;
 case 0x80:case 0x81:case 0x83:d.op=ALU;d.w=op==0x80?1:w;m=fetch(1);d.sub=(m>>3)&7;d.a=modrm(m);d.b=imm(op==0x83?(u32)(i32)(i8)fetch(1):fetch(d.w));break;
 case 0x84:case 0x85:d.op=TEST;d.w=op==0x84?1:w;m=fetch(1);d.a=modrm(m);d.b=reg((m>>3)&7);break;
 case 0x86:case 0x87:d.op=XCHG;d.w=op==0x86?1:w;m=fetch(1);d.a=modrm(m);d.b=reg((m>>3)&7);break;
 case 0x88:case 0x89:case 0x8a:case 0x8b:{d.op=MOV;d.w=(op&1)?w:1;m=fetch(1);Operand rm=modrm(m),rg=reg((m>>3)&7);d.a=(op&2)?rg:rm;d.b=(op&2)?rm:rg;break;}
 case 0x8d:d.op=LEA;m=fetch(1);d.a=reg((m>>3)&7);d.b=modrm(m);if(d.b.kind!=3)d.op=BAD;break;
 case 0x8f:d.op=POP;m=fetch(1);if((m>>3)&7)d.op=BAD;d.a=modrm(m);break;
 case 0x90:d.op=NOP;break;case 0x98:case 0x99:d.op=SIGNEXT;d.sub=op;break;
 case 0x9c:d.op=PUSHF;break;case 0x9d:d.op=POPF;break;case 0x9e:d.op=SAHF;break;case 0x9f:d.op=LAHF;break;
 case 0xa0:case 0xa1:case 0xa2:case 0xa3:{d.op=MOV;d.w=(op&1)?w:1;Operand a={0};a.kind=3;a.base=a.index=255;a.disp=fetch(4);a.fs=segfs;d.a=(op&2)?a:reg(0);d.b=(op&2)?reg(0):a;break;}
 case 0xa4:case 0xa5:case 0xa6:case 0xa7:case 0xaa:case 0xab:case 0xac:case 0xad:case 0xae:case 0xaf:d.op=STR;d.sub=op;d.w=(op&1)?w:1;break;
 case 0xa8:case 0xa9:d.op=TEST;d.w=(op&1)?w:1;d.a=reg(0);d.b=imm(fetch(d.w));break;
 case 0xc0:case 0xc1:case 0xd0:case 0xd1:case 0xd2:case 0xd3:d.op=SHIFT;d.w=(op&1)?w:1;m=fetch(1);d.sub=(m>>3)&7;d.a=modrm(m);d.b=op<0xd0?imm(fetch(1)):op<0xd2?imm(1):reg(1);break;
 case 0x9b:d.op=NOP;break;
 case 0xd8:case 0xd9:case 0xda:case 0xdb:case 0xdc:case 0xdd:case 0xde:case 0xdf:d.op=FPU;d.sub=op;m=fetch(1);d.extra=m;d.a=modrm(m);break;
 case 0xc2:case 0xc3:d.op=RET;d.extra=op==0xc2?fetch(2):0;break;
 case 0xc6:case 0xc7:d.op=MOV;d.w=(op&1)?w:1;m=fetch(1);if((m>>3)&7)d.op=BAD;d.a=modrm(m);d.b=imm(fetch(d.w));break;
 case 0xc9:d.op=LEAVE;break;
 case 0xe0:case 0xe1:case 0xe2:case 0xe3:d.op=LOOP;d.sub=op;d.extra=(i8)fetch(1);break;
 case 0xe8:case 0xe9:case 0xeb:d.op=op==0xe8?CALL:JMP;d.sub=1;d.extra=op==0xeb?(i32)(i8)fetch(1):(i32)fetch(4);if(w==2&&op!=0xeb)d.op=BAD;break;
 case 0xf5:case 0xf8:case 0xf9:case 0xfc:case 0xfd:d.op=FLAG;d.sub=op;break;
 case 0xf6:case 0xf7:d.op=MULDIV;d.w=(op&1)?w:1;m=fetch(1);d.sub=(m>>3)&7;d.a=modrm(m);if(d.sub==0){d.op=TEST;d.b=imm(fetch(d.w));}else if(d.sub==1)d.op=BAD;break;
 case 0xfe:case 0xff:m=fetch(1);g=(m>>3)&7;d.w=op==0xfe?1:w;d.a=modrm(m);d.op=g==0?INC:g==1?DEC:g==2?CALL:g==4?JMP:g==6?PUSH:BAD;if(op==0xfe&&g>1)d.op=BAD;break;
 case 0x0f:{int op2=fetch(1);if(op2>=0x80&&op2<=0x8f){d.op=w==4?JCC:BAD;d.sub=op2&15;d.extra=fetch(4);}else if(op2>=0x90&&op2<=0x9f){d.op=SETCC;d.w=1;d.sub=op2&15;m=fetch(1);d.a=modrm(m);}else if(op2>=0x40&&op2<=0x4f){d.op=CMOV;d.sub=op2&15;m=fetch(1);d.a=reg((m>>3)&7);d.b=modrm(m);}else if(op2>=0xc8&&op2<=0xcf){d.op=BSWAP;d.a=reg(op2&7);}else switch(op2){
 case 0x1f:m=fetch(1);d.a=modrm(m);d.op=NOP;break;
 case 0xaf:d.op=IMUL;m=fetch(1);d.a=reg((m>>3)&7);d.b=modrm(m);break;
 case 0xb6:case 0xb7:case 0xbe:case 0xbf:d.op=op2<0xbe?MOVZX:MOVSX;m=fetch(1);d.a=reg((m>>3)&7);d.b=modrm(m);d.sub=(op2&1)?2:1;break;
 case 0xa4:case 0xa5:case 0xac:case 0xad:d.op=SHDOUBLE;m=fetch(1);d.a=modrm(m);d.b=reg((m>>3)&7);d.sub=op2;d.extra=(op2&1)?0:fetch(1);break;
 case 0xb0:case 0xb1:d.op=CMPXCHG;d.w=(op2&1)?w:1;m=fetch(1);d.a=modrm(m);d.b=reg((m>>3)&7);break;
 case 0xc0:case 0xc1:d.op=XADD;d.w=(op2&1)?w:1;m=fetch(1);d.a=modrm(m);d.b=reg((m>>3)&7);break;
 case 0xa3:case 0xab:case 0xb3:case 0xbb:d.op=BIT;m=fetch(1);d.a=modrm(m);d.b=reg((m>>3)&7);d.sub=op2==0xa3?4:op2==0xab?5:op2==0xb3?6:7;break;
 case 0xba:d.op=BIT;m=fetch(1);d.sub=(m>>3)&7;d.a=modrm(m);d.b=imm(fetch(1));if(d.sub<4)d.op=BAD;break;
 case 0xbc:case 0xbd:d.op=BITSCAN;m=fetch(1);d.a=reg((m>>3)&7);d.b=modrm(m);d.sub=op2==0xbd;break;
 case 0xa2:d.op=CPUID;break;
 default:d.op=BAD;break;}break;}
 default:d.op=BAD;break;
 }
 d.next=cursor;if(cursor-at>15)d.op=BAD;
 /* Repetition and FS on unsupported forms must not silently change semantics. */
 if(d.rep&&d.op!=STR&&!(op==0x90&&d.rep==0xf3))d.op=BAD;
 if(d.lock && (d.a.kind!=3 || !((d.op==ALU&&d.sub!=7)||d.op==INC||d.op==DEC||d.op==XCHG||d.op==CMPXCHG||d.op==XADD||(d.op==BIT&&d.sub!=4)||(d.op==MULDIV&&(d.sub==2||d.sub==3)))))d.op=BAD;
 return d;
}
static u32 shift(u32 v,u32 count,int sub,int w){u32 n=count&31,m=mask(w),bits=w*8,old=flags,res=v&m,cf=flags&CF,of=flags&OF;if(!n)return res;
 if(sub==0||sub==1){n%=bits;if(!n)return res;res=sub==0?((res<<n)|(res>>(bits-n)))&m:((res>>n)|(res<<(bits-n)))&m;cf=sub==0?(res&1):(res>>(bits-1));if((count&31)==1)of=sub==0?(((res>>(bits-1))^cf)?OF:0):((((res>>(bits-1))^(res>>(bits-2)))&1u)*OF);flags=(old&~(CF|OF))|cf|of;return res;}
 if(sub==2||sub==3){for(u32 i=0;i<n;i++){u32 next=sub==2?res>>(bits-1):res&1;res=sub==2?((res<<1)|cf)&m:(res>>1)|(cf<<(bits-1));cf=next;}if(n==1)of=sub==2?(((res>>(bits-1))^cf)?OF:0):((((res>>(bits-1))^(res>>(bits-2)))&1u)*OF);flags=(old&~(CF|OF))|cf|of;return res;}
 if(sub==4||sub==6){cf=n<=bits?(res>>(bits-n))&1:0;res=n>=bits?0:(res<<n)&m;if(n==1)of=((res>>(bits-1))^cf)?OF:0;}
 else if(sub==5){cf=n<=bits?(res>>(n-1))&1:0;of=n==1&&res&(1u<<(bits-1))?OF:0;res=n>=bits?0:res>>n;}
 else {cf=n>=bits?!!(res&(1u<<(bits-1))):(res>>(n-1))&1;res=(u32)(sign(res,w)>>(n>=bits?bits-1:n))&m;of=0;}
 flags=(old&PERSIST)|szp(res,w)|cf|of|2;return res;
}
/* Deliberate x87 subset with binary64 intermediates (not 80-bit precision).
 * Stack tags, control-word rounding for integer stores, status and exceptions
 * are modeled. Transcendental/environment-save/BCD opcodes fail closed. */
static double fp[8];static u8 fptag[8];static u32 fptop,fpcontrol=0x37f,fpstatus;
static double st(int i){u32 n=(fptop+i)&7;if(!fptag[n]){fail(6);return 0;}return fp[n];}
static void stput(int i,double value){u32 n=(fptop+i)&7;fp[n]=value;fptag[n]=1;}
EXPORT void fpu_push(double value){u32 n=(fptop-1)&7;if(fptag[n]){fail(6);return;}fptop=n;fp[n]=value;fptag[n]=1;}
EXPORT double fpu_pop(void){double value=st(0);fptag[fptop]=0;fptop=(fptop+1)&7;return value;}
EXPORT u32 fpu_status(void){return (fpstatus&~0x3800)|(fptop<<11);}
EXPORT u32 fpu_control(void){return fpcontrol;}
EXPORT void set_fpu_control(u32 value){fpcontrol=value&65535;}
EXPORT void fpu_reset(void){for(int i=0;i<8;i++){fp[i]=0;fptag[i]=0;}fptop=fpstatus=0;fpcontrol=0x37f;}
static double scale2(double value,int exponent){if(exponent>16384)exponent=16384;if(exponent< -16384)exponent=-16384;while(exponent>0){value*=2;exponent--;}while(exponent<0){value*=0.5;exponent++;}return value;}
static double fpround(double x){int mode=(fpcontrol>>10)&3;if(mode==1)return __builtin_floor(x);if(mode==2)return __builtin_ceil(x);if(mode==3)return __builtin_trunc(x);double lo=__builtin_floor(x),part=x-lo;if(part<.5)return lo;if(part>.5)return lo+1;return lo-2*__builtin_floor(lo*.5)==0?lo:lo+1;}
static double fpread(u32 p,int width){
 if(width==4){union{u32 u;float f;}v;v.u=rd(p,4);return v.f;}
 if(width==8){union{u64 u;double d;}v;v.u=(u64)rd(p,4)|((u64)rd(p+4,4)<<32);return v.d;}
 u64 mantissa=(u64)rd(p,4)|((u64)rd(p+4,4)<<32);u32 signExp=rd(p+8,2),exponent=signExp&0x7fff;double v;
 if(exponent==0x7fff){union{u64 u;double d;}x;x.u=mantissa==0x8000000000000000ULL?0x7ff0000000000000ULL:0x7ff8000000000000ULL;v=x.d;}
 else v=scale2((double)mantissa,((int)(exponent?exponent:1)-16383)-63);
 return signExp&0x8000?-v:v;
}
static void fpwrite(u32 p,double value,int width){
 if(width==4){union{u32 u;float f;}v;v.f=(float)value;wr(p,v.u,4);return;}
 union{u64 u;double d;}v;v.d=value;if(width==8){wr(p,(u32)v.u,4);wr(p+4,(u32)(v.u>>32),4);return;}
 u32 signExp=(u32)(v.u>>48)&0x8000,exponent=(u32)(v.u>>52)&0x7ff;u64 frac=v.u&0xfffffffffffffULL,mantissa=0;
 if(exponent==0x7ff){signExp|=0x7fff;mantissa=frac?0xc000000000000000ULL:0x8000000000000000ULL;}
 else if(exponent){signExp|=exponent+16383-1023;mantissa=(frac|(1ULL<<52))<<11;}
 else if(frac){int exp=-1022;while(!(frac&(1ULL<<52))){frac<<=1;exp--;}signExp|=(u32)(exp+16383);mantissa=frac<<11;}
 wr(p,(u32)mantissa,4);wr(p+4,(u32)(mantissa>>32),4);wr(p+8,signExp,2);
}
static void fpcompare(double a,double b,int cpuFlags){int unordered=(a!=a||b!=b);if(cpuFlags){flags&=~(CF|PF|ZF|OF|SF|AF);flags|=unordered?(CF|PF|ZF):a<b?CF:a==b?ZF:0;}
 else {fpstatus&=~0x4500;fpstatus|=unordered?0x4500:a<b?0x100:a==b?0x4000:0;}}
static double fparithmetic(double a,double b,int sub){double value=0;switch(sub){case 0:value=a+b;break;case 1:value=a*b;break;case 4:value=a-b;break;case 5:value=b-a;break;case 6:if(b==0){fpstatus|=4;if(!(fpcontrol&4))fail(7);}value=a/b;break;case 7:if(a==0){fpstatus|=4;if(!(fpcontrol&4))fail(7);}value=b/a;break;default:fail(3);}
 if(((fpcontrol>>8)&3)==0)value=(double)(float)value;return value;}
static void fpstoreint(u32 p,int width,int truncate){double value=st(0);value=truncate?__builtin_trunc(value):fpround(value);double limit=width==2?32768.0:width==4?2147483648.0:9223372036854775808.0;i64 n;
 if(value!=value||value< -limit||value>=limit){fpstatus|=1;if(!(fpcontrol&1))fail(7);n=width==2?-32768:width==4?(-2147483647-1):(-9223372036854775807LL-1);}
 else n=(i64)value;
 if(width==8){wr(p,(u32)n,4);wr(p+4,(u32)((u64)n>>32),4);}else wr(p,(u32)n,width);
}
static void fpstep(Insn d){int op=d.sub,m=d.extra,g=(m>>3)&7,i=m&7;u32 p=d.a.kind==3?address(d.a):0;double a,b;
 if(m<0xc0){
  if(op==0xd8||op==0xda||op==0xdc||op==0xde){a=st(0);b=op==0xda?(double)(i32)rd(p,4):op==0xde?(double)(i16)rd(p,2):fpread(p,op==0xd8?4:8);if(g==2||g==3){fpcompare(a,b,0);if(g==3)fpu_pop();}else stput(0,fparithmetic(a,b,g));return;}
  if(op==0xd9){if(g==0)fpu_push(fpread(p,4));else if(g==2||g==3){fpwrite(p,st(0),4);if(g==3)fpu_pop();}else if(g==5)fpcontrol=rd(p,2);else if(g==7)wr(p,fpcontrol,2);else fail(3);return;}
  if(op==0xdd){if(g==0)fpu_push(fpread(p,8));else if(g==1){fpstoreint(p,8,1);fpu_pop();}else if(g==2||g==3){fpwrite(p,st(0),8);if(g==3)fpu_pop();}else if(g==7)wr(p,fpu_status(),2);else fail(3);return;}
  if(op==0xdb){if(g==0)fpu_push((double)(i32)rd(p,4));else if(g==1||g==2||g==3){fpstoreint(p,4,g==1);if(g!=2)fpu_pop();}else if(g==5)fpu_push(fpread(p,10));else if(g==7){fpwrite(p,st(0),10);fpu_pop();}else fail(3);return;}
  if(op==0xdf){if(g==0)fpu_push((double)(i16)rd(p,2));else if(g==1||g==2||g==3){fpstoreint(p,2,g==1);if(g!=2)fpu_pop();}else if(g==5){u64 n=(u64)rd(p,4)|((u64)rd(p+4,4)<<32);fpu_push((double)(i64)n);}else if(g==7){fpstoreint(p,8,0);fpu_pop();}else fail(3);return;}
  fail(3);return;
 }
 if(op==0xd8){a=st(0);b=st(i);if(g==2||g==3){fpcompare(a,b,0);if(g==3)fpu_pop();}else stput(0,fparithmetic(a,b,g));return;}
 if(op==0xdc||op==0xde){if(op==0xde&&m==0xd9){fpcompare(st(0),st(1),0);fpu_pop();fpu_pop();return;}if(g==2||g==3){fail(3);return;}a=st(i);b=st(0);stput(i,fparithmetic(a,b,g>=4?(g^1):g));if(op==0xde)fpu_pop();return;}
 if(op==0xd9){if(g==0){fpu_push(st(i));return;}if(g==1){a=st(0);b=st(i);stput(0,b);stput(i,a);return;}
  switch(m){case 0xd0:return;case 0xe0:stput(0,-st(0));return;case 0xe1:stput(0,__builtin_fabs(st(0)));return;case 0xe4:fpcompare(st(0),0,0);return;
  case 0xe8:fpu_push(1);return;case 0xe9:fpu_push(3.321928094887362);return;case 0xea:fpu_push(1.4426950408889634);return;case 0xeb:fpu_push(3.141592653589793);return;case 0xec:fpu_push(.3010299956639812);return;case 0xed:fpu_push(.6931471805599453);return;case 0xee:fpu_push(0);return;
  case 0xf6:fptop=(fptop-1)&7;return;case 0xf7:fptop=(fptop+1)&7;return;case 0xfa:stput(0,__builtin_sqrt(st(0)));return;case 0xfc:stput(0,fpround(st(0)));return;case 0xfd:a=st(1);if(a>16384)a=16384;if(a< -16384)a=-16384;stput(0,scale2(st(0),(i32)a));return;default:fail(3);return;}
 }
 if(op==0xdd){if(g==0){fptag[(fptop+i)&7]=0;return;}if(g==2||g==3){stput(i,st(0));if(g==3)fpu_pop();return;}if(g==4||g==5){fpcompare(st(0),st(i),0);if(g==5)fpu_pop();return;}fail(3);return;}
 if(op==0xdb){if(m==0xe2){fpstatus&=~0xff;return;}if(m==0xe3){fpu_reset();return;}if(g==5||g==6){fpcompare(st(0),st(i),1);return;}}
 if(op==0xdf){if(m==0xe0){regwrite(0,fpu_status(),2);return;}if(g==5||g==6){fpcompare(st(0),st(i),1);fpu_pop();return;}}
 if(op==0xda&&m==0xe9){fpcompare(st(0),st(1),0);fpu_pop();fpu_pop();return;}
 fail(3);
}

/* status: 0 budget, 1 imported function, 2 callback/entry return, 3 fault. */
EXPORT u32 run(u32 budget){
 if(budget>1000000)budget=1000000;
 for(u32 step=0;step<budget&&!fault;step++){
  if(pc==SENTINEL)return 2;if(pc>=HOOK)return 1;
  u32 at=pc,index=(at^(at>>14))&(CACHE_SIZE-1);Insn d;
  if(cache_on&&cache[index].tag==at&&cache[index].gen==epoch){d=cache[index];cache_hits++;}else{d=decode(at);cache_misses++;if(cache_on)cache[index]=d;}
  if(fault)break;if(!d.op){fail(3);break;}instructions++;pc=d.next;
  int w=d.w;u32 a,b,v,save; i64 prod;u64 product;
  switch(d.op){
  case MOV:writeop(d.a,readop(d.b,w),w);break;
  case LEA:{Operand e=d.b;e.fs=0;writeop(d.a,address(e),w);break;}
  case ALU:a=readop(d.a,w);b=readop(d.b,w);v=alu(d.sub,a,b,w);if(d.sub!=7)writeop(d.a,v,w);break;
  case TEST:alu(4,readop(d.a,w),readop(d.b,w),w);break;
  case INC:case DEC:save=flags&CF;v=alu(d.op==INC?0:5,readop(d.a,w),1,w);flags=(flags&~CF)|save;writeop(d.a,v,w);break;
  case PUSH:push(readop(d.a,w),w);break;case POP:v=pop(w);writeop(d.a,v,w);break;
  case CALL:v=d.sub?d.next+d.extra:readop(d.a,w);push(d.next,w);pc=v;break;
  case JMP:pc=d.sub?d.next+d.extra:readop(d.a,w);break;
  case JCC:if(condition(d.sub))pc=d.next+d.extra;break;
  case RET:pc=pop(w);r[4]+=d.extra;break;
  case LEAVE:r[4]=r[5];regwrite(5,pop(w),w);break;
  case XCHG:a=readop(d.a,w);b=readop(d.b,w);writeop(d.a,b,w);writeop(d.b,a,w);break;
  case MOVZX:case MOVSX:v=readop(d.b,d.sub);writeop(d.a,d.op==MOVSX?(u32)sign(v,d.sub):v,w);break;
  case SETCC:writeop(d.a,condition(d.sub),1);break;
  case CMOV:v=readop(d.b,w);if(condition(d.sub))writeop(d.a,v,w);break;
  case IMUL:prod=(i64)sign(readop(d.b,w),w)*(i64)sign(d.sub?d.extra:readop(d.a,w),w);v=(u32)prod;writeop(d.a,v,w);flags=(flags&~(CF|OF))|(prod!=(i64)sign(v,w)?CF|OF:0);break;
  case MULDIV:a=readop(d.a,w);if(d.sub==2){writeop(d.a,~a,w);break;}if(d.sub==3){writeop(d.a,alu(5,0,a,w),w);break;}
   if(d.sub==4||d.sub==5){product=d.sub==4?(u64)regread(0,w)*a:(u64)((i64)sign(regread(0,w),w)*sign(a,w));if(w==1)regwrite(0,(u32)product,2);else{regwrite(0,(u32)product,w);regwrite(2,(u32)(product>>(w*8)),w);}int over=d.sub==4?!!(product>>(w*8)):((i64)product!=(i64)sign((u32)product,w));flags=(flags&~(CF|OF))|(over?CF|OF:0);}
   else if(d.sub==6||d.sub==7){if(!a){fail(5);break;}product=w==1?regread(0,2):((u64)regread(2,w)<<(w*8))|regread(0,w);if(d.sub==6){u64 q=product/a;if(q>mask(w)){fail(5);break;}v=(u32)q;b=(u32)(product%a);}else{prod=w==1?(i16)product:w==2?(i32)product:(i64)product;i64 div=sign(a,w);if(prod==(-9223372036854775807LL-1)&&div==-1){fail(5);break;}i64 q=prod/div;if(q!=(i64)sign((u32)q,w)){fail(5);break;}v=(u32)q;b=(u32)(prod%div);}if(w==1)regwrite(0,(v&255)|((b&255)<<8),2);else{regwrite(0,v,w);regwrite(2,b,w);}}
   break;
  case SHIFT:a=readop(d.a,w);b=readop(d.b,1);writeop(d.a,shift(a,b,d.sub,w),w);break;
  case SHDOUBLE:a=readop(d.a,w);b=readop(d.b,w);v=(d.sub&1?regread(1,1):d.extra)&31;if(v){if(v>w*8){fail(3);break;}u64 wide;u32 out,carry;if(d.sub<0xac){wide=((u64)a<<(w*8))|b;out=(u32)((wide<<v)>>(w*8));carry=(a>>(w*8-v))&1;}else{wide=((u64)b<<(w*8))|a;out=(u32)(wide>>v);carry=(a>>(v-1))&1;}save=flags;flags=(save&PERSIST)|szp(out,w)|carry|2;if(v==1)flags|=((a^out)&(1u<<(w*8-1)))?OF:0;writeop(d.a,out,w);}break;
  case LOOP:if(d.sub!=0xe3)r[1]--;if(d.sub==0xe3?!r[1]:r[1]&&(d.sub==0xe2||(d.sub==0xe1?!!(flags&ZF):!(flags&ZF))))pc=d.next+d.extra;break;
  case SIGNEXT:if(d.sub==0x98)regwrite(0,(u32)sign(regread(0,w==4?2:1),w==4?2:1),w);else regwrite(2,sign(regread(0,w),w)<0?mask(w):0,w);break;
  case FLAG:if(d.sub==0xfc)flags&=~DF;else if(d.sub==0xfd)flags|=DF;else if(d.sub==0xf8)flags&=~CF;else if(d.sub==0xf9)flags|=CF;else flags^=CF;break;
  case PUSHF:push(flags,w);break;case POPF:flags=(pop(w)&(CF|PF|AF|ZF|SF|DF|OF|ID))|2;break;
  case LAHF:regwrite(4,flags&255,1);break;case SAHF:flags=(flags&~(CF|PF|AF|ZF|SF))|(regread(4,1)&(CF|PF|AF|ZF|SF))|2;break;
  case PUSHA:save=r[4];for(int i=0;i<8;i++)push(i==4?save:regread(i,w),w);break;
  case POPA:for(int i=7;i>=0;i--){v=pop(w);if(i!=4)regwrite(i,v,w);}break;
  case BSWAP:v=readop(d.a,4);writeop(d.a,(v>>24)|((v>>8)&0xff00)|((v<<8)&0xff0000)|(v<<24),4);break;
  case CMPXCHG:a=readop(d.a,w);alu(7,regread(0,w),a,w);if(flags&ZF)writeop(d.a,readop(d.b,w),w);else regwrite(0,a,w);break;
  case XADD:a=readop(d.a,w);v=alu(0,a,readop(d.b,w),w);writeop(d.b,a,w);writeop(d.a,v,w);break;
  case BIT:{i32 bit=d.b.kind==1?(i32)d.b.imm:sign(readop(d.b,w),w);Operand target=d.a;
   if(target.kind==3){i32 word=bit>=0?bit/(w*8):-1-((-1-bit)/(w*8));target.disp+=(i32)(word*w);}
   u32 bitmask=1u<<((u32)bit&(w*8-1));a=readop(target,w);flags=(flags&~CF)|((a&bitmask)?CF:0);
   if(d.sub!=4){v=d.sub==5?a|bitmask:d.sub==6?a&~bitmask:a^bitmask;writeop(target,v,w);}break;}
  case BITSCAN:a=readop(d.b,w);if(!a)flags|=ZF;else{flags&=~ZF;v=d.sub?(31u-__builtin_clz(a)):__builtin_ctz(a);writeop(d.a,v,w);}break;
  case FPU:fpstep(d);break;
  case CPUID:if(r[0]==0){r[0]=1;r[3]=0x756e6547;r[2]=0x49656e69;r[1]=0x6c65746e;}else{r[0]=0x500;r[1]=r[2]=r[3]=0;}break;
  case STR:{u32 n=d.rep?r[1]:1,limit=n>256?256:n;int stride=(flags&DF)?-w:w;int compare=d.sub==0xa6||d.sub==0xa7||d.sub==0xae||d.sub==0xaf;u32 i;
   for(i=0;i<limit&&!fault;i++){u32 src=r[6]+(d.seg?fsbase:0);if(d.sub==0xa4||d.sub==0xa5){wr(r[7],rd(src,w),w);r[6]+=stride;r[7]+=stride;}else if(d.sub==0xaa||d.sub==0xab){wr(r[7],regread(0,w),w);r[7]+=stride;}else if(d.sub==0xac||d.sub==0xad){regwrite(0,rd(src,w),w);r[6]+=stride;}else if(d.sub==0xa6||d.sub==0xa7){alu(7,rd(src,w),rd(r[7],w),w);r[6]+=stride;r[7]+=stride;}else{alu(7,regread(0,w),rd(r[7],w),w);r[7]+=stride;}if(d.rep)r[1]--;if(d.rep&&compare&&((d.rep==0xf3)!=!!(flags&ZF)))break;}
   if(d.rep&&r[1]&&i==limit)pc=at;break;}
  case NOP:break;
  default:fail(3);break;
  }
  if(fault){faultpc=at;break;}
 }
 return fault?3:0;
}
/* Freestanding intrinsics; compile with -fno-builtin to avoid recursion. */
void *memset(void *p,int c,unsigned long n){u8 *b=p;for(unsigned long i=0;i<n;i++)b[i]=c;return p;}
void *memcpy(void *d,const void *s,unsigned long n){u8 *a=d;const u8 *b=s;for(unsigned long i=0;i<n;i++)a[i]=b[i];return d;}
