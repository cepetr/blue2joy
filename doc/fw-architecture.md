# Firmware architecture

<img src="images/arch.drawio.svg">

#### bthid
- Discovers BLE HID devices
- Establishes connections with BLE HID devices
- Processes HID device capabilities and periodic reports

#### devmgr
- Manages connections with HID devices
- Loads and stores persistent device configurations
- Signals connection and disconnection events

#### mapper
- Maps HID device controls to joystick port inputs
- Loads and stores persistent mapping configurations

#### btsvc
- Handles BLE connection for Blue2Joy configuration

#### io/joystick & io/paddle
- Emulates digital joystick I/O and analog potentiometers

#### io/spislave
- Provides SPI connection with Atari 8-bit computers