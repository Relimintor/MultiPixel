(function () {
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function smoothstep(edge0, edge1, x) {
    let t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function mountainFactor(cont, erosion, ridges) {
    const inland = clamp((cont + 0.2) / 0.9, 0, 1);
    const erosionInv = clamp(1 - (erosion + 1) * 0.5, 0, 1);
    const ridgeShape = clamp(ridges, 0, 1);

    const continentalLift = lerp(15, 75, Math.pow(inland, 1.2));
    const erosionSharpness = lerp(0.35, 1.35, Math.pow(erosionInv, 1.2));
    const ridgeLift = lerp(2, 54, Math.pow(ridgeShape, 2));

    return continentalLift * erosionSharpness + ridgeLift;
  }

  const MountainsTerrain = {
    meta: {
      terrainKey: 'mountains',
      name: 'Mountains',
      aliases: ['mountains', 'mountain'],
      villageKey: '',
      treeEligible: false,
      treeSpawnChance: 0,
      treeDensityKey: 'Plains',
    },
    isBiome({ mountainNoise, continentalNoise, climateNoise }) {
      return mountainNoise > 0.55 && continentalNoise > 0.35 && climateNoise > -0.5;
    },

    getHeight({ BASE_LAND_Y, continentalness, erosion, ridges, terrainNoise, cliffNoise, peakNoise, peaksValleys, jaggedNoise }) {
      const uplift = mountainFactor(continentalness, erosion, ridges);
      const curvedUplift = Math.pow(uplift / 50, 1.35) * 150;

      let ridgeShape = Math.pow(1 - Math.abs(peaksValleys), 1.6) * 70;
      ridgeShape -= Math.pow(Math.max(0, -peaksValleys), 1.5) * 20;

      const peakFactor = Math.pow(Math.max(0, peakNoise - 0.50), 2.3) * 20;
      const cliffs = Math.max(0, cliffNoise - 0.65) * 18;
      const roughness = terrainNoise * 5;
      const erosionEffect = erosion * 5;

      // Smooth biome blending
      const biomeBlend = smoothstep(0.3, 0.55, continentalness); // transitions plains → hills → mountains

      const height = BASE_LAND_Y +
        (curvedUplift * (1 + peakFactor)) +
        ridgeShape +
        cliffs +
        roughness -
        erosionEffect +
        5;

      return lerp(BASE_LAND_Y + terrainNoise * 10, height, biomeBlend );
    }
  };

  window.MountainsTerrain = MountainsTerrain;
})();
