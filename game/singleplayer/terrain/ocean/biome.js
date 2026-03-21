(function () {
  const OceanTerrain = {
    meta: {
      terrainKey: 'ocean',
      name: 'Ocean',
      aliases: ['ocean'],
      villageKey: 'ocean',
      treeEligible: false,
      treeSpawnChance: 0,
      treeDensityKey: 'Plains',
      isOcean: true,
      variants: [
        { name: 'Coast Ocean', aliases: ['coast ocean', 'coast_ocean'] },
        { name: 'Warm Ocean', aliases: ['warm ocean', 'warm_ocean'] },
        { name: 'Lukewarm Ocean', aliases: ['lukewarm ocean', 'lukewarm_ocean'] },
        { name: 'Cold Ocean', aliases: ['cold ocean', 'cold_ocean'] },
        { name: 'Frozen Ocean', aliases: ['frozen ocean', 'frozen_ocean'] },
      ],
    },
    isBiome({ continentalNoise, climateNoise }) {
      return continentalNoise < 0.36 || climateNoise < -0.58;
    },
    getHeight({ SEA_LEVEL, deepNoise, terrainNoise }) {
      const depth = 7 + deepNoise * 11 + terrainNoise * 4;
      return SEA_LEVEL - depth;
    },
  };
  window.OceanTerrain = OceanTerrain;
})();
