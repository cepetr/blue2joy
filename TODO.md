# TODO

Unsorted list of missing features and known bugs:

- Try to reduce jitter on pot inputs, either through better timing or
  calibration (manual or possibly automatic)

- Read and display the HID device name and type (gamepad, mouse, etc.)

- Enable switching between two or three predefined device profiles using
  Blue2Joy buttons (or the device’s own buttons), with the active
  profile indicated by the LED

- Optimize BLE throughput by batching multiple application messages into a
  single data packet, reducing delays caused by round-trip latency and
  excessive small packets