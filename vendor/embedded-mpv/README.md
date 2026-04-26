# Embedded MPV Runtime Artifacts

This directory is the staging location for macOS embedded MPV runtime artifacts.

Generated architecture folders are expected at:

- `vendor/embedded-mpv/darwin-arm64/`
- `vendor/embedded-mpv/darwin-x64/`

Each generated folder must contain `include/mpv/client.h`, `lib/*.dylib`, and `runtime-manifest.json`. The binary runtime directories are ignored by git by default; generate or restore them in release packaging jobs before building the Electron backend.
