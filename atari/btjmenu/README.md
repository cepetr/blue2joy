# Blue2Joy — Atari 8-bit software

An unfinished software for the Atari, intended for configuring and testing the Blue2Joy hardware.


## 🛠️ How to Build

> If you don’t feel like building from source, grab the pre-built binariy on the project’s [Releases](https://github.com/cepetr/blue2joy/releases) page.


### Prerequisites

The 8-bit software is written in C using [clang/llvm-mos](https://llvm-mos.org/wiki/Welcome). All required tools and SDK paths are declared in [`shell.nix`](atari/shell.nix).

Install the Nix package manager by following the instructions at [https://nixos.org/download](https://nixos.org/download).

### Build steps

1. **Enter the development shell**

   ```sh
   nix-shell
   ```

2. **Configure the build**

   ```sh
   cmake -B build -G Ninja
   ```

3. **Build the project**

   ```sh
   cd build
   ninja
   ```

   The resulting Atari binary will appear inside the build directory.
