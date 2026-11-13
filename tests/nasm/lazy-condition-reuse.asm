global _start

%include "header.inc"

; Compare all defined condition codes against native x86, including aliases
; overwritten by SETcc/CMOVcc and MOV between a producer and its consumers.
%macro capture 0
    seto  [edi + 0]
    setno [edi + 1]
    setb  [edi + 2]
    setae [edi + 3]
    sete  [edi + 4]
    setne [edi + 5]
    setbe [edi + 6]
    seta  [edi + 7]
    sets  [edi + 8]
    setns [edi + 9]
    setp  [edi + 10]
    setnp [edi + 11]
    setl  [edi + 12]
    setge [edi + 13]
    setle [edi + 14]
    setg  [edi + 15]
    lea edi, [edi + 16]
%endmacro

%macro check_unary 3
    mov eax, %3
    stc
    %1 %2
    capture
    mov eax, 0x12345678
    capture
    mov eax, %3
    clc
    %1 %2
    setz al
    cmovl eax, edx
    capture
%endmacro

    mov edi, 0x100000
    mov edx, 0x87654321
%assign value 0
%rep 8
%if value = 0
%assign n 0
%elif value = 1
%assign n 1
%elif value = 2
%assign n -1
%elif value = 3
%assign n 0x7f
%elif value = 4
%assign n 0x7fff
%elif value = 5
%assign n 0x7fffffff
%elif value = 6
%assign n 0x80000000
%else
%assign n 0x80008080
%endif
    check_unary inc, eax, n
    check_unary inc, ax, n
    check_unary dec, eax, n
    check_unary dec, ax, n
    check_unary neg, eax, n
    check_unary neg, ax, n
%assign value value + 1
%endrep

    ; The saved CMP operands must survive overlapping register writes.
    mov eax, -1
    mov ebx, 1
    cmp eax, ebx
    setl al
    setle bh
    cmovg ebx, edx
    capture
    mov eax, 0
    mov ebx, 0
    capture

    mov eax, 0x7fffffff
    add eax, 1
    capture
    mov eax, -1
    stc
    adc eax, 0
    capture
    mov eax, 0
    stc
    sbb eax, 0
    capture
    shl eax, 1
    capture
    shr eax, 1
    capture
    sar eax, 1
    capture

%macro check_add 3
    mov eax, %2
    add %1, %3
    capture
    mov eax, 0xdeadbeef
    capture
%endmacro

%assign value 0
%rep 8
%if value = 0
%assign n 0
%elif value = 1
%assign n 1
%elif value = 2
%assign n -1
%elif value = 3
%assign n 0x7f
%elif value = 4
%assign n 0x7fff
%elif value = 5
%assign n 0x7fffffff
%elif value = 6
%assign n 0x80000000
%else
%assign n 0x80008080
%endif
    check_add eax, n, 1
    check_add eax, n, -1
    check_add eax, n, 0
    check_add eax, n, 0x7fffffff
    check_add eax, n, 0x80000000
    check_add al, n, 1
    check_add al, n, -1
    check_add al, n, 0
    check_add al, n, 0x7f
    check_add al, n, 0x80
%assign value value + 1
%endrep

%include "footer.inc"
