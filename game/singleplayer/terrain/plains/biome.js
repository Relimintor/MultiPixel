(function () {
  const PlainsTerrain = {
    meta: {
      terrainKey: 'plains',
      name: 'Plains',
      aliases: ['plains'],
      villageKey: 'plains',
      treeEligible: true,
      treeSpawnChance: 0.06,
      treeDensityKey: 'Plains',
      climateTarget: { temp: -0.02, humidity: 0.02, continentalness: 0.1, erosion: 0.2, weirdness: 0.02 },
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
