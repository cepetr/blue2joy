# Note on Power & Ground Safety
The Blue2Joy adapter includes reverse-current protection, allowing 5V rail can be powered at the same time from both the Atari joystick port and USB without either source back-feeding the other.

Ground, however, still matters. The setup is normally safe as long as all device shares the same ground reference - for example, when everything is plugged into the same power strip.

**Beware of ground loops!**

If the Atari, PC, or other gear are connected to different outlets, their return paths can form a loop that leads to data noise, circulating currents between grounds, and, in rare cases, hardware damage.

* Whenever you can, plug all equipment into the same strip.
* A laptop running on battery has a “floating” ground and greatly reduces the risk of loops.

Typical workflows:
* USB debugging - keeping both cables attached is fine; just follow the grounding advice above.
* Firmware flashing - the Atari doesn’t need to stay connected while flashing, so disconnect it to avoid any potential conflicts.