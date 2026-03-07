# Worldgen WASM backend (optional)

The browser runtime now supports an optional WebAssembly module for hot-path worldgen calls.

## Expected exports

If present, the module may export any of these functions:

- `cave_shape(wx: f64, y: f64, wz: f64, cave_scale: f64) -> f64`
- `biome_jitter(wx: f64, wz: f64) -> f64`
- `terrain_height_delta(wx: f64, wz: f64) -> f64`

Only `cave_shape` is currently wired into gameplay generation. The others are reserved hooks.

## Runtime behavior

- If `WORLD_GEN_SETTINGS.wasm.enabled` is true, the game attempts to load `WORLD_GEN_SETTINGS.wasm.modulePath`.
- On load failure or missing exports, runtime automatically falls back to JavaScript generation.
- The game remains fully playable without any `.wasm` file.
