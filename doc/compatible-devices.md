# Compatibility List

Only devices that fully support the BLE HID over GATT Profile (HOGP) are supported.

Devices that rely on Bluetooth Classic are not supported, because the nRF52840 MCU supports only Bluetooth Low Energy (BLE) and does not implement Bluetooth Classic.

For this reason many devices (especially gamepads) are unfortunately are not usable with Blue2Joy.

The following table lists the devices that were tested.

| Device | Model | Firmware   | Compatible | Notes |
|--------|-------| -----------|------------|-------|
| XBOX Wireless Controller | 1914  | 5.23.6      | Yes | |
| C-Tech Mouse             | WLM12-GR  | SVN1754_V93 | Yes |  |
| 8BitDo Zero 2            |       |             | No  |  |
| Sony Dual Sense          | CFI-2C11W |         | No |
| HP 425 Bluetooth Mouse   | TPA-P006M |         | Yes |

