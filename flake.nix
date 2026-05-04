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
            awscli2
          ];

          # Terraform は mise で管理する (BSL を nixpkgs に通さない、mise.toml で版固定)。
          # 既に mise 管理下にあるツール (terraform, etc.) を nix devShell からも見えるよう shims を PATH に追加。
          shellHook = ''
            if [ -d "$HOME/.local/share/mise/shims" ]; then
              export PATH="$HOME/.local/share/mise/shims:$PATH"
            fi
            echo "tech-event-scheduler devShell ready"
            echo "  bun:       $(bun --version)"
            echo "  node:      $(node --version)"
            echo "  task:      $(task --version)"
            if command -v terraform >/dev/null 2>&1; then
              echo "  terraform: $(terraform --version | head -1)"
            else
              echo "  terraform: NOT FOUND — run 'mise install' to fetch the version pinned in mise.toml"
            fi
          '';
        };
      });
}
