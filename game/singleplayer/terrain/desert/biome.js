(function () {
  const DesertTerrain = {
    biomeInfo: {
      treeSpawnRate: 0,
      structureSpawnRates: { village: 0.18, desertWell: 0.08 },
      oreSpawnRates: { coal: 0.85, copper: 1.2, iron: 0.9, gold: 1.2, diamond: 1, emerald: 0.7 },
      maxHeight: 88,
    },
    isBiome({ climateNoise, moistureNoise, continentalNoise }) {
      return climateNoise > -0.12 &&
             moistureNoise < 0.32 &&
             continentalNoise > 0.28;
    },

    getHeight({
      BASE_LAND_Y,
      continentalMask,
      bigDuneNoise,
      duneDetailNoise,
      rockMaskNoise
    }) {
      const bigDunes = bigDuneNoise * 8;
      const duneDetail = duneDetailNoise * 2;
      const rockMask = Math.max(0, rockMaskNoise - 0.75);
      const rockFormations = rockMask * 25;

      return BASE_LAND_Y
        + continentalMask * 4
        + bigDunes
        + duneDetail
        + rockFormations;
    },
  };

  window.DesertTerrain = DesertTerrain;
})();
