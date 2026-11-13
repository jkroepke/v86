BITS 32
    mov ax, 0x800
    mov gs, ax
    mov ebx, [gs:0]
    mov ecx, [gs:4]
    mov ax, 0x900
    mov gs, ax
    mov edx, [gs:0]
    mov esi, [gs:4]
    mov ax, 0
    mov gs, ax
    mov edi, [gs:0]
    hlt
