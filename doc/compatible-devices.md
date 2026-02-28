# Compatibility List

Only devices that fully support the BLE HID over GATT Profile (HOGP) are supported.

Devices that rely on Bluetooth Classic are not supported, because the nRF52840 MCU supports only Bluetooth Low Energy (BLE) and does not implement Bluetooth Classic.

For this reason many devices (especially gamepads) are unfortunately are not usable with Blue2Joy.

> Although I only discovered this limitation after the project was already underway, working on it has been both enjoyable and a great learning experience. I plan to keep developing the project by extending the existing web configuration app to act as a bridge, allowing virtually any gamepad connected to a PC to be used. I decided to publish the project in its current form because it already demonstrates useful ideas and has clear potential to grow into a more flexible and capable solution.

The following table lists the devices that were tested.

| Device | Model | Firmware   | Compatible | Notes |
|--------|-------| -----------|------------|-------|
| XBOX Wireless Controller | 1914  | 5.23.6      | Yes | |
| C-Tech Mouse             | WLM12-GR  | SVN1754_V93 | Yes |  |
| 8BitDo Zero 2            |       |             | No  |  |
| Sony Dual Sense          | CFI-2C11W |         | No |
| HP 425 Bluetooth Mouse   | TPA-P006M |         | Yes |
