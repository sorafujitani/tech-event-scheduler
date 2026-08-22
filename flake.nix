{
  description = "tech-event-scheduler dev shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          name = "tes";
          packages = with pkgs; [
            bun
            nodejs_22
            go-task
            sqlite
            jq
            git
          ];

          shellHook = ''
            echo "tech-event-scheduler devShell ready"
            echo "  bun:       $(bun --version)"
            echo "  node:      $(node --version)"
            echo "  task:      $(task --version)"
          '';
        };
      });
}
