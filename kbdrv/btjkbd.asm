;--------------------------------------------------------------------
; Driver receives keycodes from paddle inputs (2nd joystick port)
; and emulates keystrokes by writing to CH ($02FC), so standard 
; K: handler can be used.
;--------------------------------------------------------------------

;--------------------------------------------------------------------
; SDX symbols
;--------------------------------------------------------------------

INSTALL     SMB 'INSTALL'
S_ADDIZ     SMB 'S_ADDIZ'
PRINTF      SMB 'PRINTF'

;--------------------------------------------------------------------
;--------------------------------------------------------------------

BRK_KEYCODE EQU 215


;--------------------------------------------------------------------
;--------------------------------------------------------------------

BRKKEY      EQU $0011
ATRACT      EQU $004D
COLOR4      EQU $02C8
VVBLKD      EQU $0224
NMIEN       EQU $D40E
PADDL2      EQU $0272
PADDL3      EQU $0273
CH          EQU $02FC

NMI_VBI     EQU $40

;--------------------------------------------------------------------
; Driver initialization
;--------------------------------------------------------------------

            BLK SPARTA $4000

INIT        .PROC

            ;LDA VMAIN
            ;LDX VMAIN+1
            ;JSR S_ADDIZ
            ;BCS ERR

            DEC INSTALL
            JMP MAINPROC

ERR         JSR PRINTF
            DTA B($9B),C'Cannot install',B($9B)
            DTA B(0)
            RTS

VMAIN       DTA V(MAINPROC)

            .ENDP

;--------------------------------------------------------------------
;--------------------------------------------------------------------

            BLK RELOC MAIN

OLDVBL      DTA A(0)                    ; saved VVBLKD
MYVBLPTR    DTA A(MYVBL)                ; new VVBLKD
PRESSED     DTA B(0)                    ; keycode valid
KEYCODE     DTA B(0)                    ; keycode latch


MAINPROC    .PROC

            LDA #$00                    ; disable NMI
            STA NMIEN

            MWA VVBLKD OLDVBL
            MWA MYVBLPTR VVBLKD

            LDA #NMI_VBI                ; enable VBI NMI
            STA NMIEN

            RTS
            
            .ENDP

;--------------------------------------------------------------------
;--------------------------------------------------------------------

MYVBL       .PROC

            PHR

            LDA     PADDL2              ; read paddle inputs
            LDX     PADDL3              ; 
            
            CMP     #128
            BCS     RELEASE             ; no input
            CPX     #128
            BCS     RELEASE             ; no input

            LDY     PRESSED
            BNE     EXIT                ; wait for release

NIBBLE1:            
            LSR                         ; build low nibble
            LSR
            LSR
            STA     KEYCODE

NIBBLE2:
            TXA                         ; build high nibble
            ASL
            AND     #$F0
            ORA     KEYCODE             ; combine nibbles

            LDX     #1
            STX     PRESSED
            LDX     #0
            STX     ATRACT

            CMP     #BRK_KEYCODE      
            BNE     KEY
BREAK:
            STX     BRKKEY              ; emulate break
            JMP     EXIT
KEY:
            STA     CH                  ; inject keypress
            JMP     EXIT
RELEASE:
            LDA     #0
            STA     PRESSED
EXIT:            
            PLR
            JMP     (OLDVBL)
            
            .ENDP

;--------------------------------------------------------------------

            BLK UPDATE ADDRESS
            BLK UPDATE SYMBOL

            END