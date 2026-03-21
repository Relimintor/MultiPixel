(function () {
  const SnowyPlainsTerrain = {
    meta: {
      terrainKey: 'snowy_plains',
      name: 'Snowy Plains',
      aliases: ['snowy', 'snow', 'snowy plains', 'snowy_plains'],
      villageKey: 'snowy_plains',
      treeEligible: false,
      treeSpawnChance: 0,
      treeDensityKey: 'Plains',
      climateTarget: { temp: -0.52, humidity: 0.04, continentalness: 0.12, erosion: 0.18, weirdness: -0.02 },
    },
    isBiome({ tempNoise, humidityNoise, mountainNoise }) {
      return tempNoise < -0.34 && humidityNoise > -0.12 && mountainNoise < 0.58;
    },
    getHeight({ BASE_LAND_Y, continentalMask, terrainNoise, erosionNoise }) {
      return BASE_LAND_Y + continentalMask * 6.2 + terrainNoise * 1.9 - erosionNoise * 1.1;
    },
    structures: {
      igloo: {
        spawnChancePerChunk: 0.11,
        validSurfaceBlockId: 15
      }
    },
    shouldSpawnIgloo({ cx, cz, hashRand2D, spawnChance }) {
      const chance = typeof spawnChance === 'number' ? spawnChance : 0.11;
      const roll = hashRand2D(cx * 19 + 7, cz * 19 - 13, 905);
      return roll < chance;
    }
  };

  window.SnowyPlainsTerrain = SnowyPlainsTerrain;
})();
