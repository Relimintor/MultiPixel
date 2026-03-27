(function () {
  function defaultSampleCaveShape({ wx, y, wz, perlin, CAVE_SCALE, columnProfile }) {
    const warp = Number(columnProfile?.warp || 0);
    const wxWarp = wx + warp * 18;
    const wzWarp = wz - warp * 18;

    // Optimized blend: keep cave variety with fewer expensive 3D samples.
    const cheese = perlin.noise3D(wxWarp * CAVE_SCALE, y * CAVE_SCALE * 1.42, wzWarp * CAVE_SCALE);
    const cheeseDetail = perlin.noise3D(wxWarp * CAVE_SCALE * 2.15 + 100, y * CAVE_SCALE, wzWarp * CAVE_SCALE * 2.15 + 100);
    const spaghettiAbs = Math.abs(perlin.noise3D(wxWarp * CAVE_SCALE * 0.86 + 280, y * CAVE_SCALE * 0.56 - 120, wzWarp * CAVE_SCALE * 0.86 - 260));
    const spaghetti = 1 - Math.min(1, spaghettiAbs * 1.25);

    return (cheese * 0.62) + (cheeseDetail * 0.2) + (spaghetti * 0.18);
  }

  const UndergroundCavesWorldgen = {
    createColumnProfile({ wx, wz, perlin, CAVE_SCALE }) {
      const warp = perlin.noise2D(wx * CAVE_SCALE * 0.22 - 170, wz * CAVE_SCALE * 0.22 + 90);
      const chamberBias = perlin.noise2D(wx * CAVE_SCALE * 0.13 + 420, wz * CAVE_SCALE * 0.13 - 560);
      const tunnelBias = Math.abs(perlin.noise2D(wx * CAVE_SCALE * 0.33 - 250, wz * CAVE_SCALE * 0.33 + 110));
      return { warp, chamberBias, tunnelBias };
    },

    sampleCaveShape({ wx, y, wz, USE_WASM_CAVE_SAMPLING, wasmRuntime, CAVE_SCALE, perlin, caveColumnProfile }) {
      if (USE_WASM_CAVE_SAMPLING && wasmRuntime?.has && wasmRuntime.has('caveShape')) {
        const out = wasmRuntime.call('caveShape', wx, y, wz, CAVE_SCALE);
        if (typeof out === 'number' && Number.isFinite(out)) return out;
      }
      return defaultSampleCaveShape({ wx, y, wz, perlin, CAVE_SCALE, columnProfile: caveColumnProfile });
    },

    carveBlock({ blockId, wx, y, wz, surfaceHeight, perlin, CAVE_SCALE, CAVE_THRESHOLD, CAVE_MIN_Y, CAVE_MAX_Y_OFFSET, CAVE_SURFACE_SAFETY_DEPTH, sampleCaveShape, caveColumnProfile }) {
      if (!(y > CAVE_MIN_Y && y < surfaceHeight - CAVE_MAX_Y_OFFSET && (surfaceHeight - y) >= (CAVE_SURFACE_SAFETY_DEPTH + 2))) {
        return blockId;
      }
      if (blockId !== 3 && blockId !== 2 && blockId !== 7 && blockId !== 13 && blockId !== 28 && blockId !== 59) {
        return blockId;
      }

      const depth = Math.max(0, (surfaceHeight - y) / Math.max(1, surfaceHeight));
      const nearSurfaceGuard = depth < 0.2 ? 0.12 : (depth < 0.35 ? 0.06 : 0);
      const deepOpenBias = Math.min(0.16, Math.max(0, (depth - 0.45) * 0.35));
      const dynamicThreshold = CAVE_THRESHOLD + nearSurfaceGuard - Math.min(0.08, depth * 0.1) - deepOpenBias;
      const caveShape = sampleCaveShape(wx, y, wz, caveColumnProfile);
      if (caveShape > dynamicThreshold) return 0;

      // Only run expensive detail tests near threshold/deeper levels.
      if (depth <= 0.38 || Math.abs(caveShape - dynamicThreshold) > 0.16) return blockId;

      const chamberBias = Number(caveColumnProfile?.chamberBias || 0);
      const tunnelBias = Number(caveColumnProfile?.tunnelBias || 0);

      // Large room candidates.
      const chamberNoise = perlin.noise3D(wx * CAVE_SCALE * 0.34 - 750, y * CAVE_SCALE * 0.42 + 320, wz * CAVE_SCALE * 0.34 + 510);
      const chamberCarve = chamberBias > -0.2 && chamberNoise > (0.64 - depth * 0.2);

      // Narrow winding tunnels.
      const tunnelNoise = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.84 + 190, y * CAVE_SCALE * 0.44 - 40, wz * CAVE_SCALE * 0.84 + 640));
      const tunnelCarve = tunnelBias < 0.84 && tunnelNoise < 0.052;

      if (chamberCarve || tunnelCarve) return 0;
      return blockId;
    }
  };

  window.UndergroundCavesWorldgen = UndergroundCavesWorldgen;
})();
