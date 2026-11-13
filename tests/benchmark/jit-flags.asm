BITS 32
    mov ecx, 10000000
.loop:
    mov eax, 0x7fffffff
    inc eax
    setl bl
    setg bh
    cmovle edx, eax
    setz al
    mov eax, -1
    neg eax
    setz bl
    setb bh
    cmp eax, 1
    mov eax, 123
    setz bl
    setbe bh
    add eax, -124
    setl bl
    setle bh
    shl eax, 1
    setbe bl
    setle bh
    adc eax, 0
    setbe bl
    setle bh
    mov ebx, [gs:0]
    mov edx, [gs:4]
    mov esi, [gs:8]
    mov edi, [gs:12]
    mov ebx, [gs:16]
    mov edx, [gs:20]
    mov esi, [gs:24]
    mov edi, [gs:28]
    dec ecx
    jnz .loop
    hlt
