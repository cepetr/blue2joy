{ pkgs ? import <nixpkgs> {} }:

let
  mads = pkgs.stdenv.mkDerivation rec {
    pname = "mads";
    version = "2.1.6";

    src = pkgs.fetchFromGitHub {
      owner = "tebe6502";
      repo = "Mad-Assembler";
      rev = "61d5d65f42eb55d984a06bf38b03d9fc17ba1154";
      hash = "sha256-bVjFLKqHaPqNKa4UkhsmNVKVm6PN7GxloXprwcsTD6w=";
    };

    nativeBuildInputs = [ pkgs.fpc ];

    dontConfigure = true;

    buildPhase = ''
      runHook preBuild
      fpc -Mdelphi -vh -O3 mads.pas
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      install -Dm755 mads $out/bin/mads
      runHook postInstall
    '';

    meta = with pkgs.lib; {
      description = "Mad-Assembler built from upstream GitHub source";
      homepage = "https://github.com/tebe6502/Mad-Assembler";
      platforms = platforms.unix;
    };
  };
in
pkgs.mkShell {
  packages = [
    pkgs.nodejs_20
    pkgs.fpc
    mads
  ];
}
