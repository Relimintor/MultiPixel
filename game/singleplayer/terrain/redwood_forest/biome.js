(function () {
  const RedwoodForestTerrain = {
    meta: {
      terrainKey: 'redwood_forest',
      name: 'Redwood Forest',
      aliases: ['redwood', 'redwood forest', 'redwood_forest'],
      villageKey: 'oak_forest',
      treeEligible: true,
      treeSpawnChance: 0.04,
      treeDensityKey: 'Redwood Forest',
      climateTarget: { temp: 0.28, humidity: 0.52, continentalness: 0.2, erosion: 0.04, weirdness: -0.08 },
    },
    isBiome({ tempNoise, humidityNoise, mountainNoise }) {
      return tempNoise > 0.1 && tempNoise < 0.5 && humidityNoise > 0.35 && mountainNoise < 0.66;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + 4 + continentalMask * 10.5 + terrainNoise * 3.4 - erosionNoise * 1.1;
    },
  };

  window.RedwoodForestTerrain = RedwoodForestTerrain;
})();
