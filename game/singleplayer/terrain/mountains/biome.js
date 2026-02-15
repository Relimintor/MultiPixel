(function () {
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Piecewise curve approximating Minecraft-like spline mapping.
  function splineMountainFactor(continentalness, erosion, ridges) {
    const inland = Math.max(0, Math.min(1, (continentalness + 0.2) / 0.9));
    const erosionInv = Math.max(0, Math.min(1, 1 - (erosion + 1) * 0.5));
    const ridgeShape = Math.max(0, Math.min(1, ridges));

    const continentalLift = lerp(8, 34, Math.pow(inland, 1.15));
    const erosionSharpness = lerp(0.35, 1.35, Math.pow(erosionInv, 1.2));
    const ridgeLift = lerp(2, 54, Math.pow(ridgeShape, 1.85));
    return continentalLift * erosionSharpness + ridgeLift;
  }

  const MountainsTerrain = {
    isBiome({ mountainNoise, continentalNoise, climateNoise }) {
      return mountainNoise > 0.62 && continentalNoise > 0.43 && climateNoise > -0.45;
    },
    getHeight({ BASE_LAND_Y, continentalness, erosion, ridges, terrainNoise, cliffNoise, peakNoise, peaksValleys, jaggedNoise }) {
      const uplift = splineMountainFactor(continentalness, erosion, ridges);
      const ridgeWalls = Math.max(0, Math.abs(peaksValleys) - 0.42) * 20;
      const cliffFaces = Math.max(0, cliffNoise - 0.55) * 26;
      const alpinePeaks = Math.pow(Math.max(0, peakNoise - 0.48), 1.85) * 74;
      const jaggedSpikes = Math.pow(Math.max(0, jaggedNoise - 0.52), 2.1) * 52;
      const roughness = terrainNoise * 5.8;
      return BASE_LAND_Y + uplift + ridgeWalls + cliffFaces + alpinePeaks + jaggedSpikes + roughness;
    },
  };

  window.MountainsTerrain = MountainsTerrain;
})();
