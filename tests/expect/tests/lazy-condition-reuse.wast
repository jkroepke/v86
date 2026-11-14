(module
  (type $t0 (func))
  (type $t1 (func (param i32)))
  (type $t2 (func (param i32 i32)))
  (type $t3 (func (param i32 i32 i32)))
  (type $t4 (func (result i32)))
  (type $t5 (func (result i64)))
  (type $t6 (func (param i32) (result i32)))
  (type $t7 (func (param i32 i32) (result i32)))
  (type $t8 (func (param i32) (result i64)))
  (type $t9 (func (param f32) (result i32)))
  (type $t10 (func (param f64) (result i32)))
  (type $t11 (func (param i32 i64)))
  (type $t12 (func (param i64 i32)))
  (type $t13 (func (param i64 i32) (result i32)))
  (type $t14 (func (param i64 i32) (result i64)))
  (type $t15 (func (param f32 i32)))
  (type $t16 (func (param i32 i32 i32) (result i32)))
  (type $t17 (func (param i64 i32 i32)))
  (type $t18 (func (param i32 i64 i32)))
  (type $t19 (func (param i32 i64 i32) (result i32)))
  (type $t20 (func (param i32 i64 i64 i32) (result i32)))
  (import "e" "instr_F4" (func $e.instr_F4 (type $t0)))
  (import "e" "exit_jit" (func $e.exit_jit (type $t0)))
  (import "e" "m" (memory {normalised output}))
  (func $f (export "f") (type $t1) (param $p0 i32)
    (local $l0 i32) (local $l1 i32) (local $l2 i32) (local $l3 i32) (local $l4 i32) (local $l5 i32) (local $l6 i32) (local $l7 i32) (local $l8 i32) (local $l9 i32) (local $l10 i32)
    (set_local $l0
      (i32.load
        (i32.const 64)))
    (set_local $l1
      (i32.load
        (i32.const 68)))
    (set_local $l2
      (i32.load
        (i32.const 72)))
    (set_local $l3
      (i32.load
        (i32.const 76)))
    (set_local $l4
      (i32.load
        (i32.const 80)))
    (set_local $l5
      (i32.load
        (i32.const 84)))
    (set_local $l6
      (i32.load
        (i32.const 88)))
    (set_local $l7
      (i32.load
        (i32.const 92)))
    (set_local $l8
      (i32.const 0))
    (block $B0
      (block $B1
        (block $B2
          (loop $L3
            (br_if $B0
              (i32.ge_u
                (get_local $l8)
                (i32.const 100003)))
            (block $B4
              (block $B5
              )
              (set_local $l8
                (i32.add
                  (get_local $l8)
                  (i32.const 18)))
              (i32.store
                (i32.const 112)
                (i32.sub
                  (get_local $l0)
                  (get_local $l3)))
              (i32.store
                (i32.const 104)
                (get_local $l0))
              (i64.store
                (i32.const 96)
                (i64.const -9223362325933719521))
              (set_local $l10
                (i32.ne
                  (i32.lt_s
                    (get_local $l0)
                    (get_local $l3))
                  (i32.const 0)))
              (if $I6
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l0
                (i32.or
                  (get_local $l10)
                  (i32.and
                    (get_local $l0)
                    (i32.const -256))))
              (set_local $l3
                (i32.const 0))
              (set_local $l10
                (i32.ne
                  (i32.ge_s
                    (i32.load
                      (i32.const 104))
                    (i32.sub
                      (i32.load
                        (i32.const 104))
                      (i32.load
                        (i32.const 112))))
                  (i32.const 0)))
              (if $I7
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (i32.and
                    (i32.shl
                      (get_local $l10)
                      (i32.const 8))
                    (i32.const 65280))
                  (i32.and
                    (get_local $l3)
                    (i32.const -65281))))
              (i32.store
                (i32.const 120)
                (i32.or
                  (i32.and
                    (i32.load
                      (i32.const 120))
                    (i32.const -2))
                  (i32.lt_u
                    (i32.load
                      (i32.const 104))
                    (i32.load
                      (i32.const 112)))))
              (i32.store
                (i32.const 104)
                (get_local $l1))
              (set_local $l1
                (i32.add
                  (get_local $l1)
                  (i32.const 1)))
              (i32.store
                (i32.const 112)
                (get_local $l1))
              (i64.store
                (i32.const 96)
                (i64.const 9706626088991))
              (set_local $l10
                (i32.ne
                  (i32.and
                    (i32.load
                      (i32.const 104))
                    (i32.const -2147483648))
                  (i32.const 0)))
              (if $I8
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (get_local $l10)
                  (i32.and
                    (get_local $l3)
                    (i32.const -256))))
              (if $I9
                (i32.and
                  (i32.and
                    (i32.load
                      (i32.const 104))
                    (i32.load
                      (i32.const 112)))
                  (i32.const -2147483648))
                (then
                  (set_local $l1
                    (get_local $l0))))
              (set_local $l10
                (i32.ne
                  (i32.eqz
                    (i32.and
                      (i32.load
                        (i32.const 104))
                      (i32.const -2147483648)))
                  (i32.const 0)))
              (if $I10
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (i32.and
                    (i32.shl
                      (get_local $l10)
                      (i32.const 8))
                    (i32.const 65280))
                  (i32.and
                    (get_local $l3)
                    (i32.const -65281))))
              (i32.store
                (i32.const 104)
                (i32.const 0))
              (set_local $l2
                (i32.sub
                  (i32.const 0)
                  (get_local $l2)))
              (i32.store
                (i32.const 112)
                (get_local $l2))
              (i64.store
                (i32.const 96)
                (i64.const -9223362325933719521))
              (set_local $l10
                (i32.ne
                  (i32.lt_u
                    (i32.load
                      (i32.const 104))
                    (get_local $l2))
                  (i32.const 0)))
              (if $I11
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l2
                (i32.or
                  (get_local $l10)
                  (i32.and
                    (get_local $l2)
                    (i32.const -256))))
              (i32.store
                (i32.const 104)
                (get_local $l7))
              (set_local $l7
                (i32.add
                  (get_local $l7)
                  (i32.const -3)))
              (i32.store
                (i32.const 112)
                (get_local $l7))
              (i64.store
                (i32.const 96)
                (i64.const 9710921056287))
              (set_local $l10
                (i32.ne
                  (i32.lt_s
                    (i32.load
                      (i32.const 104))
                    (i32.const 3))
                  (i32.const 0)))
              (if $I12
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (get_local $l10)
                  (i32.and
                    (get_local $l3)
                    (i32.const -256))))
              (set_local $l10
                (i32.ne
                  (i32.le_s
                    (i32.load
                      (i32.const 104))
                    (i32.const 3))
                  (i32.const 0)))
              (if $I13
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (i32.and
                    (i32.shl
                      (get_local $l10)
                      (i32.const 8))
                    (i32.const 65280))
                  (i32.and
                    (get_local $l3)
                    (i32.const -65281))))
              (set_local $l10
                (i32.add
                  (i32.add
                    (get_local $l6)
                    (i32.const 1))
                  (i32.lt_u
                    (i32.load
                      (i32.const 112))
                    (i32.const -3))))
              (i32.store
                (i32.const 112)
                (get_local $l10))
              (i64.store
                (i32.const 96)
                (i64.const 841813590047))
              (i32.store
                (i32.const 120)
                (i32.or
                  (i32.or
                    (i32.or
                      (i32.and
                        (i32.load
                          (i32.const 120))
                        (i32.const -2066))
                      (i32.and
                        (i32.shr_u
                          (i32.xor
                            (get_local $l6)
                            (i32.and
                              (i32.xor
                                (get_local $l6)
                                (i32.const 1))
                              (i32.xor
                                (i32.const 1)
                                (get_local $l10))))
                          (i32.const 31))
                        (i32.const 1)))
                    (i32.and
                      (i32.xor
                        (get_local $l6)
                        (i32.xor
                          (i32.const 1)
                          (get_local $l10)))
                      (i32.const 16)))
                  (i32.and
                    (i32.shr_u
                      (i32.and
                        (i32.xor
                          (i32.const 1)
                          (get_local $l10))
                        (i32.xor
                          (get_local $l6)
                          (get_local $l10)))
                      (i32.const 20))
                    (i32.const 2048))))
              (set_local $l6
                (get_local $l10))
              (set_local $l10
                (i32.ne
                  (i32.or
                    (i32.and
                      (i32.xor
                        (get_local $l6)
                        (i32.shl
                          (i32.load
                            (i32.const 120))
                          (i32.const 20)))
                      (i32.const -2147483648))
                    (i32.eqz
                      (get_local $l6)))
                  (i32.const 0)))
              (if $I14
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (get_local $l10)
                  (i32.and
                    (get_local $l3)
                    (i32.const -256))))
              (set_local $l10
                (i32.and
                  (i32.shr_u
                    (get_local $l6)
                    (i32.const 31))
                  (i32.const 1)))
              (set_local $l6
                (i32.shl
                  (get_local $l6)
                  (i32.const 1)))
              (i32.store
                (i32.const 112)
                (get_local $l6))
              (i64.store
                (i32.const 96)
                (i64.const 910533066783))
              (i32.store
                (i32.const 120)
                (i32.or
                  (i32.or
                    (i32.and
                      (i32.load
                        (i32.const 120))
                      (i32.const -2050))
                    (get_local $l10))
                  (i32.and
                    (i32.shl
                      (i32.xor
                        (get_local $l10)
                        (i32.shr_u
                          (get_local $l6)
                          (i32.const 31)))
                      (i32.const 11))
                    (i32.const 2048))))
              (set_local $l10
                (i32.ne
                  (i32.eqz
                    (i32.or
                      (i32.and
                        (i32.xor
                          (get_local $l6)
                          (i32.shl
                            (i32.load
                              (i32.const 120))
                            (i32.const 20)))
                        (i32.const -2147483648))
                      (i32.eqz
                        (get_local $l6))))
                  (i32.const 0)))
              (if $I15
                (i32.and
                  (get_local $l10)
                  (i32.const -256))
                (then
                  (unreachable)))
              (set_local $l3
                (i32.or
                  (i32.and
                    (i32.shl
                      (get_local $l10)
                      (i32.const 8))
                    (i32.const 65280))
                  (i32.and
                    (get_local $l3)
                    (i32.const -65281))))
              (i32.store
                (i32.const 560)
                (i32.or
                  (i32.and
                    (i32.load
                      (i32.const 556))
                    (i32.const -4096))
                  (i32.const 48)))
              (i32.store
                (i32.const 556)
                (i32.or
                  (i32.and
                    (i32.load
                      (i32.const 556))
                    (i32.const -4096))
                  (i32.const 49)))
              (i32.store
                (i32.const 64)
                (get_local $l0))
              (i32.store
                (i32.const 68)
                (get_local $l1))
              (i32.store
                (i32.const 72)
                (get_local $l2))
              (i32.store
                (i32.const 76)
                (get_local $l3))
              (i32.store
                (i32.const 80)
                (get_local $l4))
              (i32.store
                (i32.const 84)
                (get_local $l5))
              (i32.store
                (i32.const 88)
                (get_local $l6))
              (i32.store
                (i32.const 92)
                (get_local $l7))
              (call $e.instr_F4)
              (set_local $l0
                (i32.load
                  (i32.const 64)))
              (set_local $l1
                (i32.load
                  (i32.const 68)))
              (set_local $l2
                (i32.load
                  (i32.const 72)))
              (set_local $l3
                (i32.load
                  (i32.const 76)))
              (set_local $l4
                (i32.load
                  (i32.const 80)))
              (set_local $l5
                (i32.load
                  (i32.const 84)))
              (set_local $l6
                (i32.load
                  (i32.const 88)))
              (set_local $l7
                (i32.load
                  (i32.const 92)))
              (br $B0))
            (unreachable)))
        (i32.store
          (i32.const 64)
          (get_local $l0))
        (i32.store
          (i32.const 68)
          (get_local $l1))
        (i32.store
          (i32.const 72)
          (get_local $l2))
        (i32.store
          (i32.const 76)
          (get_local $l3))
        (i32.store
          (i32.const 80)
          (get_local $l4))
        (i32.store
          (i32.const 84)
          (get_local $l5))
        (i32.store
          (i32.const 88)
          (get_local $l6))
        (i32.store
          (i32.const 92)
          (get_local $l7))
        (call $e.exit_jit)
        (i32.store
          (i32.const 664)
          (i32.add
            (i32.load
              (i32.const 664))
            (get_local $l8)))
        (return))
      (i32.store8
        (i32.const 12734208)
        (i32.const 1))
      (i32.store
        (i32.const 556)
        (i32.or
          (i32.and
            (i32.load
              (i32.const 556))
            (i32.const -4096))
          (get_local $l9))))
    (i32.store
      (i32.const 64)
      (get_local $l0))
    (i32.store
      (i32.const 68)
      (get_local $l1))
    (i32.store
      (i32.const 72)
      (get_local $l2))
    (i32.store
      (i32.const 76)
      (get_local $l3))
    (i32.store
      (i32.const 80)
      (get_local $l4))
    (i32.store
      (i32.const 84)
      (get_local $l5))
    (i32.store
      (i32.const 88)
      (get_local $l6))
    (i32.store
      (i32.const 92)
      (get_local $l7))
    (i32.store
      (i32.const 664)
      (i32.add
        (i32.load
          (i32.const 664))
        (get_local $l8)))))
