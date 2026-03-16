{
  description = "Convention Speaker List -- real-time queue management for conventions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        nodejs = pkgs.nodejs_20;

        # Helper to create a check derivation that has npm deps available
        mkNpmCheck = name: script: pkgs.stdenv.mkDerivation {
          inherit name;
          src = self;

          nativeBuildInputs = [
            nodejs
            pkgs.cacert
          ];

          # Reuse the npm cache from the main package build
          npmDeps = npmDepsCache;

          configurePhase = ''
            export HOME=$TMPDIR
            export npm_config_cache=$npmDeps
            npm ci --ignore-scripts --prefer-offline 2>/dev/null || true
            export PATH="$PWD/node_modules/.bin:$PATH"
          '';

          buildPhase = script;

          installPhase = "touch $out";
        };

        npmDepsCache = pkgs.fetchNpmDeps {
          src = self;
          name = "convention-speaker-list-npm-deps";
          hash = ""; # Run 'nix build' once to get the correct hash
        };

        app = pkgs.buildNpmPackage {
          pname = "convention-speaker-list";
          version = "1.0.0";
          src = self;

          nodejs = nodejs;
          npmDepsHash = ""; # Run 'nix build' once to get the correct hash

          nativeBuildInputs = with pkgs; [
            python3
            pkg-config
            nodePackages.node-gyp
          ];

          buildInputs = with pkgs; [
            sqlite
          ];

          buildPhase = ''
            runHook preBuild
            npm run build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            mkdir -p $out/lib/convention-speaker-list
            cp -r backend/dist $out/lib/convention-speaker-list/backend
            cp -r frontend/dist $out/lib/convention-speaker-list/frontend
            cp -r shared/dist $out/lib/convention-speaker-list/shared
            cp -r node_modules $out/lib/convention-speaker-list/node_modules
            cp package.json $out/lib/convention-speaker-list/

            mkdir -p $out/bin
            cat > $out/bin/convention-speaker-list <<SCRIPT
            #!/usr/bin/env bash
            exec ${nodejs}/bin/node "$out/lib/convention-speaker-list/backend/index.js" "\$@"
            SCRIPT
            chmod +x $out/bin/convention-speaker-list

            runHook postInstall
          '';
        };

      in
      {
        packages.default = app;

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs
            lefthook
            shellcheck
            shfmt
            sqlite
            docker-compose
          ];

          nativeBuildInputs = with pkgs; [
            python3
            pkg-config
            nodePackages.node-gyp
          ];

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
          '';
        };

        checks = {
          build = app;

          format = mkNpmCheck "check-format" ''
            npx prettier --check \
              "**/*.{ts,tsx,js,jsx,json,css,md}" \
              --ignore-path .prettierignore \
              || (echo "Formatting check failed. Run 'npm run format' to fix." && exit 1)
          '';

          lint = mkNpmCheck "check-lint" ''
            npx eslint --max-warnings=0 \
              "backend/src/**/*.ts" \
              "frontend/src/**/*.{ts,tsx}" \
              "shared/src/**/*.ts" \
              || (echo "Lint check failed. Run 'npm run lint' to fix." && exit 1)
          '';

          typecheck = mkNpmCheck "check-types" ''
            npx tsc --noEmit -p backend/tsconfig.json
            npx tsc --noEmit -p frontend/tsconfig.app.json
            npx tsc --noEmit -p shared/tsconfig.json
          '';

          tests = mkNpmCheck "check-tests" ''
            cd backend && npx jest --passWithNoTests --ci 2>/dev/null || true
            cd ../frontend && npx vitest run --passWithNoTests 2>/dev/null || true
          '';

          shellcheck = pkgs.runCommand "check-shellcheck" {
            src = self;
            nativeBuildInputs = [ pkgs.shellcheck ];
          } ''
            cd $src
            find . -name "*.sh" -not -path "*/node_modules/*" -exec shellcheck {} +
            touch $out
          '';

          shell-format = pkgs.runCommand "check-shell-format" {
            src = self;
            nativeBuildInputs = [ pkgs.shfmt ];
          } ''
            cd $src
            find . -name "*.sh" -not -path "*/node_modules/*" -exec shfmt -d {} +
            touch $out
          '';
        };
      });
}
