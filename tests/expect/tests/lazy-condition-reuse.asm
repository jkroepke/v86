BITS 32
    cmp eax, ebx
    setl al
    mov ebx, 0
    setge bh
    inc ecx
    setle bl
    cmovl ecx, eax
    setg bh
    neg edx
    setb dl
    add edi, -3
    setl bl
    setle bh
    adc esi, 1
    setle bl
    shl esi, 1
    setg bh
    hlt
