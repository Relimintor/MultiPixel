(function () {
  const DesertTerrain = {
    meta: {
      terrainKey: 'desert',
      name: 'Desert',
      aliases: ['desert'],
      villageKey: 'desert',
      treeEligible: false,
      treeSpawnChance: 0,
      treeDensityKey: 'Plains',
      climateTarget: { temp: 0.09, humidity: -0.12, continentalness: 0.18, erosion: 0.08, weirdness: 0.06 },
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

      // 🌊 Large cinematic dune waves
      const bigDunes = bigDuneNoise * 8;

      // 🏜 Medium dune ridges (subtle)
      const duneDetail = duneDetailNoise * 2;

      // 🪨 Rare dramatic rock formations
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
