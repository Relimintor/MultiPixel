(function () {
  function defaultSampleCaveShape({ wx, y, wz, perlin, CAVE_SCALE }) {
    const n1 = perlin.noise3D(wx * CAVE_SCALE, y * CAVE_SCALE * 1.7, wz * CAVE_SCALE);
    const n2 = perlin.noise3D(wx * CAVE_SCALE * 2.2 + 100, y * CAVE_SCALE * 1.1, wz * CAVE_SCALE * 2.2 + 100);
    return n1 * 0.7 + n2 * 0.3;
  }

  const UndergroundCavesWorldgen = {
    sampleCaveShape({ wx, y, wz, USE_WASM_CAVE_SAMPLING, wasmRuntime, CAVE_SCALE, perlin }) {
      if (USE_WASM_CAVE_SAMPLING && wasmRuntime?.has && wasmRuntime.has('caveShape')) {
        const out = wasmRuntime.call('caveShape', wx, y, wz, CAVE_SCALE);
        if (typeof out === 'number' && Number.isFinite(out)) return out;
      }
      return defaultSampleCaveShape({ wx, y, wz, perlin, CAVE_SCALE });
    },

    carveBlock({ blockId, wx, y, wz, surfaceHeight, perlin, CAVE_SCALE, CAVE_THRESHOLD, CAVE_MIN_Y, CAVE_MAX_Y_OFFSET, CAVE_SURFACE_SAFETY_DEPTH, sampleCaveShape }) {
      if (!(y > CAVE_MIN_Y && y < surfaceHeight - CAVE_MAX_Y_OFFSET && (surfaceHeight - y) >= (CAVE_SURFACE_SAFETY_DEPTH + 2))) {
        return blockId;
      }
      if (blockId !== 3 && blockId !== 2 && blockId !== 7 && blockId !== 13 && blockId !== 28 && blockId !== 59) {
        return blockId;
      }

      const caveShape = sampleCaveShape(wx, y, wz);
      const depth = Math.max(0, (surfaceHeight - y) / Math.max(1, surfaceHeight));
      const nearSurfaceGuard = depth < 0.2 ? 0.1 : (depth < 0.35 ? 0.05 : 0);
      const dynamicThreshold = CAVE_THRESHOLD + nearSurfaceGuard - Math.min(0.1, depth * 0.14);
      const tunnelNoise = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.7, y * CAVE_SCALE * 0.45, wz * CAVE_SCALE * 0.7));

      if (caveShape > dynamicThreshold || (depth > 0.55 && tunnelNoise < 0.05)) {
        return 0;
      }
      return blockId;
    }
  };

  window.UndergroundCavesWorldgen = UndergroundCavesWorldgen;
})();
