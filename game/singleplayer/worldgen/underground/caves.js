(function () {
  function defaultSampleCaveShape({ wx, y, wz, perlin, CAVE_SCALE }) {
    const warp = perlin.noise3D(wx * CAVE_SCALE * 0.25 - 170, y * CAVE_SCALE * 0.4 + 70, wz * CAVE_SCALE * 0.25 + 90);
    const wxWarp = wx + warp * 22;
    const wzWarp = wz - warp * 22;

    // "Cheese" caves for large pockets.
    const cheese = perlin.noise3D(wxWarp * CAVE_SCALE * 1.02, y * CAVE_SCALE * 1.45, wzWarp * CAVE_SCALE * 1.02);
    const cheeseDetail = perlin.noise3D(wxWarp * CAVE_SCALE * 2.3 + 100, y * CAVE_SCALE * 1.08, wzWarp * CAVE_SCALE * 2.3 + 100);

    // "Spaghetti" tunnels for winding paths.
    const spaghettiA = Math.abs(perlin.noise3D(wxWarp * CAVE_SCALE * 0.78 + 330, y * CAVE_SCALE * 0.52 - 120, wzWarp * CAVE_SCALE * 0.78 - 270));
    const spaghettiB = Math.abs(perlin.noise3D(wxWarp * CAVE_SCALE * 1.24 - 510, y * CAVE_SCALE * 0.65 + 240, wzWarp * CAVE_SCALE * 1.24 + 190));
    const spaghetti = 1 - Math.min(1, (spaghettiA * 0.65 + spaghettiB * 0.35) * 1.2);

    return (cheese * 0.52) + (cheeseDetail * 0.18) + (spaghetti * 0.3);
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
      const nearSurfaceGuard = depth < 0.2 ? 0.12 : (depth < 0.35 ? 0.06 : 0);
      const deepOpenBias = Math.min(0.16, Math.max(0, (depth - 0.45) * 0.35));
      const dynamicThreshold = CAVE_THRESHOLD + nearSurfaceGuard - Math.min(0.08, depth * 0.1) - deepOpenBias;

      // Large room candidates.
      const chamberNoise = perlin.noise3D(wx * CAVE_SCALE * 0.32 - 750, y * CAVE_SCALE * 0.43 + 320, wz * CAVE_SCALE * 0.32 + 510);
      const chamberCarve = depth > 0.35 && chamberNoise > (0.6 - depth * 0.2);

      // Narrow winding tunnels.
      const tunnelA = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.72 + 190, y * CAVE_SCALE * 0.36 - 40, wz * CAVE_SCALE * 0.72 + 640));
      const tunnelB = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 1.05 - 290, y * CAVE_SCALE * 0.59 + 90, wz * CAVE_SCALE * 1.05 - 370));
      const tunnelCarve = depth > 0.42 && (tunnelA < 0.06 || tunnelB < 0.045);

      // Keep some pillars in bigger rooms so caves are less uniformly hollow.
      const pillarNoise = Math.abs(perlin.noise3D(wx * CAVE_SCALE * 0.28 + 35, y * CAVE_SCALE * 0.95, wz * CAVE_SCALE * 0.28 - 70));
      const keepPillar = chamberCarve && pillarNoise > 0.88 && y > CAVE_MIN_Y + 3;

      if ((caveShape > dynamicThreshold || chamberCarve || tunnelCarve) && !keepPillar) {
        return 0;
      }
      return blockId;
    }
  };

  window.UndergroundCavesWorldgen = UndergroundCavesWorldgen;
})();
