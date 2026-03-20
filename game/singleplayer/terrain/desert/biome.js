(function () {
  const DesertTerrain = {
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
