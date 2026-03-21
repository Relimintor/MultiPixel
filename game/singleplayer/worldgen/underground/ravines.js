(function () {
  const UndergroundRavinesWorldgen = {
    getRavineMask({ wx, wz, worldGenerator, perlin }) {
      if (worldGenerator) return worldGenerator.sampleRavineMask(wx, wz);
      const warp = perlin.noise2D(wx * 0.001 + 250, wz * 0.001 + 250) * 30;
      const line = Math.abs(perlin.noise2D(wx * 0.0018 + warp, wz * 0.0018));
      return 1.0 - Math.min(1.0, line / 0.043);
    },

    createRavineColumnProfile({ wx, wz, surfaceHeight, getRavineMask, RAVINE_SURFACE_SAFETY_DEPTH, RAVINE_ACTIVATION_THRESHOLD, CHUNK_HEIGHT }) {
      const ravineMask = getRavineMask(wx, wz);
      const ravineTopCap = Math.max(3, surfaceHeight - RAVINE_SURFACE_SAFETY_DEPTH);
      const canCarveRavine = ravineMask > RAVINE_ACTIVATION_THRESHOLD && ravineTopCap > 3;
      const ravineStrength = canCarveRavine
        ? ((ravineMask - RAVINE_ACTIVATION_THRESHOLD) / (1 - RAVINE_ACTIVATION_THRESHOLD))
        : 0;

      return {
        ravineMask,
        canCarveRavine,
        ravineStrength,
        ravineTop: canCarveRavine ? Math.min(ravineTopCap, CHUNK_HEIGHT - 1) : 0,
        ravineMaxDepth: canCarveRavine ? (12 + Math.floor(ravineStrength * 8)) : 0,
        ravineBottom: canCarveRavine ? Math.max(3, Math.min(ravineTopCap, CHUNK_HEIGHT - 1) - (12 + Math.floor(ravineStrength * 8))) : 0,
      };
    },

    applyRavineBlock({ blockId, y, ravineProfile, wx, wz, octaveNoise2D, SEA_LEVEL }) {
      if (!ravineProfile?.canCarveRavine) return blockId;
      const { ravineStrength, ravineTop, ravineBottom } = ravineProfile;
      if (y > ravineTop || y < ravineBottom) return blockId;

      const mid = (ravineTop + ravineBottom) / 2;
      const halfHeight = (ravineTop - ravineBottom) / 2;
      if (halfHeight <= 0) return blockId;
      const verticalFactor = 1 - Math.abs(y - mid) / halfHeight;
      const widthNoise = octaveNoise2D(wx, wz, 2, 0.5, 2.0, 0.04, 812, -245);
      const widthFactor = ravineStrength * verticalFactor + widthNoise * 0.06;
      if (widthFactor <= 0.42) return blockId;
      if (y < 6) return 33;
      if (y < SEA_LEVEL - 1) return 4;
      return 0;
    }
  };

  window.UndergroundRavinesWorldgen = UndergroundRavinesWorldgen;
})();
