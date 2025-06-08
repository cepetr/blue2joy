# Blue2Joy — nRF52 Firmware

For more information about firmware, see [documentation](/doc/fw-architecture.md).

## 🗲 How to Flash

If you just want to flash your device and don’t feel like building from source, grab the pre-built binaries on the project’s [Releases](https://github.com/cepetr/blue2joy/releases) page.

- Double-press RESET button => board appears as XIAOBOOT mass-storage.
- Copy `blue2joy.uf2` to that drive.
- The XIAO reboots automatically into your new firmware.


## 🛠️ How to Build

### Prerequisites
- Git ≥ 2.30
- Python 3.8 – 3.12 (for west and Python-based scripts)
- ~10 GB free disk space

### Build steps

1. Install nrfutils

    ```shell
    pip install --upgrade nrfutil
    ```

    see https://docs.nordicsemi.com/bundle/nrfutil/page/guides/installing.html

2. Install the Toolchain Manager

    ```shell
    nrfutil install toolchain-manager
    ```

    This is a small helper that downloads and maintains pre-built Zephyr + GNU Arm toolchains.

3. Download nRF Connect SDK v3.0.1

    ```shell
    nrfutil toolchain-manager install --ncs-version v3.0.1
    ```

4. Start a shell that knows the toolchain

    Folder layout after installation (Linux/macOS default):

    ```
    ~/ncs/v3.0.1/
    ├── toolchain/
    └── zephyr/      <- Zephyr RTOS & modules
    ```

4. Launch shell

    ```shell
    nrfutil toolchain-manager launch --shell
    # then inside the launched shell:
    source ~/ncs/v3.0.1/zephyr/zephyr-env.sh
    ```

6. Build the firmware

    Navigate to your project root (where west.yml lives or the sample you cloned) and run:

    ```shell
    west build -b xiao_ble/nrf52840 --no-sysbuild
    ```


    When the build finishes, the UF2 image will be at `build/zephyr/zephyr.uf2`.



