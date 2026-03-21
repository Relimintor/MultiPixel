(function () {
  const OakForestTerrain = {
    meta: {
      terrainKey: 'oak_forest',
      name: 'Forest',
      aliases: ['forest', 'oak forest', 'oak_forest'],
      villageKey: 'oak_forest',
      treeEligible: true,
      treeSpawnChance: 0.19,
      treeDensityKey: 'Forest',
      climateTarget: { temp: 0.0, humidity: 0.16, continentalness: 0.14, erosion: 0.06, weirdness: -0.04 },
    },
    isBiome({ detailNoise, humidityNoise, distFromCenter, ISLAND_RADIUS }) {
      if (distFromCenter < ISLAND_RADIUS) return true;
      return detailNoise > -0.08 && humidityNoise > 0.05;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + continentalMask * 10 + terrainNoise * 5.8 - erosionNoise * 1.2;
    },
  };
  window.OakForestTerrain = OakForestTerrain;
})();
