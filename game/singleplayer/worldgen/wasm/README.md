# Worldgen WASM backend (optional)

The browser runtime now supports an optional WebAssembly module for hot-path worldgen calls.

## Expected exports

If present, the module may export any of these functions:

- `cave_shape(wx: f64, y: f64, wz: f64, cave_scale: f64) -> f64`
- `biome_jitter(wx: f64, wz: f64) -> f64`
- `terrain_height_delta(wx: f64, wz: f64) -> f64`

Only `cave_shape` is currently wired into gameplay generation. The others are reserved hooks.

## Runtime behavior

- If `WORLD_GEN_SETTINGS.wasm.enabled` is true, the game attempts to load `WORLD_GEN_SETTINGS.wasm.modulePath` (default: `worldgen/wasm/worldgen.wasm.base64`).
- On load failure or missing exports, runtime automatically falls back to JavaScript generation.
- The game remains fully playable without any `.wasm` file.

## Included module

This folder now includes a committed module at:

- `game/singleplayer/worldgen/wasm/worldgen.wasm.base64`

If your environment does not allow committed binaries, runtime falls back to this text file when `.wasm` is unavailable.

### Rebuild command

If you need to rebuild the module from source:

```bash
clang --target=wasm32 -O3 -nostdlib \
  -Wl,--no-entry -Wl,--strip-all \
  -Wl,--export=cave_shape -Wl,--export=biome_jitter -Wl,--export=terrain_height_delta \
  -o game/singleplayer/worldgen/wasm/worldgen.wasm \
  game/singleplayer/worldgen/wasm/worldgen_kernel.c
```


### Binary-free workflow

- Runtime loads whatever `modulePath` points to.
- If `modulePath` ends with `.base64`, it decodes text and instantiates WASM bytes directly.
- If `modulePath` points to `.wasm`, runtime will also try `modulePath + ".base64"` as fallback if `.wasm` is missing.
- This allows binary-free repositories while keeping the WASM acceleration path enabled and avoids unnecessary `.wasm` 404s when using a base64 default path.
