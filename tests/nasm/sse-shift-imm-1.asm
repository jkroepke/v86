global _start

section .data
	align 16
d0:
	db	0x9d, 0xc8, 0x27, 0x57, 0x00, 0x01, 0xb0, 0x0e, 0x80, 0x15, 0x17, 0x01, 0x66, 0x21, 0xc4, 0x80
d1:
	db	0x00, 0x81, 0x81, 0xf4, 0x00, 0x68, 0x7f, 0x0a, 0x90, 0x7f, 0xf3, 0x0f, 0x0f, 0x32, 0x81, 0x01
d2:
	db	0x00, 0x93, 0x00, 0x93, 0x1b, 0xff, 0x81, 0x5e, 0xb1, 0x85, 0x51, 0x80, 0x76, 0x38, 0x29, 0x35
d3:
	db	0xb6, 0xff, 0x2c, 0x0c, 0x9b, 0x01, 0xc2, 0x77, 0x40, 0x11, 0x7f, 0xe6, 0xa5, 0xff, 0x83, 0x40
d4:
	db	0x81, 0x79, 0x88, 0x81, 0x4f, 0x7e, 0xb2, 0x7f, 0x84, 0x34, 0x81, 0xff, 0x80, 0x98, 0x64, 0x00
d5:
	db	0xff, 0x06, 0xdf, 0x97, 0x48, 0x81, 0x7c, 0xdc, 0xd7, 0x75, 0x3f, 0xa0, 0x81, 0xff, 0xff, 0x50
d6:
	db	0xff, 0x0a, 0xd1, 0x5d, 0xa7, 0xc7, 0x36, 0x01, 0x81, 0x66, 0x33, 0xe9, 0xf3, 0xbd, 0xd2, 0xe9
d7:
	db	0x81, 0x01, 0x3e, 0xb6, 0x81, 0xff, 0x00, 0xd7, 0xb4, 0x37, 0x81, 0x70, 0xc8, 0x54, 0x00, 0x62
; word data that makes the saturating instructions saturate
sat0:
	dw	0x7fff, 0x7fff, 0x8000, 0x8000, 0x7fff, 0x0001, 0x8000, 0xffff
sat1:
	dw	0x8000, 0x8000, 0x7fff, 0x7fff, 0x8000, 0xffff, 0x4000, 0x4000

%include "header.inc"

	; shifts of xmm registers by an immediate: below, at and above the lane width
	movdqu		xmm0, [d0]
	movdqu		xmm1, [d1]
	movdqu		xmm2, [d2]
	movdqu		xmm3, [d3]
	movdqu		xmm4, [d4]
	movdqu		xmm5, [d5]
	movdqu		xmm6, [d6]
	movdqu		xmm7, [d7]
	psrlw		xmm0, 0
	psrlw		xmm1, 1
	psrlw		xmm2, 15
	psrlw		xmm3, 16
	psrlw		xmm4, 200
	psraw		xmm5, 0
	psraw		xmm6, 3
	psraw		xmm7, 15
	pxor		xmm0, [d3]
	movdqu		[d0], xmm0
	pxor		xmm1, [d4]
	movdqu		[d1], xmm1
	pxor		xmm2, [d5]
	movdqu		[d2], xmm2
	pxor		xmm3, [d6]
	movdqu		[d3], xmm3
	pxor		xmm4, [d7]
	movdqu		[d4], xmm4
	pxor		xmm5, [d0]
	movdqu		[d5], xmm5
	pxor		xmm6, [d1]
	movdqu		[d6], xmm6
	pxor		xmm7, [d2]
	movdqu		[d7], xmm7
	movdqu		xmm0, [d0]
	movdqu		xmm1, [d1]
	movdqu		xmm2, [d2]
	movdqu		xmm3, [d3]
	movdqu		xmm4, [d4]
	movdqu		xmm5, [d5]
	movdqu		xmm6, [d6]
	movdqu		xmm7, [d7]
	psraw		xmm0, 16
	psraw		xmm1, 255
	psllw		xmm2, 1
	psllw		xmm3, 15
	psllw		xmm4, 16
	psllw		xmm5, 17
	psrld		xmm6, 0
	psrld		xmm7, 5
	pxor		xmm0, [d3]
	movdqu		[d0], xmm0
	pxor		xmm1, [d4]
	movdqu		[d1], xmm1
	pxor		xmm2, [d5]
	movdqu		[d2], xmm2
	pxor		xmm3, [d6]
	movdqu		[d3], xmm3
	pxor		xmm4, [d7]
	movdqu		[d4], xmm4
	pxor		xmm5, [d0]
	movdqu		[d5], xmm5
	pxor		xmm6, [d1]
	movdqu		[d6], xmm6
	pxor		xmm7, [d2]
	movdqu		[d7], xmm7
	movdqu		xmm0, [d0]
	movdqu		xmm1, [d1]
	movdqu		xmm2, [d2]
	movdqu		xmm3, [d3]
	movdqu		xmm4, [d4]
	movdqu		xmm5, [d5]
	movdqu		xmm6, [d6]
	movdqu		xmm7, [d7]
	psrld		xmm0, 31
	psrld		xmm1, 32
	psrld		xmm2, 128
	psrad		xmm3, 1
	psrad		xmm4, 31
	psrad		xmm5, 32
	psrad		xmm6, 33
	psrad		xmm7, 255
	pxor		xmm0, [d3]
	movdqu		[d0], xmm0
	pxor		xmm1, [d4]
	movdqu		[d1], xmm1
	pxor		xmm2, [d5]
	movdqu		[d2], xmm2
	pxor		xmm3, [d6]
	movdqu		[d3], xmm3
	pxor		xmm4, [d7]
	movdqu		[d4], xmm4
	pxor		xmm5, [d0]
	movdqu		[d5], xmm5
	pxor		xmm6, [d1]
	movdqu		[d6], xmm6
	pxor		xmm7, [d2]
	movdqu		[d7], xmm7
	movdqu		xmm0, [d0]
	movdqu		xmm1, [d1]
	movdqu		xmm2, [d2]
	movdqu		xmm3, [d3]
	movdqu		xmm4, [d4]
	movdqu		xmm5, [d5]
	movdqu		xmm6, [d6]
	movdqu		xmm7, [d7]
	pslld		xmm0, 4

%include "footer.inc"
