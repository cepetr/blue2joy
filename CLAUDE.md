# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Blue2Joy** is a Bluetooth-to-joystick adapter for Atari 8-bit computers, built on a Seeed XIAO BLE (Nordic nRF52840). It bridges modern BLE HID devices (gamepads, mice) to the Atari 9-pin joystick port, emulating digital joystick inputs, analog paddle potentiometers, and quadrature mouse encoding.

The repository has four independent sub-projects:

| Directory | Language | Description |
|-----------|----------|-------------|
| `firmware/` | C (Zephyr RTOS) | nRF52840 firmware |
| `webconfig/` | TypeScript (Lit + MobX) | Browser-based configurator via Web Bluetooth |
| `atari/` | C (llvm-mos) | Atari 8-bit companion app (unfinished stub) |
| `hardware/` | KiCad | Schematics and PCB layout |

## Build Commands

### Firmware (nRF Connect SDK v3.0.1 / Zephyr)

Prerequisites: `nrfutil` with toolchain-manager and NCS v3.0.1 installed.

```sh
# One-time setup: download the NCS toolchain
nrfutil toolchain-manager install --ncs-version v3.0.1

# Enter the toolchain shell (run from repo root or firmware/)
nrfutil toolchain-manager launch --shell
source ~/ncs/v3.0.1/zephyr/zephyr-env.sh

# Build (run from firmware/)
west build -b xiao_ble/nrf52840 --no-sysbuild
# Output: firmware/build/zephyr/zephyr.uf2
```

Flash by double-pressing RESET (board appears as XIAOBOOT mass-storage), then copy `zephyr.uf2` to the drive.

### Web Configurator

```sh
cd webconfig
npm install
npm run dev       # dev server on http://localhost:8080
npm run build     # production build → dist/
npm run lint      # ESLint
```

### Atari Software

Prerequisites: Nix package manager.

```sh
cd atari
nix-shell                      # enters environment with mos-atari8-dos-clang
cmake -B build -G Ninja
cd build && ninja
# Output: build/blue2joy.xex
```

## Firmware Architecture

Modules communicate through a lightweight **event bus** (`src/event/`): `event_bus_subscribe()` registers a callback; modules post events with a subject (`EV_SUBJECT_*`) and action (`CREATE/UPDATE/DELETE`). This decouples module initialization order and avoids direct cross-module calls.

Key module layout (`firmware/src/`):

```
bthid/      BLE HID Central — scanning, pairing, GATT discovery, report parsing
btsvc/      BLE Peripheral — exposes btjp GATT service for the web configurator
btjp/       Blue2Joy Protocol — request/response/event framing used by btsvc and WebUSB
devmgr/     Device manager — persistent bond/config storage, auto-reconnect logic
mapper/     HID report → joystick port mapping; holds up to 4 named profiles
io/         Hardware drivers: digital pins, paddle pot emulation, SPI slave, RGB LED
xep80/      XEP80 terminal emulation (work in progress)
usbd/       USB device stack + WebUSB descriptor for browser configuration
event/      Internal pub/sub bus (event_bus) and per-connection event queue (event_queue)
```

**btjp protocol** — binary framing with a 4-byte header (flags, msgId, seq, payloadSize). `flags & 0x03` encodes the message type: 0=request, 1=event, 2=response, 3=error. The same protocol is used over both the BLE GATT characteristic and the WebUSB interface.

**Paddle emulation** uses nrfx TIMER2/TIMER3 + PPI hardware to generate the potentiometer discharge timing without CPU involvement. See `io/io_pot.c`.

**Device tree overlay** for the XIAO BLE board is at `firmware/boards/xiao_ble.overlay`. It defines joystick output/input GPIOs, the SPI0 (WS2812 LED) and SPI1 slave (Atari SPI) instances, and the two user buttons with long-press detection.

Settings are stored in flash using Zephyr's `settings` subsystem (NVS backend). Each module that persists data registers its own subtree key.

## Web Configurator Architecture

- **Lit** web components (`src/components/`) render the UI reactively via **MobX** observables.
- **`BtjModel`** (`src/models/btj-model.ts`) is the single MobX store and singleton `btj`. It owns the `BtjConnection` and all device/profile state.
- **`BtjConnection`** (`src/services/btj-connection.ts`) wraps the Web Bluetooth GATT transport, serializes commands as btjp requests, and dispatches incoming events/responses.
- **`btj-messages.ts`** defines all typed command/event classes in the `Btj` namespace, mirroring the firmware's btjp message definitions.
- The XEP80 terminal view uses a Web Worker (`src/workers/xep80-worker.ts`) and a direct canvas render path to avoid blocking the main thread.

## Coding Conventions

- **C (firmware & atari)**: clang-format with project-level `.clang-format` files in each sub-directory. Run `clang-format -i <file>` before committing.
- **TypeScript (webconfig)**: ESLint with `@typescript-eslint`. No Prettier; formatting is lint-driven.
- **Firmware error handling**: functions return `int` (0 = success, negative errno). Log errors with `LOG_ERR(...)` before returning.
- **No unit tests** exist in any sub-project; validation is done by flashing and testing on hardware.
