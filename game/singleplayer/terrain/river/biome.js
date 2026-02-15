(function () {
  const RiverTerrain = {
    getMask({ perlin, wx, wz }) {
      const scale = 0.001;
      const bendScale = 0.002;
      const bend = perlin.noise2D(wx * bendScale + 500, wz * bendScale + 500) * 0.5;
      const path = perlin.noise2D(wx * scale + bend, wz * scale);
      const thickness = 0.08;
      return 1.0 - Math.min(1.0, Math.abs(path) / thickness);
    },
    applyHeight({ height, riverInfluence, SEA_LEVEL }) {
      if (riverInfluence <= 0.1) return height;
      const riverDepth = riverInfluence * 15;
      return Math.max(height - riverDepth, SEA_LEVEL - 5);
    },
  };
  window.RiverTerrain = RiverTerrain;
})();
