# Changelog

### Unreleased
### Added
- Added XEP80 character and cursor blinking (text mode only for now).
- Added browser-to-Atari keycode input over paddle pins (requires btjkbd.sys on the Atari side).
- Added support for Bluetooth devices using resolvable private addresses
### Fixed
- Fixed XEP80 character deletion within logical lines, with correct cross-row shifting and cleanup of empty wrapped rows.
- Improved reliability of USB connection (fixed session/event handling bugs).
- Fixed LED signalling in manual mode.

### v0.5.1
### Fixed
- Added WinUSB auto-binding for WebUSB via MS OS 2.0 BOS; no Zadig/INF needed.

## v0.5.0
### Fixed
- Web USB stability improvements

## v0.4.0
### Added
- Web USB support (alternative to Web Bluetooth)
- Zephyr shell support and improved logging

## v0.3.0
### Added
- XEP80 emulator (not yet complete)
- Demo mode for testing and demonstration purposes
- Light and dark themes

### Fixed
- Improved POT emulation accuracy and reduced jitter
- Numerous stability improvements
