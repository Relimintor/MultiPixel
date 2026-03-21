(function () {
  const JungleForestTerrain = {
    meta: {
      terrainKey: 'jungle_forest',
      name: 'Jungle Forest',
      aliases: ['jungle', 'jungle forest', 'jungle_forest'],
      villageKey: 'jungle_forest',
      treeEligible: true,
      treeSpawnChance: 0.3,
      treeDensityKey: 'Jungle Forest',
      climateTarget: { temp: 0.95, humidity: 0.9, continentalness: 0.2, erosion: 0.03, weirdness: 0.0 },
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
