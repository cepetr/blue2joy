# Note on Power & Ground Safety
The blue2joy adapter contains reverse-current protection, so its 5 V rail can be powered at the same time from both the Atari joystick port and USB without either source back-driving the other.

Ground still matters. The setup is normally safe as long as every device shares the same ground reference - for example, when everything is plugged into the same power strip.

🛑 Beware of ground loops! If the Atari, PC, oscilloscope, or other gear are connected to different outlets, their return paths can form a loop that leads to
* hum or data noise,
* circulating currents between grounds,
* and, in rare cases, hardware damage.

✅ Good practice
* Whenever you can, plug all equipment into the same strip.
* Remember that the ground lead on most benchtop oscilloscopes is hard-wired to mains earth-double-check potentials before you clip it on.
* A laptop running on battery has a “floating” ground and greatly reduces the risk of loops.

🛠️ Typical workflows
* USB debugging - keeping both cables attached is fine; just follow the grounding advice above.
* Firmware flashing - the Atari doesn’t need to stay connected while flashing, so disconnect it to avoid any potential conflicts.