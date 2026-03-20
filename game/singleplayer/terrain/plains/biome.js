(function () {
  const PlainsTerrain = {
    biomeInfo: {
      treeSpawnRate: 0.06,
      structureSpawnRates: { village: 0.18 },
      oreSpawnRates: { coal: 1, copper: 1, iron: 1, gold: 0.95, diamond: 1, emerald: 0.85 },
      maxHeight: 78,
    },
    isBiome({ humidityNoise, mountainNoise }) {
      return humidityNoise > -0.2 && mountainNoise < 0.55;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + continentalMask * 7 + terrainNoise * 2.3 - erosionNoise * 1.8;
    },
  };
  window.PlainsTerrain = PlainsTerrain;
})();
