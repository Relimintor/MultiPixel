(function () {
  const OceanTerrain = {
    biomeInfo: {
      treeSpawnRate: 0,
      structureSpawnRates: { village: 0.08 },
      oreSpawnRates: { coal: 0.9, copper: 0.9, iron: 0.95, gold: 1, diamond: 1, emerald: 0.6 },
      maxHeight: 62,
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
