(function () {
  const JungleForestTerrain = {
    biomeInfo: {
      treeSpawnRate: 0.24,
      structureSpawnRates: { village: 0.14 },
      oreSpawnRates: { coal: 1, copper: 1.1, iron: 1, gold: 0.9, diamond: 1, emerald: 0.9 },
      maxHeight: 104,
    },
    isBiome({ tempNoise, humidityNoise, mountainNoise }) {
      return tempNoise > 0.45 && humidityNoise > 0.35 && mountainNoise < 0.78;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + 2 + continentalMask * 9.5 + terrainNoise * 6.6 - erosionNoise * 0.9;
    },
  };

  window.JungleForestTerrain = JungleForestTerrain;
})();
