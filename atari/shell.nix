# shell.nix
{ pkgs ? import <nixpkgs> {} }:

let
  # Pre-built bundle from the v22.2.1 GitHub release
  llvmMosSdk = pkgs.fetchzip {
    url    = "https://github.com/llvm-mos/llvm-mos-sdk/releases/download/v22.2.1/llvm-mos-linux.tar.xz";
    sha256 = "MZ+jC82TAeUYDVNgNeiSOedLMlpYZ2y94ktfpbI9D1M=";
  };
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    cmake  ninja gnumake git   # typical build helpers
  ];

  # Make SDK tools & headers visible
  shellHook = ''
    export PATH="${llvmMosSdk}/bin:$PATH"
    export C_INCLUDE_PATH="${llvmMosSdk}/include:$C_INCLUDE_PATH"
    export LIBRARY_PATH="${llvmMosSdk}/lib:$LIBRARY_PATH"
    echo "==> LLVM-MOS SDK v22.2.1 ready"
  '';
}
